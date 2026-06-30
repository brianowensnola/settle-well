import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase, getAccessToken } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { CONTACT_ROLES } from '../lib/constants'
import { logCommunication, CHANNELS, channelLabel, channelIcon, deleteCommunication } from '../lib/communications'

const todayStr = () => new Date().toISOString().slice(0, 10)

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { currentEstate, estates, role } = useEstate()
  const canDelete = isFullAccess(role)
  const [contact, setContact] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [meetings, setMeetings] = useState([])
  const [logForm, setLogForm] = useState({ direction: 'outbound', channel: 'phone', subject: '', summary: '', date: todayStr() })
  const summaryRef = useRef(null)
  const [meetingForm, setMeetingForm] = useState({ scheduled_at: '', meeting_type: 'initial', notes: '' })
  const [prepBusy, setPrepBusy] = useState(null)
  const [editMtg, setEditMtg] = useState(null) // { id, at } for rescheduling a meeting
  const [mtgNote, setMtgNote] = useState({ id: null, text: '' }) // post-meeting notes editor
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('estate_contacts').select('*').eq('id', id).single(),
      supabase.from('estate_contact_interactions').select('*').eq('contact_id', id).order('occurred_at', { ascending: false }),
      supabase.from('estate_meetings').select('*').eq('contact_id', id).order('scheduled_at', { ascending: false }),
    ]).then(([c, i, m]) => {
      setContact(c.data)
      setInteractions(i.data ?? [])
      setMeetings(m.data ?? [])
      setLoading(false)
    })
  }, [id])

  // Arrived here via the Contacts-list "Call" button → open the call-log note.
  useEffect(() => {
    if (location.state?.call && contact) {
      startCallLog()
      navigate(location.pathname, { replace: true, state: {} }) // clear so it doesn't re-fire
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, contact])

  async function scheduleMeeting() {
    if (!meetingForm.scheduled_at) return
    // datetime-local gives local wall-time; store the exact instant (ISO+tz)
    // so it round-trips back to the same clock time the user picked.
    const iso = new Date(meetingForm.scheduled_at).toISOString()
    const { data: m } = await supabase.from('estate_meetings').insert({
      estate_id: currentEstate.id, contact_id: id, contact_name: contact.name,
      meeting_type: meetingForm.meeting_type, scheduled_at: iso,
      notes: meetingForm.notes || null, status: 'scheduled',
    }).select().single()
    if (m) {
      // Track the meeting as a task so progress shows on the board.
      const when = new Date(iso).toLocaleString()
      const { data: sec } = await supabase.from('estate_sections').select('id').eq('estate_id', currentEstate.id).eq('label', 'Phase 1 — Immediate').maybeSingle()
      const { data: task } = await supabase.from('estate_tasks').insert({
        estate_id: currentEstate.id, section_id: sec?.id ?? null,
        text: `Meeting: ${contact.name} (${meetingForm.meeting_type.replace('_', ' ')}) — ${when}`,
        tag: 'Meeting', status: 'pending',
      }).select('id').single()
      if (task) { await supabase.from('estate_meetings').update({ linked_task_id: task.id }).eq('id', m.id); m.linked_task_id = task.id }
      setMeetings(prev => [m, ...prev])
    }
    setMeetingForm({ scheduled_at: '', meeting_type: 'initial', notes: '' })
  }

  async function generatePrep(meeting) {
    setPrepBusy(meeting.id)
    try {
      const token = await getAccessToken()
      const resp = await fetch('/.netlify/functions/meeting-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estateId: currentEstate.id, contactName: contact.name, contactRole: contact.role, meetingType: meeting.meeting_type, notes: meeting.notes }),
      })
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null)
        throw new Error(detail?.error || `Something went wrong (${resp.status}). Please try again.`)
      }
      const { questions } = await resp.json()
      const prep = (questions ?? []).map(q => ({ q, checked: false }))
      await supabase.from('estate_meetings').update({ prep_questions: prep }).eq('id', meeting.id)
      setMeetings(prev => prev.map(x => x.id === meeting.id ? { ...x, prep_questions: prep } : x))
    } catch (e) { alert(`Couldn't generate prep questions: ${e.message}`) }
    setPrepBusy(null)
  }

  async function togglePrep(meeting, idx) {
    const prep = (meeting.prep_questions ?? []).map((p, i) => i === idx ? { ...p, checked: !p.checked } : p)
    setMeetings(prev => prev.map(x => x.id === meeting.id ? { ...x, prep_questions: prep } : x))
    await supabase.from('estate_meetings').update({ prep_questions: prep }).eq('id', meeting.id)
  }

  // Convert a stored ISO timestamp to the value a datetime-local input wants
  // (local wall-time, "YYYY-MM-DDTHH:mm").
  function toLocalInput(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  }

  async function saveMeetingTime(meeting) {
    if (!editMtg?.at) { setEditMtg(null); return }
    const iso = new Date(editMtg.at).toISOString()
    await supabase.from('estate_meetings').update({ scheduled_at: iso }).eq('id', meeting.id)
    // Keep the linked task's label in sync with the new time.
    if (meeting.linked_task_id) {
      const when = new Date(iso).toLocaleString()
      await supabase.from('estate_tasks').update({
        text: `Meeting: ${contact.name} (${meeting.meeting_type.replace('_', ' ')}) — ${when}`,
        updated_at: new Date().toISOString(),
      }).eq('id', meeting.linked_task_id)
    }
    setMeetings(prev => prev.map(x => x.id === meeting.id ? { ...x, scheduled_at: iso } : x))
    setEditMtg(null)
  }

  async function setMeetingStatus(meeting, status) {
    await supabase.from('estate_meetings').update({ status }).eq('id', meeting.id)
    if (status === 'completed' && meeting.linked_task_id) {
      await supabase.from('estate_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', meeting.linked_task_id)
    }
    setMeetings(prev => prev.map(x => x.id === meeting.id ? { ...x, status } : x))
  }

  async function saveMeetingNote() {
    const { id, text } = mtgNote
    setMeetings(prev => prev.map(x => x.id === id ? { ...x, notes: text } : x))
    setMtgNote({ id: null, text: '' })
    await supabase.from('estate_meetings').update({ notes: text }).eq('id', id)
  }

  async function removeInteraction(interactionId) {
    if (!confirm('Delete this communication? This cannot be undone.')) return
    try {
      await deleteCommunication(interactionId)
      setInteractions(prev => prev.filter(x => x.id !== interactionId))
    } catch (e) { alert(`Couldn't delete: ${e.message}`) }
  }

  // When a call is started, jump to the log note pre-set to an outbound phone
  // call so what was discussed gets captured in the app right after.
  function startCallLog() {
    setLogForm(p => ({ ...p, channel: 'phone', direction: 'outbound', date: todayStr() }))
    setTimeout(() => {
      summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      summaryRef.current?.focus()
    }, 100)
  }

  async function logInteraction() {
    if (!logForm.summary.trim()) return
    const data = await logCommunication({
      estateId: currentEstate.id,
      contactId: id,
      direction: logForm.direction,
      channel: logForm.channel,
      subject: logForm.subject,
      summary: logForm.summary,
      source: 'manual',
      occurredAt: logForm.date ? new Date(logForm.date + 'T12:00:00').toISOString() : null,
    })
    if (data) setInteractions(prev => [data, ...prev])
    setLogForm({ direction: 'outbound', channel: 'phone', subject: '', summary: '', date: todayStr() })
  }

  async function saveEdit() {
    await supabase.from('estate_contacts').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', id)
    setContact(prev => ({ ...prev, ...editData }))
    setEditing(false)
  }

  async function deleteContact() {
    const shared = contact.shared_with?.length > 0
    if (!confirm(`Delete "${contact.name}"?${shared ? ' This removes it from every estate it\'s shared with.' : ''} This can't be undone.`)) return
    const { error } = await supabase.from('estate_contacts').delete().eq('id', id)
    if (error) { alert(`Couldn't delete: ${error.message}`); return }
    navigate('/contacts')
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!contact) return <div className="p-8 text-gray-400">Contact not found.</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto w-full">
      <Link to="/contacts" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-400 mb-4 block">← Back to contacts</Link>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        {editing ? (
          <div className="space-y-3">
            {[['name','Name'],['company','Company']].map(([k,l]) => (
              <div key={k}>
                <label className="text-xs text-gray-500 block mb-1">{l}</label>
                <input value={editData[k] ?? ''} onChange={e => setEditData(p => ({ ...p, [k]: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Role</label>
              <select value={editData.role ?? 'other'} onChange={e => setEditData(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {Object.entries(CONTACT_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            {/* Phones */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">Phone Numbers</label>
              <div className="space-y-2">
                {(editData.phones ?? []).map((phone, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select value={editData.phone_labels?.[idx] || 'Cell'} onChange={e => {
                      const updated = [...(editData.phone_labels ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, phone_labels: updated }))
                    }}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm focus:outline-none">
                      <option>Cell</option>
                      <option>Work</option>
                      <option>Home</option>
                      <option>Assistant</option>
                      <option>Other</option>
                    </select>
                    <input value={phone} onChange={e => {
                      const updated = [...(editData.phones ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, phones: updated }))
                    }}
                      className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    {(editData.phones ?? []).length > 0 && (
                      <button onClick={() => setEditData(p => ({ ...p, phones: (p.phones ?? []).filter((_, i) => i !== idx), phone_labels: (p.phone_labels ?? []).filter((_, i) => i !== idx) }))}
                        className="px-2 py-2 text-gray-400 hover:text-red-500">×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setEditData(p => ({ ...p, phones: [...(p.phones ?? []), ''], phone_labels: [...(p.phone_labels ?? []), 'Cell'] }))}
                  className="text-xs text-blue-600 hover:text-blue-700">+ Add phone</button>
              </div>
            </div>

            {/* Emails */}
            <div>
              <label className="text-xs text-gray-500 block mb-2">Email Addresses</label>
              <div className="space-y-2">
                {(editData.emails ?? []).map((email, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select value={editData.email_labels?.[idx] || 'Primary'} onChange={e => {
                      const updated = [...(editData.email_labels ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, email_labels: updated }))
                    }}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-2 text-sm focus:outline-none">
                      <option>Primary</option>
                      <option>Work</option>
                      <option>Assistant</option>
                      <option>Other</option>
                    </select>
                    <input value={email} onChange={e => {
                      const updated = [...(editData.emails ?? [])]
                      updated[idx] = e.target.value
                      setEditData(p => ({ ...p, emails: updated }))
                    }}
                      className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    {(editData.emails ?? []).length > 0 && (
                      <button onClick={() => setEditData(p => ({ ...p, emails: (p.emails ?? []).filter((_, i) => i !== idx), email_labels: (p.email_labels ?? []).filter((_, i) => i !== idx) }))}
                        className="px-2 py-2 text-gray-400 hover:text-red-500">×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setEditData(p => ({ ...p, emails: [...(p.emails ?? []), ''], email_labels: [...(p.email_labels ?? []), 'Primary'] }))}
                  className="text-xs text-blue-600 hover:text-blue-700">+ Add email</button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Address</label>
              <textarea value={editData.address ?? ''} onChange={e => setEditData(p => ({ ...p, address: e.target.value }))}
                rows={2} placeholder="Street, City, State ZIP"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>

            <div>
              <label className="text-xs text-gray-500 block mb-1">Website</label>
              <input value={editData.website ?? ''} onChange={e => setEditData(p => ({ ...p, website: e.target.value }))}
                placeholder="example.com"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>

            <textarea value={editData.notes ?? ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
              rows={3} placeholder="Notes..."
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />

            {/* Opt-in: also show this contact in another estate */}
            {estates?.filter(e => e.id !== (editData.estate_id ?? contact.estate_id)).length > 0 && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Also show in (optional)</label>
                <div className="space-y-1">
                  {estates.filter(e => e.id !== (editData.estate_id ?? contact.estate_id)).map(e => (
                    <label key={e.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={(editData.shared_with ?? []).includes(e.id)}
                        onChange={ev => setEditData(p => ({
                          ...p,
                          shared_with: ev.target.checked
                            ? [...(p.shared_with ?? []), e.id]
                            : (p.shared_with ?? []).filter(x => x !== e.id),
                        }))}
                      />
                      {e.deceased_name} estate
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Unchecked = this contact stays only in its own estate.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={saveEdit} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm">Save</button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{contact.name}</h1>
                {contact.company && <div className="text-sm text-gray-500 dark:text-gray-400">{contact.company}</div>}
                <div className="text-xs text-gray-400 mt-0.5">{CONTACT_ROLES[contact.role] ?? contact.role}</div>
                {contact.shared_with?.length > 0 && (
                  <div className="text-xs text-blue-600 dark:text-blue-300 mt-0.5">
                    ↔ Shared with {contact.shared_with.map(eid => estates?.find(e => e.id === eid)?.deceased_name).filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
              <div className="flex gap-3 shrink-0">
                {canDelete && (
                  <button onClick={() => { setEditing(true); setEditData({ ...contact }) }}
                    className="text-xs text-blue-600 hover:underline">Edit</button>
                )}
                {canDelete && (
                  <button onClick={deleteContact} className="text-xs text-red-500 hover:text-red-700 hover:underline">Delete</button>
                )}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              {contact.phones?.length > 0 && contact.phones.map((p, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <span><span className="text-gray-400">{contact.phone_labels?.[i] || 'Phone'}: </span>{p}</span>
                  <a href={`tel:${p.replace(/[^\d+]/g, '')}`} onClick={startCallLog} className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full hover:bg-green-200">📞 Call</a>
                </div>
              ))}
              {contact.emails?.length > 0 && contact.emails.map((e, i) => (
                <div key={i}><span className="text-gray-400">{contact.email_labels?.[i] || 'Email'}: </span><a href={`mailto:${e}`} className="text-blue-600 hover:underline">{e}</a></div>
              ))}
              {contact.address && <div className="whitespace-pre-line"><span className="text-gray-400">Address: </span>{contact.address}</div>}
              {contact.website && (
                <div>
                  <span className="text-gray-400">Website: </span>
                  <a href={/^https?:\/\//i.test(contact.website) ? contact.website : `https://${contact.website}`}
                    target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{contact.website}</a>
                </div>
              )}
              {contact.notes && <div className="text-gray-600 dark:text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">{contact.notes}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Meetings (executor only) */}
      {canDelete && (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Meetings</h2>

        {/* Schedule a meeting */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <input type="datetime-local" value={meetingForm.scheduled_at}
            onChange={e => setMeetingForm(p => ({ ...p, scheduled_at: e.target.value }))}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <select value={meetingForm.meeting_type} onChange={e => setMeetingForm(p => ({ ...p, meeting_type: e.target.value }))}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="initial">Initial meeting</option>
            <option value="follow_up">Follow-up</option>
            <option value="call">Call</option>
            <option value="other">Other</option>
          </select>
        </div>
        <input value={meetingForm.notes} onChange={e => setMeetingForm(p => ({ ...p, notes: e.target.value }))}
          placeholder="Purpose / notes (optional)"
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none mb-2" />
        <button onClick={scheduleMeeting} disabled={!meetingForm.scheduled_at}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-40">Schedule meeting</button>

        {/* Meeting list */}
        <div className="mt-4 space-y-3">
          {meetings.map(m => {
            const prep = m.prep_questions ?? []
            return (
              <div key={m.id} className={`border border-gray-200 dark:border-gray-800 rounded-lg p-3 ${m.status === 'completed' ? 'bg-green-50 dark:bg-green-900/10' : m.status === 'cancelled' ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-medium text-gray-800 dark:text-white capitalize">
                    {m.meeting_type.replace('_', ' ')} · <span className="normal-case">{m.scheduled_at ? new Date(m.scheduled_at).toLocaleString() : 'unscheduled'}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.status === 'completed' ? 'bg-green-100 text-green-700' : m.status === 'cancelled' ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>{m.status}</span>
                </div>
                {/* Roomy date + time editor */}
                {editMtg?.id === m.id && (
                  <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center gap-2 flex-wrap">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Date &amp; time:</label>
                    <input type="datetime-local" step="60" value={editMtg.at} onChange={e => setEditMtg(s => ({ ...s, at: e.target.value }))}
                      className="border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300" />
                    <button onClick={() => saveMeetingTime(m)} className="px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-xs">Save</button>
                    <button onClick={() => setEditMtg(null)} className="px-3 py-1.5 text-gray-500 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
                  </div>
                )}
                {m.notes && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.notes}</div>}

                {/* AI prep */}
                {prep.length === 0 ? (
                  <button onClick={() => generatePrep(m)} disabled={prepBusy === m.id}
                    className="mt-2 text-xs px-2.5 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50">
                    {prepBusy === m.id ? 'Generating…' : '✨ Generate prep questions'}
                  </button>
                ) : (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Prep questions</div>
                    <div className="space-y-1">
                      {prep.map((p, i) => (
                        <label key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <input type="checkbox" checked={!!p.checked} onChange={() => togglePrep(m, i)} className="mt-1" />
                          <span className={p.checked ? 'line-through text-gray-400' : ''}>{p.q}</span>
                        </label>
                      ))}
                    </div>
                    <button onClick={() => generatePrep(m)} disabled={prepBusy === m.id} className="mt-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{prepBusy === m.id ? 'Regenerating…' : '↻ Regenerate'}</button>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  {m.status === 'scheduled' && editMtg?.id !== m.id && <button onClick={() => setEditMtg({ id: m.id, at: toLocalInput(m.scheduled_at) })} className="text-xs text-blue-600 hover:underline">Edit time</button>}
                  {m.status === 'scheduled' && <button onClick={() => setMeetingStatus(m, 'completed')} className="text-xs text-green-700 hover:underline">Mark completed</button>}
                  {m.status === 'scheduled' && <button onClick={() => setMeetingStatus(m, 'cancelled')} className="text-xs text-gray-400 hover:text-red-500 hover:underline">Cancel</button>}
                  <button onClick={() => setMtgNote({ id: m.id, text: m.notes || '' })} className="text-xs text-blue-600 hover:underline">📝 {m.notes ? 'Edit notes' : 'Add notes'}</button>
                  {m.linked_task_id && <Link to={`/tasks/${m.linked_task_id}`} className="text-xs text-blue-600 hover:underline">View task →</Link>}
                </div>
                {mtgNote.id === m.id && (
                  <div className="mt-2">
                    <textarea value={mtgNote.text} onChange={e => setMtgNote(s => ({ ...s, text: e.target.value }))} rows={3}
                      placeholder="What was discussed / outcome / next steps…"
                      className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none" />
                    <div className="flex gap-2">
                      <button onClick={saveMeetingNote} className="px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-xs">Save notes</button>
                      <button onClick={() => setMtgNote({ id: null, text: '' })} className="px-3 py-1.5 text-gray-500 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}

      {/* Log a communication (executor only) */}
      {canDelete && (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Log a communication</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <select value={logForm.channel} onChange={e => setLogForm(p => ({ ...p, channel: e.target.value }))}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={logForm.direction} onChange={e => setLogForm(p => ({ ...p, direction: e.target.value }))}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            <option value="outbound">↗ I contacted them</option>
            <option value="inbound">↘ They contacted me</option>
          </select>
          <input type="date" value={logForm.date} onChange={e => setLogForm(p => ({ ...p, date: e.target.value }))}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <input value={logForm.subject} onChange={e => setLogForm(p => ({ ...p, subject: e.target.value }))}
          placeholder="Subject (optional) — e.g. Probate filing timeline"
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none mb-2" />
        <textarea
          ref={summaryRef}
          value={logForm.summary}
          onChange={e => setLogForm(p => ({ ...p, summary: e.target.value }))}
          placeholder="What was discussed or decided..."
          rows={3}
          className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none mb-2"
        />
        <button onClick={logInteraction} disabled={!logForm.summary.trim()} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40">
          Log communication
        </button>
      </div>
      )}

      {/* Unified communications timeline — logged interactions + meetings, newest first */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Communications</h2>
        {(() => {
          const events = [
            ...interactions.map(i => ({
              key: `i-${i.id}`, type: 'comm', when: i.occurred_at || i.created_at,
              icon: channelIcon(i.channel), data: i,
            })),
            ...meetings.map(m => ({
              key: `m-${m.id}`, type: 'meeting', when: m.scheduled_at, icon: '📅', data: m,
            })),
          ].sort((a, b) => new Date(b.when || 0) - new Date(a.when || 0))

          if (events.length === 0) return <p className="text-sm text-gray-400">No communications yet. Log a call, email, or letter above — and anything the app sends to this contact is recorded here automatically.</p>

          return (
            <div className="space-y-3">
              {events.map(ev => {
                const dateStr = ev.when ? new Date(ev.when).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
                if (ev.type === 'meeting') {
                  const m = ev.data
                  return (
                    <div key={ev.key} className="text-sm border-l-2 border-blue-200 dark:border-blue-900 pl-3">
                      <div className="text-xs text-gray-400 mb-0.5">
                        {dateStr} · 📅 Meeting <span className="capitalize">· {(m.meeting_type || '').replace('_', ' ')}</span> · <span className="capitalize">{m.status}</span>
                      </div>
                      {m.notes && <div className="text-gray-700 dark:text-gray-300">{m.notes}</div>}
                    </div>
                  )
                }
                const i = ev.data
                const dir = i.direction === 'inbound' ? '↘ from them' : '↗ to them'
                return (
                  <div key={ev.key} className="flex items-start justify-between gap-2 border-l-2 border-gray-200 dark:border-gray-800 pl-3 group">
                    <div className="text-sm min-w-0 flex-1">
                      <div className="text-xs text-gray-400 mb-0.5">
                        {dateStr} · {ev.icon} {channelLabel(i.channel)} · {dir}
                        {i.source === 'auto' && <span className="ml-1 text-[10px] uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-500 rounded px-1">auto</span>}
                      </div>
                      {i.subject && <div className="font-medium text-gray-800 dark:text-gray-200">{i.subject}</div>}
                      <div className="text-gray-700 dark:text-gray-300">{i.summary}</div>
                    </div>
                    {canDelete && <button onClick={() => removeInteraction(i.id)} title="Delete" className="shrink-0 text-gray-300 hover:text-red-500 text-sm opacity-0 group-hover:opacity-100 transition-opacity">🗑</button>}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
