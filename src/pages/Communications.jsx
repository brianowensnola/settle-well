import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { DOC_TYPES } from '../lib/constants'
import { CHANNELS, channelIcon, channelLabel, logCommunication, EMAIL_INTENTS, draftEmail, sendEstateEmail, estateInboxAddress, deleteCommunication } from '../lib/communications'

const LINK_TTL_SECONDS = 7 * 24 * 60 * 60
const todayStr = () => new Date().toISOString().slice(0, 10)
const whenStr = d => d ? new Date(d).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

// Append an email to a comma-separated list without duplicates.
const appendEmail = (val, email) => {
  const list = (val || '').split(',').map(s => s.trim()).filter(Boolean)
  if (email && !list.includes(email)) list.push(email)
  return list.join(', ')
}

// One hub for every communication across the family's estates: a single
// timeline (logged calls/emails/letters + meetings + document sends), with the
// actions that create them — log a communication, or send documents to anyone.
export default function Communications() {
  const { currentEstate, estates, role } = useEstate()
  const familyEstates = estates.filter(e =>
    currentEstate && (currentEstate.group_id ? e.group_id === currentEstate.group_id : e.id === currentEstate.id))
  const familyIds = familyEstates.length ? familyEstates.map(e => e.id) : (currentEstate ? [currentEstate.id] : [])
  const familyKey = familyIds.join(',')
  const estateName = id => estates.find(e => e.id === id)?.deceased_name ?? ''
  const multiEstate = familyEstates.length > 1

  const [contacts, setContacts] = useState([])
  const [interactions, setInteractions] = useState([])
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [fContact, setFContact] = useState('all')
  const [fChannel, setFChannel] = useState('all')
  const [fEstate, setFEstate] = useState('all')

  const [panel, setPanel] = useState(null) // 'log' | 'send' | 'compose' | null

  // Compose-email (AI-drafted) form
  const [cm, setCm] = useState({ contactId: '', intent: 'attorney_status', instruction: '', subject: '', body: '', cc: '', bcc: '', isPrivate: false })
  const [drafting, setDrafting] = useState(false)
  const [cmBusy, setCmBusy] = useState(false)
  const [cmMsg, setCmMsg] = useState('')

  // Log-communication form
  const [log, setLog] = useState({ contactId: '', channel: 'phone', direction: 'outbound', date: todayStr(), subject: '', summary: '' })

  // Send-documents form
  const [sEstate, setSEstate] = useState('')
  const [sContactId, setSContactId] = useState('')
  const [docs, setDocs] = useState([])
  const [sel, setSel] = useState({})
  const [note, setNote] = useState('')
  const [sCc, setSCc] = useState('')
  const [sBcc, setSBcc] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendMsg, setSendMsg] = useState('')

  useEffect(() => {
    if (familyIds.length) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEstate?.id, familyKey])

  async function loadAll() {
    setLoading(true)
    const [cRes, iRes, mRes] = await Promise.all([
      supabase.from('estate_contacts').select('id, name, role, emails, estate_id').in('estate_id', familyIds).order('name'),
      supabase.from('estate_contact_interactions').select('*').in('estate_id', familyIds).order('occurred_at', { ascending: false }),
      supabase.from('estate_meetings').select('*').in('estate_id', familyIds).order('scheduled_at', { ascending: false }),
    ])
    setContacts(cRes.data ?? [])
    setInteractions(iRes.data ?? [])
    setMeetings(mRes.data ?? [])
    setLoading(false)
  }

  const contactById = useMemo(() => Object.fromEntries(contacts.map(c => [c.id, c])), [contacts])
  const contactName = (cid, fallback) => contactById[cid]?.name || fallback || 'Unknown contact'

  // Merge interactions + meetings into one chronological feed.
  const events = useMemo(() => ([
    ...interactions.map(i => ({ key: `i-${i.id}`, type: 'comm', when: i.occurred_at || i.created_at, estateId: i.estate_id, contactId: i.contact_id, data: i })),
    ...meetings.map(m => ({ key: `m-${m.id}`, type: 'meeting', when: m.scheduled_at, estateId: m.estate_id, contactId: m.contact_id, data: m })),
  ].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))), [interactions, meetings])

  const q = search.toLowerCase()
  const filtered = events.filter(ev => {
    if (fContact !== 'all' && ev.contactId !== fContact) return false
    if (fEstate !== 'all' && ev.estateId !== fEstate) return false
    if (fChannel !== 'all' && !(ev.type === 'comm' && ev.data.channel === fChannel)) return false
    if (q) {
      const hay = [
        contactName(ev.contactId, ev.data.contact_name),
        ev.data.summary, ev.data.subject, ev.data.notes,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  // Inbound emails the app couldn't match to a contact — awaiting assignment.
  const unmatched = interactions.filter(i => i.source === 'inbound' && !i.contact_id)
  const contactsForEstate = eid => contacts.filter(c => c.estate_id === eid)

  async function submitLog() {
    if (!log.contactId || !log.summary.trim()) return
    const c = contactById[log.contactId]
    const data = await logCommunication({
      estateId: c?.estate_id || currentEstate.id,
      contactId: log.contactId,
      direction: log.direction, channel: log.channel,
      subject: log.subject, summary: log.summary, source: 'manual',
      occurredAt: log.date ? new Date(log.date + 'T12:00:00').toISOString() : null,
    })
    if (data) setInteractions(prev => [data, ...prev])
    setLog({ contactId: '', channel: 'phone', direction: 'outbound', date: todayStr(), subject: '', summary: '' })
    setPanel(null)
  }

  // ----- Compose an AI-drafted estate email -----
  const emailContacts = contacts.filter(c => (c.emails ?? []).some(Boolean))
  const cmContact = contactById[cm.contactId]
  const cmEmail = cmContact?.emails?.find(Boolean) || ''

  async function draftIt() {
    if (!cmContact) { setCmMsg('Pick who the email is going to first.'); return }
    setDrafting(true); setCmMsg('')
    try {
      const r = await draftEmail({
        estateId: cmContact.estate_id,
        contactName: cmContact.name,
        contactRole: cmContact.role,
        intent: cm.intent,
        instruction: cm.instruction,
      })
      setCm(p => ({ ...p, subject: r.subject || p.subject, body: r.body || p.body }))
    } catch (e) { setCmMsg(e.message || 'Could not draft the email') }
    finally { setDrafting(false) }
  }

  async function sendComposed() {
    if (!cmContact || !cmEmail) { setCmMsg('Pick a contact with an email.'); return }
    if (!cm.subject.trim() || !cm.body.trim()) { setCmMsg('Add a subject and body (or draft with AI).'); return }
    setCmBusy(true); setCmMsg('')
    try {
      const { interaction } = await sendEstateEmail({
        estateId: cmContact.estate_id, contactId: cm.contactId, to: cmEmail,
        cc: cm.cc, bcc: cm.bcc, subject: cm.subject, body: cm.body, isPrivate: cm.isPrivate,
      })
      if (interaction) setInteractions(prev => [interaction, ...prev])
      setCm({ contactId: '', intent: 'attorney_status', instruction: '', subject: '', body: '', cc: '', bcc: '', isPrivate: false })
      setPanel(null)
    } catch (e) { setCmMsg(e.message || 'Could not send the email') }
    finally { setCmBusy(false) }
  }

  // Permanently delete a logged/captured communication.
  async function removeComm(id) {
    if (!confirm('Delete this communication? This cannot be undone.')) return
    try {
      await deleteCommunication(id)
      setInteractions(prev => prev.filter(i => i.id !== id))
    } catch (e) { alert(`Couldn't delete: ${e.message}`) }
  }

  // Assign an unmatched inbound email to a contact.
  async function assignToContact(interactionId, contactId) {
    if (!contactId) return
    await supabase.from('estate_contact_interactions').update({ contact_id: contactId }).eq('id', interactionId)
    setInteractions(prev => prev.map(i => i.id === interactionId ? { ...i, contact_id: contactId } : i))
  }

  // ----- Send documents -----
  function openSend() {
    const def = familyEstates.find(e => e.id === currentEstate?.id)?.id || familyEstates[0]?.id || ''
    setSEstate(def); setSContactId(''); setSel({}); setNote(''); setSCc(''); setSBcc(''); setSendMsg('')
    setPanel('send')
  }
  useEffect(() => {
    if (panel !== 'send' || !sEstate) return
    ;(async () => {
      const { data } = await supabase.from('estate_documents').select('*').eq('estate_id', sEstate).eq('have', true).order('name')
      setDocs((data ?? []).filter(d => d.file_path))
      setSel({})
    })()
  }, [panel, sEstate])

  const sendContacts = contacts.filter(c => c.estate_id === sEstate && (c.emails ?? []).some(Boolean))
  const sendContact = contactById[sContactId]
  const sendEmail = sendContact?.emails?.find(Boolean) || ''
  const chosenDocs = docs.filter(d => sel[d.id])

  async function sendDocuments() {
    if (!sendContact || !sendEmail || chosenDocs.length === 0) {
      setSendMsg('Choose a contact with an email and at least one document.')
      return
    }
    setSendBusy(true); setSendMsg('')
    try {
      const paths = chosenDocs.map(d => d.file_path)
      const { data: signed, error } = await supabase.storage.from('estate-documents').createSignedUrls(paths, LINK_TTL_SECONDS)
      if (error) throw error
      const byPath = Object.fromEntries((signed ?? []).map(r => [r.path, r.signedUrl]))
      const lines = [`Documents for the ${estateName(sEstate)} estate`, '']
      if (note.trim()) { lines.push(note.trim()); lines.push('') }
      chosenDocs.forEach((d, i) => {
        lines.push(`${i + 1}. ${d.name} (${DOC_TYPES[d.doc_type] ?? d.doc_type})`)
        lines.push(`   ${byPath[d.file_path] || '[link unavailable]'}`)
      })
      lines.push(''); lines.push('These secure download links expire in 7 days.')
      const body = lines.join('\n')
      const subject = `Documents — ${estateName(sEstate)} Estate`

      // Record the send and auto-capture it on the contact's timeline.
      await supabase.from('attorney_document_sends').insert({
        estate_id: sEstate,
        document_ids: chosenDocs.map(d => d.id),
        document_count: chosenDocs.length,
        document_names: chosenDocs.map(d => d.name).join(', '),
        sent_at: new Date().toISOString(),
        recipient_name: `${sendContact.name} <${sendEmail}>`,
      })
      const comm = await logCommunication({
        estateId: sEstate, contactId: sContactId, direction: 'outbound', channel: 'document',
        subject: `Sent ${chosenDocs.length} document${chosenDocs.length !== 1 ? 's' : ''}`,
        summary: `Sent to ${sendContact.name} (${sendEmail})${sCc.trim() ? ` (cc: ${sCc.trim()})` : ''}: ${chosenDocs.map(d => d.name).join(', ')}${note.trim() ? ` — “${note.trim()}”` : ''}`,
        source: 'auto',
      })
      if (comm) setInteractions(prev => [comm, ...prev])
      const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body)}`]
      if (sCc.trim()) params.unshift(`cc=${encodeURIComponent(sCc.trim())}`)
      if (sBcc.trim()) params.unshift(`bcc=${encodeURIComponent(sBcc.trim())}`)
      window.location.href = `mailto:${encodeURIComponent(sendEmail)}?${params.join('&')}`
      setPanel(null)
    } catch (e) {
      setSendMsg(e.message || 'Could not prepare the email.')
    } finally {
      setSendBusy(false)
    }
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Communications is available to the executor only.</div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-1">Communications</h1>
          <p className="text-gray-600 dark:text-gray-400">Every call, email, letter, meeting, and document sent — across the family.</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          <button onClick={() => { setPanel(panel === 'compose' ? null : 'compose'); setCmMsg('') }} className="px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800">✍️ Compose email</button>
          <button onClick={() => { setPanel(panel === 'log' ? null : 'log') }} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200">+ Log</button>
          <button onClick={() => { panel === 'send' ? setPanel(null) : openSend() }} className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-200">📎 Send documents</button>
        </div>
      </div>

      {/* Estate inbox address(es) — what to give contacts so replies are captured */}
      <div className="bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-900 rounded-xl p-3 mb-5 text-sm">
        <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-1">📥 This estate's email address — have contacts send/reply here so it's captured automatically</div>
        <div className="space-y-0.5">
          {familyEstates.map(e => {
            const addr = estateInboxAddress(e)
            return (
              <div key={e.id} className="flex items-center gap-2 flex-wrap">
                {multiEstate && <span className="text-gray-500 dark:text-gray-400">{e.deceased_name}:</span>}
                {addr ? (
                  <>
                    <code className="text-blue-800 dark:text-blue-300 bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900 rounded px-1.5 py-0.5">{addr}</code>
                    <button onClick={() => navigator.clipboard?.writeText(addr)} className="text-xs text-blue-600 hover:underline">Copy</button>
                  </>
                ) : <span className="text-gray-400">address pending setup</span>}
              </div>
            )
          })}
        </div>
        <div className="text-[11px] text-blue-500 dark:text-blue-400 mt-1">Inbound capture goes live once the mail routing is connected (setup steps from Claude). Until then, replies to app-sent emails come to you.</div>
      </div>

      {/* Unmatched inbound — assign to a contact */}
      {unmatched.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-900 rounded-xl p-4 mb-5">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">Unmatched inbound ({unmatched.length}) — couldn't match the sender to a contact</div>
          <div className="space-y-2">
            {unmatched.map(i => (
              <div key={i.id} className="flex items-center justify-between gap-3 text-sm border-t border-amber-100 dark:border-amber-900/60 pt-2">
                <div className="min-w-0">
                  <div className="text-gray-800 dark:text-gray-200 truncate">{i.subject}</div>
                  <div className="text-xs text-gray-500 truncate">{i.summary}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select defaultValue="" onChange={e => assignToContact(i.id, e.target.value)}
                    className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none">
                    <option value="">Assign to…</option>
                    {contactsForEstate(i.estate_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button onClick={() => removeComm(i.id)} title="Delete" className="text-gray-400 hover:text-red-500 text-sm">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compose an AI-drafted estate email */}
      {panel === 'compose' && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900 space-y-3 mb-5">
          <div className="text-sm font-semibold text-gray-800 dark:text-white">Compose an estate email</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={cm.contactId} onChange={e => setCm(p => ({ ...p, contactId: e.target.value }))}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">— Send to which contact? —</option>
              {emailContacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.emails.find(Boolean)}){multiEstate ? ` · ${estateName(c.estate_id)}` : ''}</option>)}
            </select>
            <select value={cm.intent} onChange={e => setCm(p => ({ ...p, intent: e.target.value }))}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              {EMAIL_INTENTS.map(it => <option key={it.key} value={it.key}>{it.label}</option>)}
            </select>
          </div>
          <input value={cm.instruction} onChange={e => setCm(p => ({ ...p, instruction: e.target.value }))}
            placeholder="Anything specific to include? (account #, what you're asking for, deadline…)"
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <button onClick={draftIt} disabled={drafting || !cm.contactId} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-sm hover:bg-blue-100 disabled:opacity-50">
            {drafting ? 'Drafting…' : '🤖 Draft with AI'}
          </button>

          <input value={cm.subject} onChange={e => setCm(p => ({ ...p, subject: e.target.value }))}
            placeholder="Subject"
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex gap-1.5">
              <input value={cm.cc} onChange={e => setCm(p => ({ ...p, cc: e.target.value }))}
                placeholder="Cc (optional)"
                className="flex-1 min-w-0 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <select value="" onChange={e => { if (e.target.value) setCm(p => ({ ...p, cc: appendEmail(p.cc, e.target.value) })) }}
                title="Add a contact to Cc"
                className="shrink-0 w-28 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-500 rounded-lg px-2 py-2 text-xs focus:outline-none">
                <option value="">+ Contact</option>
                {emailContacts.map(c => <option key={c.id} value={c.emails.find(Boolean)}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-1.5">
              <input value={cm.bcc} onChange={e => setCm(p => ({ ...p, bcc: e.target.value }))}
                placeholder="Bcc (optional)"
                className="flex-1 min-w-0 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <select value="" onChange={e => { if (e.target.value) setCm(p => ({ ...p, bcc: appendEmail(p.bcc, e.target.value) })) }}
                title="Add a contact to Bcc"
                className="shrink-0 w-28 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-500 rounded-lg px-2 py-2 text-xs focus:outline-none">
                <option value="">+ Contact</option>
                {emailContacts.map(c => <option key={c.id} value={c.emails.find(Boolean)}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <textarea value={cm.body} onChange={e => setCm(p => ({ ...p, body: e.target.value }))} rows={10}
            placeholder="Write the email, or use Draft with AI above and edit here…"
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none font-serif leading-relaxed" />

          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={cm.isPrivate} onChange={e => setCm(p => ({ ...p, isPrivate: e.target.checked }))} />
            Executor-only (hide from the heir transparency view)
          </label>
          {cmMsg && <p className="text-xs text-red-600">{cmMsg}</p>}
          <div className="flex gap-2 items-center">
            <button onClick={sendComposed} disabled={cmBusy || !cm.contactId || !cm.subject.trim() || !cm.body.trim()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {cmBusy ? 'Sending…' : 'Send email'}
            </button>
            <button onClick={() => setPanel(null)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <span className="text-xs text-gray-400">Sent through the app · replies go to you for now · logged automatically</span>
          </div>
        </div>
      )}

      {/* Log a communication */}
      {panel === 'log' && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900 space-y-3 mb-5">
          <div className="text-sm font-semibold text-gray-800 dark:text-white">Log a communication</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={log.contactId} onChange={e => setLog(p => ({ ...p, contactId: e.target.value }))}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">— Which contact? —</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}{multiEstate ? ` · ${estateName(c.estate_id)}` : ''}</option>)}
            </select>
            <input type="date" value={log.date} onChange={e => setLog(p => ({ ...p, date: e.target.value }))}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            <select value={log.channel} onChange={e => setLog(p => ({ ...p, channel: e.target.value }))}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={log.direction} onChange={e => setLog(p => ({ ...p, direction: e.target.value }))}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="outbound">↗ I contacted them</option>
              <option value="inbound">↘ They contacted me</option>
            </select>
          </div>
          <input value={log.subject} onChange={e => setLog(p => ({ ...p, subject: e.target.value }))}
            placeholder="Subject (optional)"
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <textarea value={log.summary} onChange={e => setLog(p => ({ ...p, summary: e.target.value }))} rows={2}
            placeholder="What was discussed or decided..."
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
          <div className="flex gap-2">
            <button onClick={submitLog} disabled={!log.contactId || !log.summary.trim()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">Log it</button>
            <button onClick={() => setPanel(null)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
          </div>
        </div>
      )}

      {/* Send documents */}
      {panel === 'send' && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900 space-y-3 mb-5">
          <div className="text-sm font-semibold text-gray-800 dark:text-white">Send documents</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {multiEstate && (
              <select value={sEstate} onChange={e => { setSEstate(e.target.value); setSContactId('') }}
                className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {familyEstates.map(e => <option key={e.id} value={e.id}>{e.deceased_name}</option>)}
              </select>
            )}
            <select value={sContactId} onChange={e => setSContactId(e.target.value)}
              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">— Send to which contact? —</option>
              {sendContacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.emails.find(Boolean)})</option>)}
            </select>
          </div>
          {sendContacts.length === 0 && <p className="text-xs text-amber-600">No contacts in this estate have an email address. Add one on the contact first.</p>}

          {sContactId && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Documents to include</div>
              {docs.length === 0 ? (
                <p className="text-xs text-gray-400">No uploaded documents in this estate yet.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                  {docs.map(d => (
                    <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                      <input type="checkbox" checked={!!sel[d.id]} onChange={() => setSel(p => ({ ...p, [d.id]: !p[d.id] }))} />
                      <span className="text-gray-800 dark:text-gray-200 truncate">{d.name}</span>
                      <span className="text-xs text-gray-400 ml-auto shrink-0">{DOC_TYPES[d.doc_type] ?? d.doc_type}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Optional note to include in the email..."
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="flex gap-1.5">
              <input value={sCc} onChange={e => setSCc(e.target.value)}
                placeholder="Cc (optional)"
                className="flex-1 min-w-0 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <select value="" onChange={e => { if (e.target.value) setSCc(v => appendEmail(v, e.target.value)) }}
                title="Add a contact to Cc"
                className="shrink-0 w-28 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-500 rounded-lg px-2 py-2 text-xs focus:outline-none">
                <option value="">+ Contact</option>
                {sendContacts.map(c => <option key={c.id} value={c.emails.find(Boolean)}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-1.5">
              <input value={sBcc} onChange={e => setSBcc(e.target.value)}
                placeholder="Bcc (optional)"
                className="flex-1 min-w-0 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <select value="" onChange={e => { if (e.target.value) setSBcc(v => appendEmail(v, e.target.value)) }}
                title="Add a contact to Bcc"
                className="shrink-0 w-28 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-500 rounded-lg px-2 py-2 text-xs focus:outline-none">
                <option value="">+ Contact</option>
                {sendContacts.map(c => <option key={c.id} value={c.emails.find(Boolean)}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {sendMsg && <p className="text-xs text-red-600">{sendMsg}</p>}
          <div className="flex gap-2 items-center">
            <button onClick={sendDocuments} disabled={sendBusy || !sContactId || chosenDocs.length === 0} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
              {sendBusy ? 'Preparing…' : `Open email${chosenDocs.length ? ` (${chosenDocs.length})` : ''}`}
            </button>
            <button onClick={() => setPanel(null)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
            <span className="text-xs text-gray-400">Opens your mail app with secure 7-day links. Logged automatically.</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input placeholder="Search communications..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
        <select value={fContact} onChange={e => setFContact(e.target.value)}
          className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="all">All contacts</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={fChannel} onChange={e => setFChannel(e.target.value)}
          className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="all">All channels</option>
          {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {multiEstate && (
          <select value={fEstate} onChange={e => setFEstate(e.target.value)}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="all">All estates</option>
            {familyEstates.map(e => <option key={e.id} value={e.id}>{e.deceased_name}</option>)}
          </select>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">No communications match. Log a call/email above, or send documents — anything the app sends is captured here too.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(ev => {
              const nm = contactName(ev.contactId, ev.data.contact_name)
              if (ev.type === 'meeting') {
                const m = ev.data
                return (
                  <div key={ev.key} className="text-sm border-l-2 border-blue-200 dark:border-blue-900 pl-3">
                    <div className="text-xs text-gray-400 mb-0.5">
                      {whenStr(ev.when)} · 📅 Meeting · <span className="capitalize">{(m.meeting_type || '').replace('_', ' ')}</span> · <span className="capitalize">{m.status}</span>
                      {multiEstate && <span> · {estateName(ev.estateId)}</span>}
                    </div>
                    <div className="text-gray-800 dark:text-gray-200">
                      {ev.contactId ? <Link to={`/contacts/${ev.contactId}`} className="font-medium hover:underline">{nm}</Link> : <span className="font-medium">{nm}</span>}
                      {m.notes && <span className="text-gray-600 dark:text-gray-400"> — {m.notes}</span>}
                    </div>
                  </div>
                )
              }
              const i = ev.data
              const dir = i.direction === 'inbound' ? '↘ from them' : '↗ to them'
              return (
                <div key={ev.key} className="flex items-start justify-between gap-2 border-l-2 border-gray-200 dark:border-gray-800 pl-3 group">
                  <div className="text-sm min-w-0 flex-1">
                    <div className="text-xs text-gray-400 mb-0.5">
                      {whenStr(ev.when)} · {channelIcon(i.channel)} {channelLabel(i.channel)} · {dir}
                      {multiEstate && <span> · {estateName(ev.estateId)}</span>}
                      {i.source === 'auto' && <span className="ml-1 text-[10px] uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-500 rounded px-1">auto</span>}
                    </div>
                    <div className="text-gray-800 dark:text-gray-200">
                      {ev.contactId ? <Link to={`/contacts/${ev.contactId}`} className="font-medium hover:underline">{nm}</Link> : <span className="font-medium">{nm}</span>}
                      {i.subject && <span className="text-gray-700 dark:text-gray-300"> — {i.subject}</span>}
                    </div>
                    {i.summary && <div className="text-gray-600 dark:text-gray-400">{i.summary}</div>}
                  </div>
                  <button onClick={() => removeComm(i.id)} title="Delete" className="shrink-0 text-gray-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
