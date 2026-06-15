import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { DOC_TYPES } from '../lib/constants'

// Links stay valid for 7 days so the attorney has time to open the email
// and download before they expire.
const LINK_TTL_SECONDS = 7 * 24 * 60 * 60

export default function SendToAttorney() {
  const { currentEstate, role } = useEstate()
  const [docs, setDocs] = useState([])
  const [attorneys, setAttorneys] = useState([])
  const [selected, setSelected] = useState({}) // { [docId]: true }
  const [recipient, setRecipient] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    setLoading(true)
    const [docsRes, contactsRes, historyRes] = await Promise.all([
      supabase.from('estate_documents').select('*').eq('estate_id', currentEstate.id).eq('have', true).order('name'),
      supabase.from('estate_contacts').select('name, role, emails, email_labels')
        .or(`estate_id.eq.${currentEstate.id},shared_with.cs.{${currentEstate.id}}`)
        .eq('role', 'attorney'),
      supabase.from('attorney_document_sends').select('*').eq('estate_id', currentEstate.id).order('sent_at', { ascending: false }),
    ])
    setDocs(docsRes.data ?? [])
    setHistory(historyRes.data ?? [])
    // Flatten attorney contacts to one entry per email address, and collect any
    // "Assistant"-labeled emails to default into the CC line.
    const opts = []
    const assistants = []
    for (const c of contactsRes.data ?? []) {
      ;(c.emails ?? []).forEach((email, i) => {
        const e = email?.trim()
        if (!e) return
        if ((c.email_labels?.[i] || '').toLowerCase() === 'assistant') assistants.push(e)
        else opts.push({ email: e, name: c.name })
      })
    }
    setAttorneys(opts)
    if (opts.length) setRecipient(opts[0].email)
    if (assistants.length) setCc([...new Set(assistants)].join(', '))
    setLoading(false)
  }

  const sendable = useMemo(() => docs.filter(d => d.file_path), [docs])
  const unsendable = useMemo(() => docs.filter(d => !d.file_path), [docs])
  const selectedDocs = sendable.filter(d => selected[d.id])

  function toggle(id) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }))
  }
  function selectAll() {
    setSelected(Object.fromEntries(sendable.map(d => [d.id, true])))
  }
  function clearAll() {
    setSelected({})
  }

  // Builds the email body with fresh signed download links for each selected doc.
  async function buildBody() {
    const paths = selectedDocs.map(d => d.file_path)
    const { data, error } = await supabase.storage.from('estate-documents').createSignedUrls(paths, LINK_TTL_SECONDS)
    if (error) throw error
    const byPath = Object.fromEntries((data ?? []).map(r => [r.path, r.signedUrl]))

    const lines = []
    lines.push(`Documents for the ${currentEstate.deceased_name} estate`)
    lines.push('')
    if (note.trim()) { lines.push(note.trim()); lines.push('') }
    selectedDocs.forEach((d, i) => {
      const url = byPath[d.file_path]
      lines.push(`${i + 1}. ${d.name} (${DOC_TYPES[d.doc_type] ?? d.doc_type})`)
      lines.push(`   ${url || '[link unavailable]'}`)
    })
    lines.push('')
    lines.push('These secure download links expire in 7 days. Let me know if you need them resent.')
    lines.push('')
    lines.push(`${currentEstate.administrator_name || ''}`)
    return lines.join('\n')
  }

  // Records that documents were sent. Logs the intent (we can't confirm the
  // email actually left your mail client). Best-effort: a logging failure
  // doesn't block the send.
  async function logSend() {
    const row = {
      estate_id: currentEstate.id,
      document_ids: selectedDocs.map(d => d.id),
      document_count: selectedDocs.length,
      document_names: selectedDocs.map(d => d.name).join(', '),
      sent_at: new Date().toISOString(),
      recipient_name: recipient || null,
      recipient_cc: cc.trim() || null,
      recipient_bcc: bcc.trim() || null,
    }
    const { data } = await supabase.from('attorney_document_sends').insert(row).select().single()
    if (data) setHistory(prev => [data, ...prev])
  }

  async function handleEmail() {
    if (!selectedDocs.length) return
    setBusy(true)
    try {
      const body = await buildBody()
      const subject = encodeURIComponent(`Documents — ${currentEstate.deceased_name} Estate`)
      const to = encodeURIComponent(recipient || '')
      const params = [`subject=${subject}`, `body=${encodeURIComponent(body)}`]
      if (cc.trim()) params.unshift(`cc=${encodeURIComponent(cc.trim())}`)
      if (bcc.trim()) params.unshift(`bcc=${encodeURIComponent(bcc.trim())}`)
      try { await logSend() } catch { /* logging is best-effort */ }
      window.location.href = `mailto:${to}?${params.join('&')}`
    } catch (e) {
      alert(`Couldn't generate the document links: ${e.message}`)
    }
    setBusy(false)
  }

  async function handleCopy() {
    if (!selectedDocs.length) return
    setBusy(true)
    try {
      const body = await buildBody()
      await navigator.clipboard.writeText(body)
      try { await logSend() } catch { /* logging is best-effort */ }
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch (e) {
      alert(`Couldn't copy the links: ${e.message}`)
    }
    setBusy(false)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">This tool is available to the executor only.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-1">Send Documents to Attorney</h1>
        <p className="text-gray-600 dark:text-gray-400">Pick the documents on file, and we'll build a pre-addressed email with secure download links.</p>
      </div>

      {/* Recipient */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Send to</label>
        {attorneys.length > 0 ? (
          <select
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none mb-2"
          >
            {attorneys.map(a => <option key={a.email} value={a.email}>{a.name} — {a.email}</option>)}
            <option value="">Other (type below)</option>
          </select>
        ) : (
          <p className="text-xs text-gray-400 mb-2">No attorney email found in Contacts — type one below.</p>
        )}
        <input
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          placeholder="attorney@example.com"
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">CC</label>
            <input
              value={cc}
              onChange={e => setCc(e.target.value)}
              placeholder="assistant@example.com"
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">BCC</label>
            <input
              value={bcc}
              onChange={e => setBcc(e.target.value)}
              placeholder="(optional)"
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">Separate multiple addresses with commas. CC is pre-filled from any attorney assistant in Contacts.</p>
      </div>

      {/* Document picker */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documents on file</h2>
          {sendable.length > 0 && (
            <div className="flex gap-3 text-xs">
              <button onClick={selectAll} className="text-blue-600 hover:underline">Select all</button>
              <button onClick={clearAll} className="text-gray-500 hover:underline">Clear</button>
            </div>
          )}
        </div>

        {sendable.length === 0 && (
          <p className="text-sm text-gray-400">No uploaded files yet. Upload a file to a document on the Documents page first.</p>
        )}

        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {sendable.map(d => (
            <label key={d.id} className="flex items-start gap-3 py-2.5 cursor-pointer">
              <input type="checkbox" checked={!!selected[d.id]} onChange={() => toggle(d.id)} className="mt-1" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-800 dark:text-white">{d.name}</span>
                <span className="ml-2 text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">{DOC_TYPES[d.doc_type] ?? d.doc_type}</span>
              </div>
            </label>
          ))}
        </div>

        {unsendable.length > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            {unsendable.length} document{unsendable.length > 1 ? 's are' : ' is'} marked "have it" but ha{unsendable.length > 1 ? 've' : 's'} no uploaded file, so {unsendable.length > 1 ? 'they' : 'it'} can't be sent. Upload the file on the Documents page to include {unsendable.length > 1 ? 'them' : 'it'}.
          </p>
        )}
      </div>

      {/* Optional note */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-5">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Message (optional)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder="Add a short note for the attorney..."
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleEmail}
          disabled={busy || !selectedDocs.length}
          className="flex-1 px-4 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          {busy ? 'Preparing links...' : `Open email${selectedDocs.length ? ` (${selectedDocs.length})` : ''}`}
        </button>
        <button
          onClick={handleCopy}
          disabled={busy || !selectedDocs.length}
          className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          {copied ? '✓ Links copied' : 'Copy links'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Email opens your mail app with the recipient, subject, and download links filled in. Secure links expire in 7 days.
      </p>

      {/* Send history */}
      {history.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mt-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Send history</h2>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map(h => (
              <div key={h.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800 dark:text-white">
                    {h.document_count} document{h.document_count !== 1 ? 's' : ''} → {h.recipient_name || 'recipient'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {new Date(h.sent_at).toLocaleDateString()} {new Date(h.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {(h.recipient_cc || h.recipient_bcc) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {h.recipient_cc && <span>cc: {h.recipient_cc}</span>}
                    {h.recipient_cc && h.recipient_bcc && <span> · </span>}
                    {h.recipient_bcc && <span>bcc: {h.recipient_bcc}</span>}
                  </p>
                )}
                {h.document_names && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{h.document_names}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
