import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { DOC_TYPES } from '../lib/constants'

export default function Documents() {
  const { currentEstate } = useEstate()
  const [docs, setDocs] = useState([])
  const [tab, setTab] = useState('have')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', doc_type: 'legal', have: false, requested: false, requested_from: '', notes: '' })
  const [uploading, setUploading] = useState(null)
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

  async function addDoc() {
    if (!form.name) return
    const { data } = await supabase.from('estate_documents').insert({ ...form, estate_id: currentEstate.id }).select().single()
    if (data) setDocs(prev => [data, ...prev])
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

  async function getUrl(doc) {
    if (!doc.file_path) return
    const { data } = await supabase.storage.from('estate-documents').createSignedUrl(doc.file_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const haveDocs = docs.filter(d => d.have)
  const needDocs = docs.filter(d => !d.have)

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
        <button onClick={() => setAdding(true)} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">+ Add document</button>
      </div>

      <div className="flex gap-2 mb-5">
        {['have', 'need'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t === 'have' ? `Have (${haveDocs.length})` : `Need (${needDocs.length})`}
          </button>
        ))}
      </div>

      {adding && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Document name</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Type</label>
              <select value={form.doc_type} onChange={e => setForm(p => ({ ...p, doc_type: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.have} onChange={e => setForm(p => ({ ...p, have: e.target.checked }))} />
              Have it
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.requested} onChange={e => setForm(p => ({ ...p, requested: e.target.checked }))} />
              Requested
            </label>
          </div>
          {form.requested && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Requested from</label>
              <input value={form.requested_from} onChange={e => setForm(p => ({ ...p, requested_from: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
          )}
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notes..." rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={addDoc} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Save</button>
            <button onClick={() => setAdding(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {(tab === 'have' ? haveDocs : needDocs).length === 0 && (
          <div className="p-6 text-sm text-gray-400">No documents in this category.</div>
        )}
        <div className="divide-y divide-gray-100">
          {(tab === 'have' ? haveDocs : needDocs).map(doc => (
            <div key={doc.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{doc.name}</span>
                  <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{DOC_TYPES[doc.doc_type] ?? doc.doc_type}</span>
                  {doc.requested && <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Requested from {doc.requested_from}</span>}
                </div>
                {doc.notes && <div className="text-xs text-gray-500 mt-0.5">{doc.notes}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {doc.have && doc.file_path && (
                  <button onClick={() => getUrl(doc)} className="text-xs text-blue-600 hover:underline">View</button>
                )}
                {!doc.file_path && (
                  <label className="text-xs text-blue-600 hover:underline cursor-pointer">
                    {uploading === doc.id ? 'Uploading...' : 'Upload'}
                    <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx"
                      onChange={e => uploadFile(doc, e.target.files[0])} />
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
