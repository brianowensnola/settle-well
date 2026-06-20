import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, getAccessToken } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'

// Keep keys in sync with the send-report function (builders + DRILL).
const REPORT_TYPES = [
  { key: 'assets', label: 'Asset List (full detail)' },
  { key: 'inventory', label: 'Estate Inventory (accounts, assets, debts, net worth)' },
  { key: 'ledger', label: 'Transaction Ledger / Accounting' },
  { key: 'liabilities', label: 'Debts & Monthly Obligations' },
  { key: 'reimbursements', label: 'Reimbursements (pending & paid)' },
  { key: 'contacts', label: 'Contacts Directory' },
  { key: 'tasks', label: 'Task & Progress Report' },
  { key: 'communications', label: 'Communications Log (calls, emails, letters, meetings)' },
]

export default function Reports() {
  const { currentEstate, role } = useEstate()
  const [reportType, setReportType] = useState('assets')
  const [path, setPath] = useState([])      // [{ key, label, value }] drill filters
  const [group, setGroup] = useState(null)  // which remaining dimension to group by
  const [drill, setDrill] = useState(null)  // { groupKey, groupLabel, values, remaining } from server
  const [html, setHtml] = useState('')
  const [building, setBuilding] = useState(false)
  const [contacts, setContacts] = useState([])
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!currentEstate) return
    supabase.from('estate_contacts')
      .select('id, name, email, emails')
      .or(`estate_id.eq.${currentEstate.id},shared_with.cs.{${currentEstate.id}}`)
      .order('name')
      .then(({ data }) => setContacts((data ?? []).filter(c => c.email || (c.emails && c.emails[0]))))
  }, [currentEstate])

  useEffect(() => { if (currentEstate) buildPreview() }, [currentEstate, reportType, path, group])

  function changeReport(key) { setReportType(key); setPath([]); setGroup(null); setDrill(null) }

  async function post(body) {
    const token = await getAccessToken()
    const resp = await fetch('/.netlify/functions/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ estateId: currentEstate.id, reportType, options: { path, group }, ...body }),
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(data.error || 'Request failed')
    return data
  }

  async function buildPreview() {
    setBuilding(true); setMsg('')
    try {
      const { html, drill } = await post({})
      setHtml(html || ''); setDrill(drill || null)
    } catch (e) { setMsg(`Could not build the report: ${e.message}`); setHtml('') }
    finally { setBuilding(false) }
  }

  async function emailReport() {
    if (!to) { setMsg('Pick a contact to send to.'); return }
    setSending(true); setMsg('')
    try {
      const data = await post({ recipientId: to, cc, bcc })
      setMsg(`✓ Report emailed to ${data.to}.`); setCc(''); setBcc('')
    } catch (e) { setMsg(`Could not send: ${e.message}`) }
    finally { setSending(false) }
  }

  function drillInto(value) {
    if (!value || !drill?.groupKey) return
    setPath(p => [...p, { key: drill.groupKey, label: drill.groupLabel, value }])
    setGroup(null)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Reports are available to the executor only.</div>

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">Reports</h1>
        <button onClick={() => window.print()} disabled={!html} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">🖨 Print / Save PDF</button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-5 print:hidden space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Report</label>
          <select value={reportType} onChange={e => changeReport(e.target.value)}
            className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
            {REPORT_TYPES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        {/* Drill path breadcrumb */}
        {path.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button onClick={() => { setPath([]); setGroup(null) }} className="text-blue-600 hover:underline">All</button>
            {path.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="text-gray-400">›</span>
                <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{f.label}: {f.value}
                  <button onClick={() => { setPath(p => p.slice(0, i)); setGroup(null) }} className="ml-1 text-gray-400 hover:text-red-500">×</button>
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Group by + drill into the current dimension */}
        {drill && (drill.remaining?.length > 0) && (
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Group by</label>
              <select value={drill.groupKey || ''} onChange={e => setGroup(e.target.value)}
                className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                {drill.remaining.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            {drill.values?.length > 0 && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">Drill into a {drill.groupLabel?.toLowerCase()}</label>
                <select value="" onChange={e => drillInto(e.target.value)}
                  className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">— pick one —</option>
                  {drill.values.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
          <label className="text-xs text-gray-500 block mb-1">Email this report to a contact</label>
          {contacts.length === 0 ? (
            <p className="text-sm text-gray-400">No contacts with an email yet. Add one in <Link to="/contacts" className="text-blue-600 hover:underline">Contacts</Link>.</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                  <option value="">Send to…</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email || c.emails?.[0]})</option>)}
                </select>
                <input value={cc} onChange={e => setCc(e.target.value)} placeholder="CC (optional)" className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                <input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="BCC (optional)" className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
              </div>
              <button onClick={emailReport} disabled={sending || !to || !html} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm disabled:opacity-50">
                {sending ? 'Sending…' : 'Email report'}
              </button>
              <p className="text-xs text-gray-400">Sends exactly the view below (current drill) from noreply@bastroplaundrypro.com, and logs the send. Private items excluded.</p>
            </div>
          )}
        </div>
        {msg && <div className="text-sm text-gray-700 dark:text-gray-300">{msg}</div>}
      </div>

      {/* Preview (white "document", also what prints) */}
      <div className="bg-white border border-gray-200 dark:border-gray-700 rounded-xl p-6 print:border-0 print:p-0 overflow-x-auto">
        {building ? <div className="text-sm text-gray-400">Building report…</div>
          : html ? <div dangerouslySetInnerHTML={{ __html: html }} />
          : <div className="text-sm text-gray-400">No report.</div>}
      </div>
    </div>
  )
}
