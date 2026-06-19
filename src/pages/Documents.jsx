import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { DOC_TYPES } from '../lib/constants'

export default function Documents() {
  const { currentEstate, role, estates } = useEstate()
  const canDelete = isFullAccess(role)
  // Executor + collaborator can rename; heirs/observers can't (matches RLS).
  const canEdit = isFullAccess(role) || role === 'collaborator'
  const otherEstates = (estates ?? []).filter(e => e.id !== currentEstate?.id)
  const [docs, setDocs] = useState([])
  const [tab, setTab] = useState('have')
  const [adding, setAdding] = useState(false)
  const [addingRequested, setAddingRequested] = useState(false)
  const [form, setForm] = useState({ name: '', doc_type: 'legal', have: false, requested: false, requested_from: '', notes: '' })
  const [uploading, setUploading] = useState(null)
  const [renaming, setRenaming] = useState(null)   // doc id being renamed
  const [renameVal, setRenameVal] = useState('')
  const [movingDoc, setMovingDoc] = useState(null) // doc id being moved
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const { data } = await supabase.from('estate_documents').select('*').eq('estate_id', currentEstate.id).order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }

  function openAdd() {
    // Default the flags to match the tab you're on, so adding here behaves as expected.
    setForm({ name: '', doc_type: 'legal', have: tab === 'have', requested: tab === 'requested', requested_from: '', notes: '' })
    setAdding(true)
  }

  async function addDoc() {
    if (!form.name) return
    const { data } = await supabase.from('estate_documents').insert({ ...form, estate_id: currentEstate.id }).select().single()
    if (data) {
      setDocs(prev => [data, ...prev])
      // A needed or attorney-requested document spawns a task to obtain/provide it.
      if (data.requested || !data.have) {
        const text = data.requested
          ? `Send to ${data.requested_from || 'attorney'}: ${data.name}`
          : `Obtain document: ${data.name}`
        const { data: sec } = await supabase.from('estate_sections')
          .select('id').eq('estate_id', currentEstate.id).eq('label', 'Phase 1 — Immediate').maybeSingle()
        const { data: task } = await supabase.from('estate_tasks').insert({
          estate_id: currentEstate.id, section_id: sec?.id ?? null, text,
          status: 'pending', tag: data.requested ? 'attorney request' : 'needed doc',
          detail: 'Auto-created from a document. Mark the document "Have it" once you obtain it.',
        }).select('id').single()
        if (task) {
          await supabase.from('estate_task_documents').upsert({ estate_id: currentEstate.id, task_id: task.id, document_id: data.id }, { onConflict: 'task_id,document_id' })
          await supabase.from('estate_documents').update({ linked_task_id: task.id }).eq('id', data.id)
        }
      }
      // Jump to the tab where the new doc actually lives, so it's visible.
      setTab(data.requested ? 'requested' : data.have ? 'have' : 'need')
    }
    setAdding(false)
    setForm({ name: '', doc_type: 'legal', have: false, requested: false, requested_from: '', notes: '' })
  }

  async function uploadFile(doc, file) {
    if (!file) return
    setUploading(doc.id)
    const path = `${currentEstate.id}/${doc.doc_type}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('estate-documents').upload(path, file)
    if (!error) {
      await supabase.from('estate_documents').update({ file_path: path, have: true }).eq('id', doc.id)
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, file_path: path, have: true } : d))
    }
    setUploading(null)
  }

  function startRename(doc) {
    setRenaming(doc.id)
    setRenameVal(doc.name)
  }

  async function saveRename(doc) {
    const name = renameVal.trim()
    if (!name || name === doc.name) { setRenaming(null); return }
    await supabase.from('estate_documents').update({ name }).eq('id', doc.id)
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, name } : d))
    setRenaming(null)
  }

  async function getUrl(doc) {
    if (!doc.file_path) return
    const { data } = await supabase.storage.from('estate-documents').createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  // Move a document to another estate. The stored file stays where it is (View
  // uses its path directly), but its estate ownership and any task links here
  // are cleared so it cleanly belongs to the target estate.
  async function moveDoc(doc, targetEstateId) {
    if (!targetEstateId) return
    const { error } = await supabase.from('estate_documents')
      .update({ estate_id: targetEstateId, linked_task_id: null })
      .eq('id', doc.id)
    if (error) { alert(`Couldn't move: ${error.message}`); return }
    // Drop any task links in the old estate (tasks don't move with the doc).
    try { await supabase.from('estate_task_documents').delete().eq('document_id', doc.id) } catch { /* ignore */ }
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    setMovingDoc(null)
    const name = otherEstates.find(e => e.id === targetEstateId)?.deceased_name ?? 'the other estate'
    alert(`Moved "${doc.name}" to ${name}.`)
  }

  async function deleteDoc(doc) {
    if (!confirm(`Delete "${doc.name}"? This removes it from this estate's document list. This can't be undone.`)) return
    const { error } = await supabase.from('estate_documents').delete().eq('id', doc.id)
    if (error) { alert(`Couldn't delete: ${error.message}`); return }
    // Purge the underlying file from storage (best-effort)
    if (doc.file_path) { try { await supabase.storage.from('estate-documents').remove([doc.file_path]) } catch { /* ignore */ } }
    setDocs(prev => prev.filter(d => d.id !== doc.id))
  }

  // One document row (extracted so it can be reused under each type group).
  const renderDocRow = doc => (
    <div key={doc.id} className="px-4 py-3 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        {renaming === doc.id ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input value={renameVal} autoFocus
              onChange={e => setRenameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(doc); if (e.key === 'Escape') setRenaming(null) }}
              className="flex-1 min-w-0 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" />
            <button onClick={() => saveRename(doc)} className="text-xs px-2 py-1 bg-gray-900 text-white rounded-lg">Save</button>
            <button onClick={() => setRenaming(null)} className="text-xs px-2 py-1 text-gray-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 dark:text-white">{doc.name}</span>
            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">{DOC_TYPES[doc.doc_type] ?? doc.doc_type}</span>
            {doc.requested && <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Requested from {doc.requested_from}</span>}
          </div>
        )}
        {doc.notes && <div className="text-xs text-gray-500 mt-0.5">{doc.notes}</div>}
        {movingDoc === doc.id && (
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <span className="text-xs text-gray-500">Move to:</span>
            <select defaultValue="" onChange={e => moveDoc(doc, e.target.value)}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none">
              <option value="" disabled>Choose an estate…</option>
              {otherEstates.map(e => <option key={e.id} value={e.id}>{e.deceased_name}</option>)}
            </select>
            <button onClick={() => setMovingDoc(null)} className="text-xs px-2 py-1 text-gray-500 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {canEdit && renaming !== doc.id && (
          <button onClick={() => startRename(doc)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">Rename</button>
        )}
        {canDelete && renaming !== doc.id && movingDoc !== doc.id && otherEstates.length > 0 && (
          <button onClick={() => setMovingDoc(doc.id)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">Move</button>
        )}
        {doc.have && doc.file_path && (
          <button onClick={() => getUrl(doc)} className="text-xs text-blue-600 hover:underline">View</button>
        )}
        {canEdit && !doc.file_path && (
          <label className="text-xs text-blue-600 hover:underline cursor-pointer">
            {uploading === doc.id ? 'Uploading...' : 'Upload'}
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx"
              onChange={e => uploadFile(doc, e.target.files[0])} />
          </label>
        )}
        {canDelete && renaming !== doc.id && (
          <button onClick={() => deleteDoc(doc)} className="text-xs text-red-500 hover:text-red-700 hover:underline">Delete</button>
        )}
      </div>
    </div>
  )

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const haveDocs = docs.filter(d => d.have)
  const needDocs = docs.filter(d => !d.have && !d.requested)
  const requestedDocs = docs.filter(d => d.requested)
  const typeLabel = t => DOC_TYPES[t] ?? (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Other')
  const TYPE_ORDER = Object.keys(DOC_TYPES)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Documents</h1>
        {canEdit && <button onClick={openAdd} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">+ Add document</button>}
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { key: 'have', label: `Have (${haveDocs.length})` },
          { key: 'requested', label: `Requested by Attorney (${requestedDocs.length})` },
          { key: 'need', label: `Need (${needDocs.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-gray-900 text-white dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <input
        placeholder="Search documents..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 mb-4"
      />

      {adding && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Document name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Type</label>
              <select value={form.doc_type} onChange={e => setForm(p => ({ ...p, doc_type: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={form.have} onChange={e => setForm(p => ({ ...p, have: e.target.checked }))} />
              Have it
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={form.requested} onChange={e => setForm(p => ({ ...p, requested: e.target.checked }))} />
              Requested
            </label>
          </div>
          {form.requested && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Requested from</label>
              <input value={form.requested_from} onChange={e => setForm(p => ({ ...p, requested_from: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
          )}
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notes..." rows={2}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={addDoc} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Save</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
          </div>
        </div>
      )}

      {(() => {
        const base = tab === 'have' ? haveDocs : tab === 'requested' ? requestedDocs : needDocs
        const q = search.trim().toLowerCase()
        const filtered = q
          ? base.filter(d => d.name.toLowerCase().includes(q) || (d.notes ?? '').toLowerCase().includes(q) || typeLabel(d.doc_type).toLowerCase().includes(q))
          : base
        if (filtered.length === 0) {
          return <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-sm text-gray-400">
            {q ? 'No documents match your search.' : 'No documents in this category.'}
          </div>
        }
        // Group by type, ordered by the canonical type list, unknown types last.
        const groups = {}
        for (const d of filtered) (groups[d.doc_type || 'other'] ||= []).push(d)
        const types = Object.keys(groups).sort((a, b) => {
          const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b)
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
        })
        return (
          <div className="space-y-4">
            {types.map(type => (
              <div key={type} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-800 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {typeLabel(type)} <span className="text-gray-400">({groups[type].length})</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {groups[type].map(renderDocRow)}
                </div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
