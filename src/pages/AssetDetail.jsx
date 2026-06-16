import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { ASSET_TYPE_LABELS, ASSET_DOC_CHECKLIST } from '../lib/assetTypes'

const DISPOSITIONS = ['undecided', 'keep', 'sell', 'transfer', 'gift', 'sold', 'distributed']
const PHASE_FOR_TYPE = {
  vehicle: 'Phase 6 — Real Estate & Property', real_estate: 'Phase 6 — Real Estate & Property',
  personal: 'Phase 6 — Real Estate & Property', business: 'Phase 8 — Business Interests',
  financial: 'Phase 4 — Financial Accounts', other: 'Phase 11 — Commonly Missed Items',
}
const fmt = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const inputCls = 'w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none'

export default function AssetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role } = useEstate()
  const [asset, setAsset] = useState(null)
  const [docs, setDocs] = useState([])
  const [available, setAvailable] = useState([]) // unlinked docs that could be attached
  const [tasks, setTasks] = useState([])
  const [edit, setEdit] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState(null) // last AI extraction result for the review banner
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const { data: a } = await supabase.from('estate_financials').select('*').eq('id', id).maybeSingle()
    setAsset(a)
    if (a) {
      setEdit({
        name: a.name ?? '', asset_type: a.asset_type ?? 'other', amount: a.amount ?? '',
        valuation_date: a.valuation_date ?? '', valuation_source: a.valuation_source ?? '',
        vin_serial: a.vin_serial ?? '', location: a.location ?? '', condition: a.condition ?? '',
        lender: a.lender ?? '', status: a.status ?? 'undecided', beneficiary: a.beneficiary ?? '',
        notes: a.notes ?? '', is_private: !!a.is_private,
      })
      const [docRes, taskRes, availRes] = await Promise.all([
        supabase.from('estate_documents').select('*').eq('asset_id', a.id),
        supabase.from('estate_tasks').select('id, text, status').eq('linked_financial_id', a.id),
        supabase.from('estate_documents').select('id, name, doc_type').eq('estate_id', a.estate_id).is('asset_id', null).order('name'),
      ])
      setDocs(docRes.data ?? [])
      setTasks(taskRes.data ?? [])
      setAvailable(availRes.data ?? [])
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const patch = {
      ...edit,
      amount: edit.amount === '' ? null : Number(edit.amount),
      valuation_date: edit.valuation_date || null,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('estate_financials').update(patch).eq('id', id)
    setAsset(prev => ({ ...prev, ...patch }))
    setSaving(false)
  }

  // Add a checklist item as a "needed" document linked to this asset + obtain task.
  async function addNeeded(item) {
    const { data: doc } = await supabase.from('estate_documents').insert({
      estate_id: asset.estate_id, name: item.label, doc_type: item.doc_type,
      have: false, requested: false, asset_id: asset.id, notes: `Needed for: ${asset.name}`,
    }).select().single()
    const phase = PHASE_FOR_TYPE[asset.asset_type] || 'Phase 11 — Commonly Missed Items'
    const { data: sec } = await supabase.from('estate_sections').select('id').eq('estate_id', asset.estate_id).eq('label', phase).maybeSingle()
    const { data: task } = await supabase.from('estate_tasks').insert({
      estate_id: asset.estate_id, section_id: sec?.id ?? null,
      text: `Obtain ${item.label} — ${asset.name}`, tag: 'needed doc', status: 'pending',
      detail: 'Auto-created from the asset document checklist.',
    }).select('id, text, status').single()
    if (task && doc) {
      await supabase.from('estate_task_documents').upsert({ estate_id: asset.estate_id, task_id: task.id, document_id: doc.id }, { onConflict: 'task_id,document_id' })
      await supabase.from('estate_documents').update({ linked_task_id: task.id }).eq('id', doc.id)
      setTasks(prev => [...prev, task])
    }
    if (doc) setDocs(prev => [...prev, doc])
  }

  async function linkExisting(docId) {
    if (!docId) return
    await supabase.from('estate_documents').update({ asset_id: asset.id }).eq('id', docId)
    const moved = available.find(d => d.id === docId)
    setAvailable(prev => prev.filter(d => d.id !== docId))
    if (moved) setDocs(prev => [...prev, { ...moved, asset_id: asset.id }])
    load() // refresh have/need flags
  }

  async function unlink(doc) {
    await supabase.from('estate_documents').update({ asset_id: null }).eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    setAvailable(prev => [...prev, doc])
  }

  async function uploadFile(doc, file) {
    if (!file) return
    setUploading(doc.id)
    const path = `${asset.estate_id}/${doc.doc_type}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('estate-documents').upload(path, file)
    if (!error) {
      await supabase.from('estate_documents').update({ file_path: path, have: true }).eq('id', doc.id)
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, file_path: path, have: true } : d))
      setUploading(null)
      aiExtract({ ...doc, file_path: path }) // auto-read the document with AI
      return
    }
    setUploading(null)
  }

  // Read a document with AI and pre-fill blank asset fields (review before saving).
  async function aiExtract(doc) {
    if (!doc.file_path) return
    setAiBusy(true); setAiNote(null)
    try {
      const { data: sess } = await supabase.auth.getSession()
      const resp = await fetch('/.netlify/functions/extract-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess?.session?.access_token}` },
        body: JSON.stringify({ estateId: asset.estate_id, filePath: doc.file_path, assetType: edit.asset_type }),
      })
      if (!resp.ok) throw new Error('extract failed')
      const f = await resp.json()
      setEdit(p => ({
        ...p,
        vin_serial: p.vin_serial || f.vin_serial || '',
        amount: (p.amount === '' || p.amount == null) && f.amount != null ? f.amount : p.amount,
        // Only replace the name if it's empty or a placeholder.
        name: (!p.name || /tbd|#\d|unknown/i.test(p.name)) && f.name ? f.name : p.name,
      }))
      setAiNote(f)
    } catch { /* best-effort */ }
    setAiBusy(false)
  }

  async function viewDoc(doc) {
    if (!doc.file_path) return
    const { data } = await supabase.storage.from('estate-documents').createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!asset) return <div className="p-8 text-gray-400">Asset not found.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Asset management is available to the executor only.</div>

  const checklist = ASSET_DOC_CHECKLIST[edit.asset_type] || []
  const docByLabel = label => docs.find(d => d.name.toLowerCase() === label.toLowerCase())
  const set = (k, v) => setEdit(p => ({ ...p, [k]: v }))

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <button onClick={() => navigate('/assets')} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3">← All assets</button>
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-4">{asset.name}</h1>

      {(aiBusy || aiNote) && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300 rounded-lg p-3 mb-3 text-sm">
          {aiBusy ? '✨ Reading the document…'
            : `✨ AI read ${aiNote?.doc_kind || 'the document'}${aiNote?.name ? ` — “${aiNote.name}”` : ''}. Filled blank fields below — review and Save.`}
        </div>
      )}

      {/* Details */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Name</label>
            <input value={edit.name} onChange={e => set('name', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Type</label>
            <select value={edit.asset_type} onChange={e => set('asset_type', e.target.value)} className={inputCls}>
              {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Estimated value</label>
            <input type="number" value={edit.amount} onChange={e => set('amount', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Valuation date</label>
            <input type="date" value={edit.valuation_date} onChange={e => set('valuation_date', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Valuation source</label>
            <input value={edit.valuation_source} onChange={e => set('valuation_source', e.target.value)} placeholder="KBB, appraisal, CAD…" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">VIN / serial #</label>
            <input value={edit.vin_serial} onChange={e => set('vin_serial', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Location</label>
            <input value={edit.location} onChange={e => set('location', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Condition</label>
            <input value={edit.condition} onChange={e => set('condition', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Lienholder / loan</label>
            <input value={edit.lender} onChange={e => set('lender', e.target.value)} placeholder="e.g. on loan — Truist" className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Disposition</label>
            <select value={edit.status} onChange={e => set('status', e.target.value)} className={`${inputCls} capitalize`}>
              {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Beneficiary (keep/gift/transfer)</label>
            <input value={edit.beneficiary} onChange={e => set('beneficiary', e.target.value)} placeholder="who keeps / receives it" className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Notes</label>
            <textarea value={edit.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={edit.is_private} onChange={e => set('is_private', e.target.checked)} />
          Private — hide from heirs' transparency report
        </label>
        <button onClick={save} disabled={saving} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Document checklist */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Documents</h2>
        {checklist.length > 0 && (
          <div className="space-y-1.5 mb-4">
            <div className="text-xs text-gray-400 uppercase tracking-wider">Standard for {ASSET_TYPE_LABELS[edit.asset_type] ?? 'asset'}</div>
            {checklist.map(item => {
              const d = docByLabel(item.label)
              return (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {d?.have ? <span className="text-green-600">✓</span> : d ? <span className="text-amber-500">⏳</span> : <span className="text-gray-300">○</span>}
                    <span className={d?.have ? 'text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'}>{item.label}</span>
                  </span>
                  {d?.have && d.file_path ? <button onClick={() => viewDoc(d)} className="text-xs text-blue-600 hover:underline">View</button>
                    : d ? <label className="text-xs text-blue-600 hover:underline cursor-pointer">{uploading === d.id ? 'Uploading…' : 'Upload'}<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx" onChange={e => uploadFile(d, e.target.files[0])} /></label>
                    : <button onClick={() => addNeeded(item)} className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:underline">+ Add as needed</button>}
                </div>
              )
            })}
          </div>
        )}

        {/* Linked documents (incl. non-checklist) */}
        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Attached to this asset</div>
        {docs.length === 0 && <div className="text-sm text-gray-400 mb-2">No documents linked yet.</div>}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {docs.map(d => (
            <div key={d.id} className="flex items-center justify-between py-2 text-sm">
              <span className="flex items-center gap-2 min-w-0">
                <span className={d.have ? 'text-green-600' : 'text-amber-500'}>{d.have ? '✓' : '⏳'}</span>
                <span className="truncate text-gray-700 dark:text-gray-300">{d.name}</span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                {d.file_path && <button onClick={() => aiExtract(d)} disabled={aiBusy} className="text-xs text-purple-600 hover:underline disabled:opacity-50">✨ AI fill</button>}
                {d.have && d.file_path ? <button onClick={() => viewDoc(d)} className="text-xs text-blue-600 hover:underline">View</button>
                  : <label className="text-xs text-blue-600 hover:underline cursor-pointer">{uploading === d.id ? 'Uploading…' : 'Upload'}<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx" onChange={e => uploadFile(d, e.target.files[0])} /></label>}
                <button onClick={() => unlink(d)} className="text-xs text-gray-400 hover:text-red-500 hover:underline">Unlink</button>
              </span>
            </div>
          ))}
        </div>

        {/* Link an existing document */}
        {available.length > 0 && (
          <div className="mt-3">
            <select defaultValue="" onChange={e => { linkExisting(e.target.value); e.target.value = '' }} className={`${inputCls} text-xs`}>
              <option value="" disabled>+ Link an existing document…</option>
              {available.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Linked tasks */}
      {tasks.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Linked tasks</h2>
          <div className="space-y-1">
            {tasks.map(t => (
              <Link key={t.id} to={`/tasks/${t.id}`} className="block text-sm text-blue-600 hover:underline">
                • {t.text} {t.status === 'done' ? '✓' : `(${t.status})`}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
