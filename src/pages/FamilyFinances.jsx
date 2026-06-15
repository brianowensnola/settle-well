import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { ACTIVE_OBLIGATION_STATUSES, DISPOSED_ASSET_STATUSES } from '../lib/constants'

const fmt = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Roll-up math, mirroring the single-estate Finances page so totals match.
function totalsFor(rows) {
  const cat = c => rows.filter(r => r.category === c)
  return {
    balance: cat('account').reduce((s, a) => s + (a.amount ?? 0), 0),
    monthly: cat('obligation').filter(o => ACTIVE_OBLIGATION_STATUSES.includes(o.status)).reduce((s, o) => s + (o.amount ?? o.amount_max ?? o.amount_min ?? 0), 0),
    liabilities: cat('liability').reduce((s, l) => s + (l.amount ?? 0), 0),
    // Sold/distributed assets have left the estate — excluded from the total/count.
    assets: cat('asset').filter(a => !DISPOSED_ASSET_STATUSES.includes(a.status)).reduce((s, a) => s + (a.amount ?? 0), 0),
    assetCount: cat('asset').filter(a => !DISPOSED_ASSET_STATUSES.includes(a.status)).length,
  }
}

// Assets often have no dollar value entered yet — show the count so they're not
// invisible. Shows "$value (n)" when valued, "n items" when not, else "—".
const assetDisplay = t =>
  t.assets > 0
    ? `${fmt(t.assets)}${t.assetCount > 0 ? ` (${t.assetCount})` : ''}`
    : t.assetCount > 0 ? `${t.assetCount} item${t.assetCount !== 1 ? 's' : ''}` : '—'

export default function FamilyFinances() {
  const { currentEstate, role, estates } = useEstate()
  const [groupName, setGroupName] = useState('')
  const [financials, setFinancials] = useState([])
  const [ledgerByEstate, setLedgerByEstate] = useState({})
  const [loading, setLoading] = useState(true)

  const groupId = currentEstate?.group_id ?? null
  const members = (estates ?? []).filter(e => groupId && e.group_id === groupId)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate, groupId])

  async function load() {
    setLoading(true)
    if (!groupId || members.length === 0) { setLoading(false); return }
    const memberIds = members.map(e => e.id)
    const [finRes, txnRes, grpRes] = await Promise.all([
      supabase.from('estate_financials').select('*').in('estate_id', memberIds),
      supabase.from('estate_transactions').select('estate_id, amount').in('estate_id', memberIds),
      supabase.from('estate_groups').select('name').eq('id', groupId).maybeSingle(),
    ])
    setFinancials(finRes.data ?? [])
    const led = {}
    for (const t of txnRes.data ?? []) led[t.estate_id] = (led[t.estate_id] ?? 0) + (t.amount ?? 0)
    setLedgerByEstate(led)
    setGroupName(grpRes.data?.name ?? 'Family Estate')
    setLoading(false)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Family Finances is available to the executor only.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  if (!groupId || members.length < 2) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-2">Family Finances</h1>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 text-sm text-blue-900 dark:text-blue-300">
          This estate isn't part of a family group with other estates yet. Set one up in{' '}
          <Link to="/multi-settings" className="underline font-medium">Estate Management → Family estate</Link>{' '}
          to roll up finances across related estates.
        </div>
      </div>
    )
  }

  // Each item is recorded once under a home estate, so summing by home avoids
  // double-counting. Shared/joint items are bucketed separately for display.
  const sharedRows = financials.filter(f => f.shared_with?.length > 0)
  const ownRowsFor = id => financials.filter(f => f.estate_id === id && !(f.shared_with?.length > 0))

  const combined = totalsFor(financials)
  const combinedLedger = Object.values(ledgerByEstate).reduce((s, v) => s + v, 0)

  const SUMMARY = [
    { label: 'Account Balance', value: fmt(combined.balance) },
    { label: 'Monthly Obligations', value: fmt(combined.monthly) },
    { label: 'Liabilities', value: combined.liabilities > 0 ? fmt(combined.liabilities) : '—' },
    { label: 'Assets', value: assetDisplay(combined) },
    { label: 'Net (Assets − Liab.)', value: fmt(combined.assets - combined.liabilities), neg: (combined.assets - combined.liabilities) < 0 },
    { label: 'Net Worth (incl. accounts)', value: fmt(combined.balance + combined.assets - combined.liabilities), neg: (combined.balance + combined.assets - combined.liabilities) < 0 },
    { label: 'Ledger Balance', value: fmt(combinedLedger), neg: combinedLedger < 0 },
  ]

  // Breakdown rows: each member (own items), then Shared/joint, then Combined.
  const breakdown = [
    ...members.map(e => ({ key: e.id, label: e.deceased_name, t: totalsFor(ownRowsFor(e.id)), ledger: ledgerByEstate[e.id] ?? 0 })),
    { key: 'shared', label: 'Shared / joint', t: totalsFor(sharedRows), ledger: null },
  ]

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">{groupName} — Finances</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Combined across {members.length} estates. Joint items are counted once.</p>
      </div>

      {/* Combined summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {SUMMARY.map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className={`text-lg font-semibold ${s.neg ? 'text-red-700' : 'text-gray-900 dark:text-white'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Per-member breakdown */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-800">
                <th className="px-4 py-2.5 font-semibold">Estate</th>
                <th className="px-4 py-2.5 font-semibold text-right">Accounts</th>
                <th className="px-4 py-2.5 font-semibold text-right">Monthly</th>
                <th className="px-4 py-2.5 font-semibold text-right">Liabilities</th>
                <th className="px-4 py-2.5 font-semibold text-right">Assets</th>
                <th className="px-4 py-2.5 font-semibold text-right">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {breakdown.map(b => (
                <tr key={b.key}>
                  <td className="px-4 py-3 text-gray-800 dark:text-white">
                    {b.key !== 'shared' ? (
                      <Link to="/finances" className="hover:underline text-blue-600 dark:text-blue-400">{b.label}</Link>
                    ) : (
                      <span className="text-gray-600 dark:text-gray-400">↔ {b.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(b.t.balance)}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(b.t.monthly)}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{b.t.liabilities > 0 ? fmt(b.t.liabilities) : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{assetDisplay(b.t)}</td>
                  <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{b.ledger == null ? '—' : fmt(b.ledger)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <td className="px-4 py-3 text-gray-900 dark:text-white">Combined</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{fmt(combined.balance)}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{fmt(combined.monthly)}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{combined.liabilities > 0 ? fmt(combined.liabilities) : '—'}</td>
                <td className="px-4 py-3 text-right text-gray-900 dark:text-white">{assetDisplay(combined)}</td>
                <td className={`px-4 py-3 text-right ${combinedLedger < 0 ? 'text-red-700' : 'text-gray-900 dark:text-white'}`}>{fmt(combinedLedger)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Each financial item is recorded once under its home estate; joint items are shown in the "Shared / joint" row and counted a single time in the combined totals.
      </p>
    </div>
  )
}
