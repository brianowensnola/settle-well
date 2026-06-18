import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, getAccessToken } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { ASSET_TYPE_LABELS } from '../lib/assetTypes'
import { DISPOSED_ASSET_STATUSES } from '../lib/constants'

const fmt = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function Reports() {
  const { currentEstate, role } = useEstate()
  const [assets, setAssets] = useState([])
  const [contacts, setContacts] = useState([])
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (currentEstate) load() }, [currentEstate])

  async function load() {
    setLoading(true)
    const [aRes, cRes] = await Promise.all([
      supabase.from('estate_financials').select('*').eq('estate_id', currentEstate.id).eq('category', 'asset').order('asset_type').order('name'),
      supabase.from('estate_contacts').select('id, name, email, emails, role').or(`estate_id.eq.${currentEstate.id},shared_with.cs.{${currentEstate.id}}`).order('name'),
    ])
    setAssets(aRes.data ?? [])
    setContacts((cRes.data ?? []).filter(c => c.email || (c.emails && c.emails[0])))
    setLoading(false)
  }

  async function sendReport() {
    if (!to) { setMsg('Pick a contact to send to.'); return }
    setSending(true); setMsg('')
    try {
      const token = await getAccessToken()
      const resp = await fetch('/.netlify/functions/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ estateId: currentEstate.id, recipientId: to, cc, bcc }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(data.error || 'Send failed')
      setMsg(`✓ Asset List emailed to ${data.to}.`)
      setCc(''); setBcc('')
    } catch (e) { setMsg(`Could not send: ${e.message}`) }
    finally { setSending(false) }
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Reports are available to the executor only.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const byType = {}
  for (const a of assets) (byType[a.asset_type || 'other'] ||= []).push(a)
  const total = assets.filter(a => !DISPOSED_ASSET_STATUSES.includes(a.status)).reduce((s, a) => s + (a.amount ?? 0), 0)
  const cName = email => email

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">Reports</h1>
        <button onClick={() => window.print()} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm">🖨 Print / Save PDF</button>
      </div>

      {/* Other reports */}
      <div className="flex gap-3 mb-4 print:hidden text-sm">
        <Link to="/inventory" className="text-blue-600 hover:underline">Estate Inventory →</Link>
      </div>

      {/* Send to a contact */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-5 print:hidden">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Email this Asset List to a contact</h2>
        {msg && <div className="text-sm text-gray-700 dark:text-gray-300 mb-3">{msg}</div>}
        {contacts.length === 0 ? (
          <p className="text-sm text-gray-400">No contacts with an email yet. Add one in <Link to="/contacts" className="text-blue-600 hover:underline">Contacts</Link>.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">Send to…</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email || c.emails?.[0]})</option>)}
              </select>
              <input value={cc} onChange={e => setCc(e.target.value)} placeholder="CC (optional, comma-separated)" className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              <input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="BCC (optional)" className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <button onClick={sendReport} disabled={sending || !to} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
              {sending ? 'Sending…' : 'Email report'}
            </button>
            <p className="text-xs text-gray-400">Sends the Asset List below (non-private assets) from noreply@bastroplaundrypro.com, and logs the send.</p>
          </div>
        )}
      </div>

      {/* The report */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 print:border-0 print:p-0">
        <div className="mb-5">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">{currentEstate.deceased_name} — Asset List</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Prepared {new Date().toLocaleDateString()}{currentEstate.state_of_residence ? ` · ${currentEstate.state_of_residence}` : ''} · {assets.length} asset{assets.length !== 1 ? 's' : ''}</div>
        </div>

        {assets.length === 0 ? <div className="text-sm text-gray-400">No assets recorded.</div> : Object.keys(byType).sort().map(type => (
          <div key={type} className="mb-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-300 dark:border-gray-700 pb-1 mb-2">{ASSET_TYPE_LABELS[type] ?? type}</div>
            <div className="space-y-3">
              {byType[type].map(a => (
                <div key={a.id} className="text-sm border-b border-gray-100 dark:border-gray-800 pb-2">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="font-medium text-gray-900 dark:text-white">{a.name}</span>
                    <span className="text-gray-700 dark:text-gray-300 tabular-nums shrink-0">{fmt(a.amount)}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                    {a.vin_serial && <span>VIN/Serial: {a.vin_serial}</span>}
                    {a.status && a.status !== 'undecided' && <span>Disposition: {a.status}</span>}
                    {a.beneficiary && <span>Beneficiary: {a.beneficiary}</span>}
                    {a.location && <span>Location/legal: {a.location}</span>}
                    {a.condition && <span>Condition: {a.condition}</span>}
                    {a.lender && <span>Lien/lender: {a.lender}</span>}
                    {(a.valuation_source || a.valuation_date) && <span>Valuation: {[a.valuation_source, a.valuation_date].filter(Boolean).join(' · ')}</span>}
                    {a.notes && <span className="sm:col-span-2">Notes: {a.notes}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-4 pt-3 border-t-2 border-gray-300 dark:border-gray-700 flex justify-between text-sm font-semibold">
          <span>Total (excl. sold/distributed)</span>
          <span className="tabular-nums">{fmt(total)}</span>
        </div>
        <p className="text-[10px] text-gray-400 mt-4">Values are estimates unless an appraisal/statement is on file. Working summary, not a legal filing or appraisal.</p>
      </div>
    </div>
  )
}
