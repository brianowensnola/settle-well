import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DOC_TYPES } from '../lib/constants'
import { EMAIL_INTENTS, draftEmail, sendEstateEmail } from '../lib/communications'

const inputCls = 'w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none'

// In-place "Compose email" panel — usable anywhere (contact card, etc.) so the
// action works where you are instead of jumping to the Communications page.
// Sends through the app (Brevo), captured on the contact's timeline. Returns the
// logged interaction via onSent so the caller can prepend it to its list.
export default function ComposeEmailModal({ estateId, contactId, contactName, contactRole, defaultTo = '', onClose, onSent }) {
  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [intent, setIntent] = useState('general')
  const [instruction, setInstruction] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [docs, setDocs] = useState([])
  const [docIds, setDocIds] = useState([])
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!estateId) return
    supabase.from('estate_documents').select('id, name, doc_type, file_path').eq('estate_id', estateId).eq('have', true).not('file_path', 'is', null).order('name')
      .then(({ data }) => setDocs(data ?? []))
  }, [estateId])

  async function draftIt() {
    setDrafting(true); setMsg('')
    try {
      const r = await draftEmail({ estateId, contactName, contactRole, intent, instruction })
      setSubject(s => r.subject || s)
      setBody(b => r.body || b)
    } catch (e) { setMsg(e.message || 'Could not draft the email') }
    finally { setDrafting(false) }
  }

  async function send() {
    if (!to.trim() || !subject.trim() || !body.trim()) { setMsg('Add a recipient, subject, and body (or draft with AI).'); return }
    setBusy(true); setMsg('')
    try {
      const { interaction } = await sendEstateEmail({ estateId, contactId, to: to.trim(), cc, bcc, subject, body, isPrivate, docIds })
      onSent?.(interaction)
      onClose?.()
    } catch (e) { setMsg(e.message || 'Could not send the email.') }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">✉️ Compose email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        <label className="text-xs text-gray-500 block mb-1">To</label>
        <input value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@email.com" className={`${inputCls} mb-2`} />
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={cc} onChange={e => setCc(e.target.value)} placeholder="Cc (optional)" className={inputCls} />
          <input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="Bcc (optional)" className={inputCls} />
        </div>

        {/* AI draft */}
        <div className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 mb-2 bg-gray-50 dark:bg-gray-800/40">
          <select value={intent} onChange={e => setIntent(e.target.value)} className={`${inputCls} mb-2`}>
            {EMAIL_INTENTS.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
          </select>
          <input value={instruction} onChange={e => setInstruction(e.target.value)}
            placeholder="Anything specific to include? (account #, what you're asking for, deadline…)"
            className={`${inputCls} mb-2`} />
          <button onClick={draftIt} disabled={drafting}
            className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-sm hover:bg-blue-100 disabled:opacity-50">
            {drafting ? 'Drafting…' : '🤖 Draft with AI'}
          </button>
        </div>

        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" className={`${inputCls} mb-2`} />
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={9}
          placeholder="Write the email, or use Draft with AI above and edit here…"
          className={`${inputCls} font-serif leading-relaxed mb-2`} />

        {docs.length > 0 && (
          <details className="border border-gray-200 dark:border-gray-800 rounded-lg mb-2">
            <summary className="cursor-pointer px-3 py-2 text-sm text-gray-600 dark:text-gray-300 select-none">📎 Attach documents{docIds.length ? ` (${docIds.length})` : ''}</summary>
            <div className="px-3 pb-2 max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
              {docs.map(d => (
                <label key={d.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={docIds.includes(d.id)}
                    onChange={e => setDocIds(cur => e.target.checked ? [...cur, d.id] : cur.filter(x => x !== d.id))} />
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{d.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{DOC_TYPES[d.doc_type] ?? d.doc_type}</span>
                </label>
              ))}
            </div>
          </details>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
          <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
          Executor-only (hide from the heir transparency view)
        </label>

        {msg && <div className="text-xs text-red-600 dark:text-red-400 mb-2">{msg}</div>}
        <div className="flex gap-2 items-center">
          <button onClick={send} disabled={busy || !to.trim() || !subject.trim() || !body.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
            {busy ? 'Sending…' : 'Send email'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Sent through the app · replies go to the estate inbox · logged automatically.</p>
      </div>
    </div>
  )
}
