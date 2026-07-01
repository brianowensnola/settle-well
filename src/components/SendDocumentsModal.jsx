import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DOC_TYPES } from '../lib/constants'
import { buildDocumentSend } from '../lib/sendDocuments'

const inputCls = 'w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none'

// In-place "Send documents" panel — usable anywhere (contact card, etc.) so the
// action works where you are instead of jumping to the Communications page.
export default function SendDocumentsModal({ estateId, estateName, defaultTo = '', onClose, onSent }) {
  const [docs, setDocs] = useState([])
  const [sel, setSel] = useState({})
  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!estateId) return
    supabase.from('estate_documents').select('*').eq('estate_id', estateId).eq('have', true).order('name')
      .then(({ data }) => { setDocs((data ?? []).filter(d => d.file_path)); setLoading(false) })
  }, [estateId])

  const chosen = docs.filter(d => sel[d.id])

  async function send() {
    setBusy(true); setMsg('')
    try {
      const { mailtoHref, interaction } = await buildDocumentSend({ estateId, estateName, to, docs: chosen, note, cc, bcc })
      onSent?.(interaction)
      window.location.href = mailtoHref
      onClose?.()
    } catch (e) { setMsg(e.message || 'Could not prepare the email.') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[88vh] overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">📎 Send documents</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <label className="text-xs text-gray-500 block mb-1">To</label>
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com" className={`${inputCls} mb-2`} />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={cc} onChange={e => setCc(e.target.value)} placeholder="Cc (optional)" className={inputCls} />
          <input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="Bcc (optional)" className={inputCls} />
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Note (optional)" className={`${inputCls} mb-2`} />

        <label className="text-xs text-gray-500 block mb-1">Documents</label>
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 max-h-52 overflow-y-auto mb-2">
          {loading ? <div className="p-3 text-sm text-gray-400">Loading…</div>
            : docs.length === 0 ? <div className="p-3 text-sm text-gray-400">No documents with files on this estate yet.</div>
            : docs.map(d => (
              <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={!!sel[d.id]} onChange={e => setSel(s => ({ ...s, [d.id]: e.target.checked }))} />
                <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{d.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{DOC_TYPES[d.doc_type] ?? d.doc_type}</span>
              </label>
            ))}
        </div>

        {msg && <div className="text-xs text-red-600 dark:text-red-400 mb-2">{msg}</div>}
        <div className="flex gap-2">
          <button onClick={send} disabled={busy || !to.trim() || chosen.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
            {busy ? 'Preparing…' : `Send ${chosen.length || ''} document${chosen.length !== 1 ? 's' : ''}`}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Opens your email with secure 7-day download links, and logs it to Communications.</p>
      </div>
    </div>
  )
}
