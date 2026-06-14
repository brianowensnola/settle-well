import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'

const PRESETS = [
  { name: 'Social Security Administration', type: 'government' },
  { name: 'Internal Revenue Service (IRS)', type: 'government' },
  { name: 'Equifax', type: 'credit_bureau' },
  { name: 'Experian', type: 'credit_bureau' },
  { name: 'TransUnion', type: 'credit_bureau' },
  { name: 'State DMV', type: 'government' },
  { name: 'U.S. Postal Service (mail hold/forward)', type: 'government' },
]

const TYPES = [
  ['government', 'Government agency'],
  ['credit_bureau', 'Credit bureau'],
  ['financial', 'Bank / lender / brokerage'],
  ['insurance', 'Insurance company'],
  ['pension', 'Pension / benefits'],
  ['utility', 'Utility / subscription'],
  ['other', 'Other'],
]

const roleToType = r => ({ bank: 'financial', lender: 'financial', attorney: 'other', funeral_home: 'other' }[r] || 'other')

export default function DeathNotifications() {
  const { currentEstate, role } = useEstate()
  const [contacts, setContacts] = useState([])
  const [form, setForm] = useState({ name: '', type: 'government', address: '', email: '', notes: '' })
  const [letter, setLetter] = useState('')
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

  function pickContact(id) {
    const c = contacts.find(x => x.id === id)
    if (!c) return
    setForm(f => ({ ...f, name: c.name, address: c.address || '', email: (c.emails && c.emails[0]) || '', type: roleToType(c.role) }))
  }

  async function generate() {
    if (!form.name.trim()) { setError('Enter who the notice is going to.'); return }
    setBusy(true); setError(''); setLetter(''); setLogged(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/.netlify/functions/death-notice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          estateId: currentEstate.id, recipientName: form.name, recipientType: form.type,
          recipientAddress: form.address, notes: form.notes,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Draft failed')
      setLetter(data.letter || '')
    } catch (e) { setError(e.message || 'Draft failed') }
    finally { setBusy(false) }
  }

  function copyLetter() { navigator.clipboard.writeText(letter); }
  function printLetter() {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<pre style="font-family: Georgia, serif; white-space: pre-wrap; padding: 40px; font-size: 13px; line-height:1.5">${letter.replace(/[<>&]/g, s => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s]))}</pre>`)
    w.document.close(); w.focus(); w.print()
  }
  function emailLetter() {
    const subject = encodeURIComponent(`Notice of death — ${currentEstate.deceased_name}`)
    const body = encodeURIComponent(letter)
    window.location.href = `mailto:${form.email || ''}?subject=${subject}&body=${body}`
  }
  async function logSent() {
    const { data: sec } = await supabase.from('estate_sections')
      .select('id').eq('estate_id', currentEstate.id).eq('label', 'Phase 3 — Government Notifications').maybeSingle()
    await supabase.from('estate_tasks').insert({
      estate_id: currentEstate.id, section_id: sec?.id ?? null,
      text: `Death notification sent — ${form.name}`, status: 'done', tag: 'notification',
      detail: form.notes || null,
    })
    setLogged(true)
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">Death Notifications</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Draft a notification letter for an agency, bank, or company — pre-filled from this estate. Review and edit before sending. Assistance, not legal advice.</p>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>}

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4 space-y-3">
        {/* quick fill */}
        <div>
          <div className="text-xs text-gray-500 mb-1">Common recipients</div>
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.name} onClick={() => setForm(f => ({ ...f, name: p.name, type: p.type }))}
                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200">{p.name}</button>
            ))}
          </div>
        </div>
        {contacts.length > 0 && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">…or from your contacts</label>
            <select onChange={e => pickContact(e.target.value)} value=""
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
              <option value="">Choose a contact…</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-gray-500 block mb-1">Recipient</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
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
            <label className="text-xs text-gray-500 block mb-1">Recipient address (optional)</label>
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
          {busy ? 'Drafting…' : 'Draft letter'}
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
          <p className="text-xs text-gray-400 mt-1">Fill any [BRACKETED] placeholders (SSN, account numbers) before sending. Enclose a certified death certificate.</p>
          <div className="mt-3">
            <button onClick={logSent} disabled={logged} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              {logged ? '✓ Logged as sent' : 'Mark as sent (log it)'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
