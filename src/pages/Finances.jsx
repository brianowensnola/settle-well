import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

const CATEGORIES = [
  { key: 'account',              label: 'Accounts' },
  { key: 'obligation',           label: 'Monthly Obligations' },
  { key: 'liability',            label: 'Liabilities' },
  { key: 'asset',                label: 'Assets' },
  { key: 'insurance_resolved',   label: 'Insurance — Resolved' },
  { key: 'insurance_pending',    label: 'Insurance — Pending' },
]

const STATUS_BADGE = {
  active:           'bg-blue-100 text-blue-700',
  pending:          'bg-yellow-100 text-yellow-700',
  cancel:           'bg-red-100 text-red-700',
  cancel_on_vacate: 'bg-orange-100 text-orange-700',
  done:             'bg-green-100 text-green-700',
  lapsed:           'bg-gray-100 text-gray-500',
  paid_out:         'bg-green-100 text-green-700',
  resolved:         'bg-green-100 text-green-700',
  cancelled:        'bg-gray-100 text-gray-500',
  unknown:          'bg-gray-100 text-gray-500',
  in_progress:      'bg-blue-100 text-blue-700',
  waiting:          'bg-amber-100 text-amber-700',
  likely_lapsed:    'bg-gray-100 text-gray-500',
}

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function amountDisplay(row) {
  if (row.amount != null) return fmt(row.amount)
  if (row.amount_min != null && row.amount_max != null) {
    if (row.amount_min === row.amount_max) return fmt(row.amount_min) + '/mo'
    return `${fmt(row.amount_min)}–${fmt(row.amount_max)}/mo`
  }
  if (row.amount_min != null) return fmt(row.amount_min) + '/mo'
  return '—'
}

export default function Finances() {
  const { currentEstate } = useEstate()
  const [financials, setFinancials] = useState([])
  const [expanded, setExpanded] = useState({})
  const [editing, setEditing] = useState(null)
  const [editData, setEditData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const { data } = await supabase.from('estate_financials').select('*').eq('estate_id', currentEstate.id).order('sort_order')
    setFinancials(data ?? [])
    setLoading(false)
  }

  async function saveEdit() {
    await supabase.from('estate_financials').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', editing)
    setFinancials(prev => prev.map(f => f.id === editing ? { ...f, ...editData } : f))
    setEditing(null)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const byCategory = Object.fromEntries(CATEGORIES.map(c => [c.key, financials.filter(f => f.category === c.key)]))

  const accounts = byCategory.account
  const obligations = byCategory.obligation
  const liabilities = byCategory.liability
  const assets = byCategory.asset

  const totalBalance = accounts.reduce((s, a) => s + (a.amount ?? 0), 0)
  const monthlyBurn = obligations.filter(o => ['active', 'unknown'].includes(o.status)).reduce((s, o) => s + (o.amount_max ?? o.amount_min ?? 0), 0)
  const totalLiabilities = liabilities.reduce((s, l) => s + (l.amount ?? 0), 0)
  const totalAssets = assets.reduce((s, a) => s + (a.amount ?? 0), 0)

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Finances</h1>
        <Link to="/transactions" className="text-sm text-blue-600 hover:underline">Transaction ledger →</Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Account Balance', value: fmt(totalBalance) },
          { label: 'Monthly Obligations', value: fmt(monthlyBurn) },
          { label: 'Known Liabilities', value: totalLiabilities > 0 ? fmt(totalLiabilities) : '—' },
          { label: 'Known Assets', value: totalAssets > 0 ? fmt(totalAssets) : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className="text-lg font-semibold text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {CATEGORIES.map(cat => {
          const items = byCategory[cat.key] ?? []
          return (
            <div key={cat.key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <span className="text-sm font-semibold text-gray-700">{cat.label}</span>
                <span className="text-xs text-gray-400 ml-2">({items.length})</span>
              </div>
              {items.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400">None recorded.</div>
              )}
              <div className="divide-y divide-gray-100">
                {items.map(row => (
                  <div key={row.id}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                      onClick={() => setExpanded(p => ({ ...p, [row.id]: !p[row.id] }))}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm text-gray-800 truncate">{row.name}</span>
                        {row.status && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {row.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-700 shrink-0 ml-4">{amountDisplay(row)}</span>
                    </button>

                    {expanded[row.id] && (
                      <div className="px-4 pb-4 bg-gray-50 text-sm space-y-2">
                        {row.lender && <div><span className="text-gray-400">Lender: </span>{row.lender}</div>}
                        {row.collateral && <div><span className="text-gray-400">Collateral: </span>{row.collateral}</div>}
                        {row.notes && <div className="text-gray-600">{row.notes}</div>}
                        {editing === row.id ? (
                          <div className="space-y-2 pt-2">
                            <textarea
                              value={editData.notes ?? ''}
                              onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                              rows={3}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                              placeholder="Notes..."
                            />
                            <div className="flex gap-2">
                              <button onClick={saveEdit} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs">Save</button>
                              <button onClick={() => setEditing(null)} className="px-3 py-1 text-gray-500 rounded-lg text-xs hover:bg-gray-100">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditing(row.id); setEditData({ notes: row.notes ?? '' }) }}
                            className="text-xs text-blue-600 hover:underline pt-1"
                          >
                            Edit notes
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
