import { useEffect, useState } from 'react'
import { useEstate } from '../lib/EstateContext'
import { supabase } from '../lib/supabase'
import { isFullAccess } from '../lib/roles'
import { ASSET_TYPE_LABELS } from '../lib/assetTypes'
import { DISPOSED_ASSET_STATUSES } from '../lib/constants'

const fmt = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

export default function Inventory() {
  const { currentEstate, role } = useEstate()
  const [fin, setFin] = useState([])
  const [ledgerByAccount, setLedgerByAccount] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const [finRes, txnRes] = await Promise.all([
      supabase.from('estate_financials').select('*')
        .or(`estate_id.eq.${currentEstate.id},shared_with.cs.{${currentEstate.id}}`),
      supabase.from('estate_transactions').select('amount, account_id').eq('estate_id', currentEstate.id),
    ])
    setFin(finRes.data ?? [])
    const byAcct = {}
    for (const t of txnRes.data ?? []) if (t.account_id) byAcct[t.account_id] = (byAcct[t.account_id] ?? 0) + (t.amount ?? 0)
    setLedgerByAccount(byAcct)
    setLoading(false)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">The inventory is available to the executor only.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const accounts = fin.filter(f => f.category === 'account')
  const assets = fin.filter(f => f.category === 'asset')
  const liabilities = fin.filter(f => f.category === 'liability')
  const obligations = fin.filter(f => f.category === 'obligation')

  const acctCurrent = a => (a.amount ?? 0) + (ledgerByAccount[a.id] ?? 0)
  const totalAccounts = accounts.reduce((s, a) => s + acctCurrent(a), 0)
  const ownedAssets = assets.filter(a => !DISPOSED_ASSET_STATUSES.includes(a.status))
  const totalAssets = ownedAssets.reduce((s, a) => s + (a.amount ?? 0), 0)
  const totalLiab = liabilities.reduce((s, l) => s + (l.amount ?? 0), 0)
  const net = totalAssets - totalLiab
  const netWorth = totalAccounts + net

  // Assets grouped by type for readability.
  const byType = {}
  for (const a of assets) (byType[a.asset_type || 'other'] ||= []).push(a)

  const Section = ({ title, children }) => (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider border-b border-gray-300 dark:border-gray-700 pb-1 mb-2">{title}</h2>
      {children}
    </div>
  )
  const Row = ({ label, sub, value }) => (
    <div className="flex justify-between items-baseline py-1 text-sm border-b border-gray-100 dark:border-gray-800">
      <span className="text-gray-800 dark:text-gray-200">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</span>
      <span className="text-gray-700 dark:text-gray-300 tabular-nums">{value}</span>
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">Estate Inventory</h1>
        <button onClick={() => window.print()} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm">🖨 Print / Save PDF</button>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 print:border-0 print:p-0">
        <div className="mb-6">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">{currentEstate.deceased_name} — Estate Inventory</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Prepared {new Date().toLocaleDateString()} · Executor: {currentEstate.administrator_name || '—'}
            {currentEstate.state_of_residence ? ` · ${currentEstate.state_of_residence}` : ''}
          </div>
        </div>

        <Section title="Bank accounts">
          {accounts.length === 0 ? <div className="text-sm text-gray-400">None recorded.</div> :
            accounts.map(a => <Row key={a.id} label={a.name} value={fmt(acctCurrent(a))} />)}
          <div className="flex justify-between font-semibold text-sm pt-1"><span>Total cash</span><span className="tabular-nums">{fmt(totalAccounts)}</span></div>
        </Section>

        <Section title="Assets">
          {assets.length === 0 ? <div className="text-sm text-gray-400">None recorded.</div> :
            Object.keys(byType).sort().map(type => (
              <div key={type} className="mb-2">
                <div className="text-xs font-semibold text-gray-500 mt-1 mb-0.5">{ASSET_TYPE_LABELS[type] ?? type}</div>
                {byType[type].map(a => (
                  <Row key={a.id} label={a.name}
                    sub={[a.status && a.status !== 'undecided' ? a.status : null, a.beneficiary || null].filter(Boolean).join(' → ')}
                    value={fmt(a.amount)} />
                ))}
              </div>
            ))}
          <div className="flex justify-between font-semibold text-sm pt-1"><span>Total assets (excl. sold/distributed)</span><span className="tabular-nums">{fmt(totalAssets)}</span></div>
        </Section>

        <Section title="Liabilities">
          {liabilities.length === 0 ? <div className="text-sm text-gray-400">None recorded.</div> :
            liabilities.map(l => <Row key={l.id} label={l.name} sub={l.lender || null} value={fmt(l.amount)} />)}
          <div className="flex justify-between font-semibold text-sm pt-1"><span>Total liabilities</span><span className="tabular-nums">{fmt(totalLiab)}</span></div>
        </Section>

        {obligations.length > 0 && (
          <Section title="Monthly obligations">
            {obligations.map(o => <Row key={o.id} label={o.name} sub={o.status?.replace(/_/g, ' ')} value={`${fmt(o.amount)}/mo`} />)}
          </Section>
        )}

        <div className="mt-6 pt-3 border-t-2 border-gray-300 dark:border-gray-700 space-y-1">
          <div className="flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">Net (assets − liabilities)</span><span className={`font-semibold tabular-nums ${net < 0 ? 'text-red-700' : ''}`}>{fmt(net)}</span></div>
          <div className="flex justify-between text-base"><span className="font-semibold">Net worth (incl. cash)</span><span className={`font-bold tabular-nums ${netWorth < 0 ? 'text-red-700' : ''}`}>{fmt(netWorth)}</span></div>
        </div>

        <p className="text-[10px] text-gray-400 mt-6">Values are estimates unless an appraisal/statement is on file. This inventory is a working summary, not a legal filing or appraisal.</p>
      </div>
    </div>
  )
}
