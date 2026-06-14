import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { DEATH_NOTIFICATION_DIRECTORY } from '../lib/deathNotificationDirectory'

const TYPES = [
  ['government', 'Government agency'],
  ['credit_bureau', 'Credit bureau'],
  ['financial', 'Bank / lender / brokerage'],
  ['insurance', 'Insurance company'],
  ['pension', 'Pension / benefits'],
  ['utility', 'Utility / subscription'],
  ['other', 'Other'],
]

const roleToType = r => ({ bank: 'financial', lender: 'financial' }[r] || 'other')

export default function DeathNotifications() {
  const { currentEstate, role } = useEstate()
  const [contacts, setContacts] = useState([])
  const [form, setForm] = useState({ name: '', type: 'government', address: '', email: '', notes: '' })
  const [method, setMethod] = useState('mail')        // mail | phone | online
  const [info, setInfo] = useState(null)              // { phone, url, note } for phone/online
  const [letter, setLetter] = useState('')
  const [sources, setSources] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [logged, setLogged] = useState(false)

  useEffect(() => {
    if (!currentEstate) return
    supabase.from('estate_contacts').select('id, name, role, address, emails')
      .or(`estate_id.eq.${currentEstate.id},shared_with.cs.{${currentEstate.id}}`)
      .order('name').then(({ data }) => setContacts(data ?? []))
  }, [currentEstate])

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Executor access required.</div>

  function reset() { setLetter(''); setSources(''); setError(''); setLogged(false) }

  function pickDirectory(entry) {
    reset()
    setForm(f => ({ ...f, name: entry.name, type: entry.type, address: '', email: '' }))
    setMethod(entry.method)
    setInfo(entry.method === 'mail' ? null : { phone: entry.phone, url: entry.url, note: entry.note })
  }
  function pickContact(id) {
    const c = contacts.find(x => x.id === id)
    if (!c) return
    reset(); setMethod('mail'); setInfo(null)
    setForm(f => ({ ...f, name: c.name, address: c.address || '', email: (c.emails && c.emails[0]) || '', type: roleToType(c.role) }))
  }
  function editName(v) { setMethod('mail'); setInfo(null); reset(); setForm(f => ({ ...f, name: v })) }

  async function generate() {
    if (!form.name.trim()) { setError('Enter who the notice is going to.'); return }
    setBusy(true); reset()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/.netlify/functions/death-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ estateId: currentEstate.id, recipientName: form.name, recipientType: form.type, recipientAddress: form.address, notes: form.notes }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Draft failed')
      setLetter(data.letter || ''); setSources(data.sources || '')
    } catch (e) { setError(e.message || 'Draft failed') }
    finally { setBusy(false) }
  }

  function copyLetter() { navigator.clipboard.writeText(letter) }
  function printLetter() {
    const w = window.open('', '_blank'); if (!w) return
    const esc = letter.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]))
    w.document.write(`<pre style="font-family: Georgia, serif; white-space: pre-wrap; padding: 40px; font-size: 13px; line-height:1.5">${esc}</pre>`)
    w.document.close(); w.focus(); w.print()
  }
  function emailLetter() {
    window.location.href = `mailto:${form.email || ''}?subject=${encodeURIComponent(`Notice of death — ${currentEstate.deceased_name}`)}&body=${encodeURIComponent(letter)}`
  }
  async function logSent() {
    const { data: sec } = await supabase.from('estate_sections')
      .select('id').eq('estate_id', currentEstate.id).eq('label', 'Phase 3 — Government Notifications').maybeSingle()
    await supabase.from('estate_tasks').insert({
      estate_id: currentEstate.id, section_id: sec?.id ?? null,
      text: `Death notification sent — ${form.name}`, status: 'done', tag: 'notification', detail: form.notes || null,
    })
    setLogged(true)
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">Death Notifications</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Notify agencies, banks, and companies of the death. Some are handled by phone/online; for mailed notices the address is looked up and shown so you can verify it. Assistance, not legal advice.</p>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      {/* Directory */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <div className="text-xs text-gray-500 mb-2">Common recipients</div>
        <div className="flex gap-1.5 flex-wrap">
          {DEATH_NOTIFICATION_DIRECTORY.map(e => (
            <button key={e.name} onClick={() => pickDirectory(e)}
              className={`text-xs px-2 py-1 rounded-lg ${form.name === e.name ? 'bg-gray-900 text-white dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200'}`}>
              {e.name}{e.method !== 'mail' ? (e.method === 'phone' ? ' ☎' : ' 🌐') : ''}
            </button>
          ))}
        </div>
        {contacts.length > 0 && (
          <div className="mt-3">
            <label className="text-xs text-gray-500 block mb-1">…or from your contacts</label>
            <select onChange={e => pickContact(e.target.value)} value=""
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">Choose a contact…</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Phone / online recipients: just tell them how to handle it */}
      {(method === 'phone' || method === 'online') && info && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">{form.name}</div>
          {method === 'phone'
            ? <div className="text-sm text-amber-800 dark:text-amber-300">Handle this <strong>by phone</strong>: <a href={`tel:${(info.phone||'').replace(/[^0-9+]/g,'')}`} className="underline font-medium">{info.phone}</a></div>
            : <div className="text-sm text-amber-800 dark:text-amber-300">Handle this <strong>online</strong>{info.url ? <>: <a href={info.url} target="_blank" rel="noopener noreferrer" className="underline font-medium">{info.url}</a></> : ''}</div>}
          {info.note && <p className="text-xs text-amber-700 dark:text-amber-300/80 mt-2">{info.note}</p>}
          <button onClick={logSent} disabled={logged} className="mt-3 text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
            {logged ? '✓ Logged as done' : 'Mark as done (log it)'}
          </button>
        </div>
      )}

      {/* Mail/email recipients: draft a letter */}
      {method === 'mail' && (
        <>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Recipient</label>
                <input value={form.name} onChange={e => editName(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                  {TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Recipient email (optional)</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Recipient address (optional — left blank, it's looked up)</label>
                <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2}
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 block mb-1">Anything specific to include? (optional)</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. account number, policy number, request a refund…"
                  className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
            </div>
            <button onClick={generate} disabled={busy || !form.name.trim()}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
              {busy ? 'Looking up & drafting…' : 'Draft letter'}
            </button>
          </div>

          {letter && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Draft — review &amp; edit</h2>
                <div className="flex gap-2">
                  <button onClick={copyLetter} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">Copy</button>
                  <button onClick={printLetter} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">Print</button>
                  <button onClick={emailLetter} className="text-xs px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">Email</button>
                </div>
              </div>
              <textarea value={letter} onChange={e => setLetter(e.target.value)} rows={18}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none font-serif leading-relaxed" />
              {sources && sources.toLowerCase() !== 'none' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2"><span className="font-medium">Address source(s):</span> {sources} — <span className="text-amber-600">verify before mailing.</span></p>
              )}
              <p className="text-xs text-gray-400 mt-1">Fill any [BRACKETED] placeholders (SSN, account numbers) before sending. Enclose a certified death certificate.</p>
              <div className="mt-3">
                <button onClick={logSent} disabled={logged} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {logged ? '✓ Logged as sent' : 'Mark as sent (log it)'}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
