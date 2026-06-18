import { useEffect, useState } from 'react'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess, roleLabel, INVITE_ROLES } from '../lib/roles'
import { loadPeople, updateRole, removeMembership, removePerson, addMembership, updateDemographics, resetPassword, sendInvite } from '../lib/adminUsers'

const BLANK_INVITE = { name: '', email: '', phone: '', relationship: '', role: 'heir', estates: [], sms_consent: false }

export default function AdminUsers() {
  const { estates } = useEstate()
  const adminEstates = (estates ?? []).filter(e => isFullAccess(e._role))
  const estateIds = adminEstates.map(e => e.id)
  const estateName = id => estates?.find(e => e.id === id)?.deceased_name ?? ''

  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [editKey, setEditKey] = useState(null)
  const [draft, setDraft] = useState({})
  const [invite, setInvite] = useState(BLANK_INVITE)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(null)

  async function refresh() { setPeople(await loadPeople(estateIds)) }

  useEffect(() => {
    if (estateIds.length === 0) { setLoading(false); return }
    loadPeople(estateIds).then(p => { setPeople(p); setLoading(false) })
  }, [estates])

  if (adminEstates.length === 0) return <div className="p-8 text-gray-400">Admin is available to the executor only.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  function startEdit(p) {
    setEditKey(p.key)
    setDraft({ name: p.name ?? '', email: p.email ?? '', phone: p.phone ?? '', address: p.address ?? '', relationship: p.relationship ?? '', sms_consent: !!p.memberships?.[0]?.sms_consent })
  }
  async function saveEdit(p) {
    await updateDemographics(p.memberships.map(m => m.id), draft)
    setEditKey(null); await refresh()
  }

  async function changeRole(rowId, role) { await updateRole(rowId, role); await refresh() }
  async function remove(rowId) {
    setBusy(true); setMsg('')
    try { await removeMembership(rowId); await refresh() }
    catch (e) { setMsg(`Could not remove from estate: ${e.message}`) }
    finally { setBusy(false) }
  }

  // Remove a person from every estate at once. Two-click confirm (no popup).
  async function removeEntirely(p) {
    if (confirmRemove !== p.key) { setConfirmRemove(p.key); return }
    setConfirmRemove(null); setBusy(true); setMsg('')
    try {
      await removePerson(p.memberships.map(m => m.id))
      await refresh()
      setMsg(`Removed ${p.name || p.email} from all estates.${p.auth_user_id ? ' Their login still exists — delete it in Supabase → Authentication if you want it fully gone.' : ''}`)
    } catch (e) {
      setMsg(`Could not remove ${p.name || p.email}: ${e.message}`)
    } finally { setBusy(false) }
  }
  async function addTo(person, estateId) {
    const role = person.memberships[0]?.role || 'heir'
    await addMembership(estateId, person, role); await refresh()
  }
  function copyInvite(person) {
    // Existing logins get a sign-in link; pending people get the signup link.
    const url = person.auth_user_id
      ? `https://settle-well.netlify.app/login`
      : `https://settle-well.netlify.app/invite?email=${encodeURIComponent(person.email)}`
    navigator.clipboard.writeText(url)
    setMsg(person.auth_user_id
      ? `Sign-in link copied — send it to ${person.name || person.email}.`
      : `Invite link copied — send it to ${person.name || person.email}. They open it, create a password, and they're connected.`)
  }

  // Send the invitation/access link (email + optional text) and report what went out.
  async function fireInvite({ email, name, phone, estateName, existing }) {
    try {
      const r = await sendInvite({ email, name, phone, estateName, existing })
      const parts = []
      parts.push(r.email?.sent ? 'email sent' : `email failed (${r.email?.error || 'unknown'})`)
      if (r.sms) parts.push(r.sms.sent ? 'text sent' : `text failed (${r.sms.error || 'unknown'})`)
      setMsg(`Invite to ${name || email}: ${parts.join(' · ')}.`)
    } catch (e) {
      setMsg(`Invite to ${name || email} failed: ${e.message}`)
    }
  }

  async function sendInviteToPerson(p) {
    setBusy(true); setMsg('')
    try { await fireInvite({ email: p.email, name: p.name, phone: p.phone, estateName: estateName(p.memberships[0]?.estate_id), existing: !!p.auth_user_id }) }
    finally { setBusy(false) }
  }

  async function doReset(person) {
    if (!person.auth_user_id) { alert("This person hasn't created a login yet, so there's no password to reset."); return }
    const pw = prompt(`Set a new password for ${person.name || person.email} (min 6 characters):`)
    if (!pw) return
    if (pw.length < 6) { alert('Password must be at least 6 characters.'); return }
    setBusy(true); setMsg('')
    try { await resetPassword(person.auth_user_id, pw); setMsg(`Password updated for ${person.name || person.email}.`) }
    catch (e) { alert(e.message || 'Reset failed') }
    finally { setBusy(false) }
  }

  async function submitInvite(e) {
    e.preventDefault()
    if (!invite.email.trim() || invite.estates.length === 0) { alert('Enter an email and pick at least one estate.'); return }
    setBusy(true)
    try {
      const email = invite.email.toLowerCase().trim()
      for (const eid of invite.estates) {
        await addMembership(eid, { name: invite.name, email, phone: invite.phone, relationship: invite.relationship, sms_consent: invite.sms_consent }, invite.role)
      }
      await refresh()
      // Send the sign-up invitation (email + text) right away.
      await fireInvite({ email, name: invite.name, phone: invite.phone, estateName: estateName(invite.estates[0]) })
      setInvite(BLANK_INVITE)
    } finally { setBusy(false) }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">Users &amp; Roles</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Manage who has access across all your estates, their roles, details, and passwords — all in one place.</p>

      {msg && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg text-sm mb-4">{msg}</div>}

      {/* People */}
      <div className="space-y-3 mb-8">
        {people.length === 0 && <p className="text-sm text-gray-400">No people yet. Add someone below.</p>}
        {people.map(p => {
          const missingEstates = adminEstates.filter(e => !p.memberships.some(m => m.estate_id === e.id))
          const isExec = p.memberships.some(m => m.role === 'administrator' || m.role === 'executor')
          return (
            <div key={p.key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              {editKey === p.key ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Name"
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email"
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} placeholder="Phone"
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <input value={draft.relationship} onChange={e => setDraft(d => ({ ...d, relationship: e.target.value }))} placeholder="Relationship (e.g. heir, helper)"
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <textarea value={draft.address} onChange={e => setDraft(d => ({ ...d, address: e.target.value }))} placeholder="Address" rows={2}
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                    <label className="col-span-2 flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input type="checkbox" checked={!!draft.sms_consent} onChange={e => setDraft(d => ({ ...d, sms_consent: e.target.checked }))} className="mt-0.5" />
                      <span>Send text (SMS) notifications to this number — consents to receive texts (reply STOP to opt out).</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(p)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Save</button>
                    <button onClick={() => setEditKey(null)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{p.name || p.email || '(no name)'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {p.email || 'no email'}{p.phone ? ` · ${p.phone}` : ''}{p.relationship ? ` · ${p.relationship}` : ''}
                        {' '}{p.auth_user_id ? '· login active' : '· no login yet'}
                      </div>
                      {p.address && <div className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{p.address}</div>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => startEdit(p)} className="text-xs text-blue-600 hover:underline">Edit</button>
                      {p.email && (
                        <>
                          <button onClick={() => sendInviteToPerson(p)} disabled={busy} className="text-xs text-blue-600 hover:underline disabled:opacity-40">{p.auth_user_id ? 'Send link' : 'Send invite'}</button>
                          <button onClick={() => copyInvite(p)} className="text-xs text-gray-400 hover:underline">Copy link</button>
                        </>
                      )}
                      {p.auth_user_id && <button onClick={() => doReset(p)} disabled={busy} className="text-xs text-blue-600 hover:underline disabled:opacity-40">Reset password</button>}
                      {!isExec && (
                        confirmRemove === p.key
                          ? <>
                              <button onClick={() => removeEntirely(p)} disabled={busy} className="text-xs text-red-600 font-medium hover:underline disabled:opacity-40">Confirm remove</button>
                              <button onClick={() => setConfirmRemove(null)} className="text-xs text-gray-400 hover:underline">cancel</button>
                            </>
                          : <button onClick={() => removeEntirely(p)} disabled={busy} className="text-xs text-red-500 hover:underline disabled:opacity-40">Remove</button>
                      )}
                    </div>
                  </div>

                  {/* Per-estate roles */}
                  <div className="mt-3 space-y-1.5">
                    {p.memberships.map(m => (
                      <div key={m.id} className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="text-gray-700 dark:text-gray-300 w-40 truncate">{estateName(m.estate_id)}</span>
                        {m.role === 'administrator' || m.role === 'executor' ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">Executor</span>
                        ) : (
                          <>
                            <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                              className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-xs focus:outline-none">
                              {INVITE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                            </select>
                            <button onClick={() => remove(m.id)} className="text-xs text-gray-400 hover:text-red-500">remove</button>
                          </>
                        )}
                      </div>
                    ))}
                    {missingEstates.map(e => (
                      <button key={e.id} onClick={() => addTo(p, e.id)} className="text-xs text-blue-600 hover:underline block">
                        + Add to {e.deceased_name} estate
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Add a person */}
      <form onSubmit={submitInvite} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Add a person</h2>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input value={invite.name} onChange={e => setInvite(v => ({ ...v, name: e.target.value }))} placeholder="Name"
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <input value={invite.email} onChange={e => setInvite(v => ({ ...v, email: e.target.value }))} placeholder="Email" type="email"
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <input value={invite.phone} onChange={e => setInvite(v => ({ ...v, phone: e.target.value }))} placeholder="Phone (for text invite, optional)" type="tel"
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <input value={invite.relationship} onChange={e => setInvite(v => ({ ...v, relationship: e.target.value }))} placeholder="Relationship (optional)"
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
          <select value={invite.role} onChange={e => setInvite(v => ({ ...v, role: e.target.value }))}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            {INVITE_ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 mb-3">
          <input type="checkbox" checked={invite.sms_consent} onChange={e => setInvite(v => ({ ...v, sms_consent: e.target.checked }))} className="mt-0.5" />
          <span>Send text (SMS) notifications about this estate to this number. <span className="text-gray-400">They consent to receive texts; they can reply STOP anytime.</span></span>
        </label>
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">Add to which estate(s):</div>
          <div className="flex gap-3 flex-wrap">
            {adminEstates.map(e => (
              <label key={e.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input type="checkbox" checked={invite.estates.includes(e.id)}
                  onChange={ev => setInvite(v => ({ ...v, estates: ev.target.checked ? [...v.estates, e.id] : v.estates.filter(x => x !== e.id) }))} />
                {e.deceased_name}
              </label>
            ))}
          </div>
        </div>
        <button type="submit" disabled={busy} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
          {busy ? 'Working…' : 'Add person'}
        </button>
        <p className="text-xs text-gray-400 mt-2">Adding a person emails them a sign-up link (and texts it too, if you enter a phone). They get access once they create their login. You can also re-send anytime with “Send invite” above.</p>
      </form>
    </div>
  )
}
