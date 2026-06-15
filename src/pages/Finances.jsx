import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'

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
  lapsed:           'bg-gray-100 dark:bg-gray-800 text-gray-500',
  paid_out:         'bg-green-100 text-green-700',
  resolved:         'bg-green-100 text-green-700',
  cancelled:        'bg-gray-100 dark:bg-gray-800 text-gray-500',
  unknown:          'bg-gray-100 dark:bg-gray-800 text-gray-500',
  in_progress:      'bg-blue-100 text-blue-700',
  waiting:          'bg-amber-100 text-amber-700',
  likely_lapsed:    'bg-gray-100 dark:bg-gray-800 text-gray-500',
  // asset dispositions
  undecided:        'bg-gray-100 dark:bg-gray-800 text-gray-500',
  keep:             'bg-blue-100 text-blue-700',
  sell:             'bg-amber-100 text-amber-700',
  transfer:         'bg-blue-100 text-blue-700',
  sold:             'bg-green-100 text-green-700',
  distributed:      'bg-green-100 text-green-700',
}

// Asset type → which task phase its auto-created disposition task lands in
const ASSET_TYPES = [
  { key: 'real_estate', label: 'Real estate',                 phase: 'Phase 6 — Real Estate & Property' },
  { key: 'vehicle',     label: 'Vehicle',                     phase: 'Phase 6 — Real Estate & Property' },
  { key: 'personal',    label: 'Personal property / valuables', phase: 'Phase 6 — Real Estate & Property' },
  { key: 'business',    label: 'Business interest',           phase: 'Phase 8 — Business Interests' },
  { key: 'financial',   label: 'Financial account',           phase: 'Phase 4 — Financial Accounts' },
  { key: 'other',       label: 'Other',                       phase: 'Phase 11 — Commonly Missed Items' },
]
const DISPOSITIONS = ['undecided', 'keep', 'sell', 'transfer', 'sold', 'distributed']

// Status choices and amount label per (non-asset) category
const STATUS_OPTIONS = {
  account:            ['active', 'transferred', 'closed', 'unknown'],
  obligation:         ['active', 'cancel', 'cancel_on_vacate', 'cancelled', 'unknown'],
  liability:          ['active', 'paid_out', 'disputed', 'unknown'],
  insurance_resolved: ['resolved', 'paid_out', 'lapsed', 'unknown'],
  insurance_pending:  ['pending', 'paid_out', 'lapsed', 'resolved', 'unknown'],
}
const statusOptionsFor = c => STATUS_OPTIONS[c] ?? ['active', 'pending', 'unknown', 'resolved', 'closed']
const amountLabelFor = c =>
  c === 'account' ? 'Balance' : c === 'obligation' ? 'Monthly amount' : c === 'liability' ? 'Amount owed' : 'Amount'

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
  const { currentEstate, role } = useEstate()
  const canSeePrivate = isFullAccess(role)
  const [financials, setFinancials] = useState([])
  const [expanded, setExpanded] = useState({})
  const [editing, setEditing] = useState(null)
  const [editData, setEditData] = useState({})
  const [addingCategory, setAddingCategory] = useState(null) // which category's add form is open
  const [assetForm, setAssetForm] = useState({ name: '', type: 'real_estate', value: '', status: 'undecided', notes: '' })
  const [finForm, setFinForm] = useState({ name: '', amount: '', lender: '', status: '', is_private: false, notes: '' })
  const [linkedTasks, setLinkedTasks] = useState({}) // financial_id -> [tasks]
  const [ledger, setLedger] = useState({ net: 0, count: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const { data } = await supabase.from('estate_financials').select('*').eq('estate_id', currentEstate.id).order('sort_order')
    setFinancials(data ?? [])
    // Transaction-ledger summary (running balance = money in minus out)
    const { data: txns } = await supabase.from('estate_transactions').select('amount').eq('estate_id', currentEstate.id)
    setLedger({ net: (txns ?? []).reduce((s, t) => s + (t.amount ?? 0), 0), count: (txns ?? []).length })
    // Tasks linked to an asset, so each asset can show its related tasks
    const { data: tdata } = await supabase
      .from('estate_tasks')
      .select('id, text, status, linked_financial_id')
      .eq('estate_id', currentEstate.id)
      .not('linked_financial_id', 'is', null)
    const map = {}
    for (const t of tdata ?? []) (map[t.linked_financial_id] ||= []).push(t)
    setLinkedTasks(map)
    setLoading(false)
  }

  async function addAsset() {
    if (!assetForm.name.trim()) return
    const { data: asset } = await supabase.from('estate_financials').insert({
      estate_id: currentEstate.id,
      category: 'asset',
      name: assetForm.name.trim(),
      amount: assetForm.value ? Number(assetForm.value) : null,
      status: assetForm.status,
      notes: assetForm.notes,
      is_private: false,
    }).select().single()
    if (asset) {
      setFinancials(prev => [...prev, asset])
      // Auto-create a linked disposition task in the matching phase
      const typeDef = ASSET_TYPES.find(t => t.key === assetForm.type) ?? ASSET_TYPES[0]
      const { data: sec } = await supabase.from('estate_sections')
        .select('id').eq('estate_id', currentEstate.id).eq('label', typeDef.phase).maybeSingle()
      if (sec) {
        const { data: task } = await supabase.from('estate_tasks').insert({
          estate_id: currentEstate.id,
          section_id: sec.id,
          text: `Decide: keep, sell, or transfer — ${asset.name}`,
          tag: 'Asset disposition',
          status: 'pending',
          linked_financial_id: asset.id,
        }).select('id, text, status, linked_financial_id').single()
        if (task) setLinkedTasks(prev => ({ ...prev, [asset.id]: [task] }))
      }
    }
    setAddingCategory(null)
    setAssetForm({ name: '', type: 'real_estate', value: '', status: 'undecided', notes: '' })
  }

  // Add an account / obligation / liability / insurance entry
  async function addFinancial(category) {
    if (!finForm.name.trim()) return
    const { data } = await supabase.from('estate_financials').insert({
      estate_id: currentEstate.id,
      category,
      name: finForm.name.trim(),
      amount: finForm.amount ? Number(finForm.amount) : null,
      lender: finForm.lender || null,
      status: finForm.status || 'unknown',
      notes: finForm.notes || null,
      is_private: finForm.is_private,
    }).select().single()
    if (data) setFinancials(prev => [...prev, data])
    setAddingCategory(null)
    setFinForm({ name: '', amount: '', lender: '', status: '', is_private: false, notes: '' })
  }

  async function saveEdit() {
    await supabase.from('estate_financials').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', editing)
    setFinancials(prev => prev.map(f => f.id === editing ? { ...f, ...editData } : f))
    setEditing(null)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const byCategory = Object.fromEntries(CATEGORIES.map(c => [c.key, financials.filter(f => f.category === c.key && (canSeePrivate || !f.is_private))]))

  const accounts = byCategory.account
  const obligations = byCategory.obligation
  const liabilities = byCategory.liability
  const assets = byCategory.asset

  const totalBalance = accounts.reduce((s, a) => s + (a.amount ?? 0), 0)
  const monthlyBurn = obligations.filter(o => ['active', 'unknown'].includes(o.status)).reduce((s, o) => s + (o.amount ?? o.amount_max ?? o.amount_min ?? 0), 0)
  const totalLiabilities = liabilities.reduce((s, l) => s + (l.amount ?? 0), 0)
  const totalAssets = assets.reduce((s, a) => s + (a.amount ?? 0), 0)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Finances</h1>
        <Link to="/transactions" className="text-sm text-blue-600 hover:underline">Transaction ledger →</Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Account Balance', value: fmt(totalBalance) },
          { label: 'Monthly Obligations', value: fmt(monthlyBurn) },
          { label: 'Known Liabilities', value: totalLiabilities > 0 ? fmt(totalLiabilities) : '—' },
          { label: 'Known Assets', value: totalAssets > 0 ? fmt(totalAssets) : '—' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">{s.label}</div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{s.value}</div>
          </div>
        ))}
        {/* Transaction-ledger summary */}
        <Link to="/transactions" className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:shadow-md transition-shadow block">
          <div className="text-xs text-gray-500 mb-1">Ledger Balance</div>
          <div className={`text-lg font-semibold ${ledger.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {ledger.net < 0 ? '-' : ''}{fmt(Math.abs(ledger.net))}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">{ledger.count} transaction{ledger.count !== 1 ? 's' : ''}</div>
        </Link>
      </div>

      <div className="space-y-5">
        {CATEGORIES.map(cat => {
          const items = byCategory[cat.key] ?? []
          return (
            <div key={cat.key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{cat.label}</span>
                  <span className="text-xs text-gray-400 ml-2">({items.length})</span>
                </div>
                {addingCategory !== cat.key && (
                  <button onClick={() => setAddingCategory(cat.key)} className="text-xs px-2.5 py-1 bg-gray-900 dark:bg-gray-700 text-white rounded-lg">+ Add</button>
                )}
              </div>

              {/* Asset add form (rich — type + disposition + auto-task) */}
              {cat.key === 'asset' && addingCategory === 'asset' && (
                <div className="px-4 py-3 border-b border-gray-100 bg-blue-50 dark:bg-blue-900/20 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={assetForm.name} onChange={e => setAssetForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Asset name (e.g. 2019 Infiniti QX60)" autoFocus
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <select value={assetForm.type} onChange={e => setAssetForm(p => ({ ...p, type: e.target.value }))}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none">
                      {ASSET_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <select value={assetForm.status} onChange={e => setAssetForm(p => ({ ...p, status: e.target.value }))}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none capitalize">
                      {DISPOSITIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <input type="number" value={assetForm.value} onChange={e => setAssetForm(p => ({ ...p, value: e.target.value }))}
                      placeholder="Est. value (optional)"
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <textarea value={assetForm.notes} onChange={e => setAssetForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Notes (optional)" rows={2}
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                  </div>
                  <p className="text-xs text-gray-500">A linked "Decide: keep, sell, or transfer" task will be created automatically.</p>
                  <div className="flex gap-2">
                    <button onClick={addAsset} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Add asset</button>
                    <button onClick={() => setAddingCategory(null)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                  </div>
                </div>
              )}

              {/* Generic add form for accounts / obligations / liabilities / insurance */}
              {cat.key !== 'asset' && addingCategory === cat.key && (
                <div className="px-4 py-3 border-b border-gray-100 bg-blue-50 dark:bg-blue-900/20 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={finForm.name} onChange={e => setFinForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="Name (e.g. Wells Fargo checking, PNC mortgage)" autoFocus
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <input type="number" value={finForm.amount} onChange={e => setFinForm(p => ({ ...p, amount: e.target.value }))}
                      placeholder={`${amountLabelFor(cat.key)} (optional)`}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    <select value={finForm.status} onChange={e => setFinForm(p => ({ ...p, status: e.target.value }))}
                      className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none capitalize">
                      <option value="">Status…</option>
                      {statusOptionsFor(cat.key).map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                    </select>
                    {(cat.key === 'liability' || cat.key === 'obligation') && (
                      <input value={finForm.lender} onChange={e => setFinForm(p => ({ ...p, lender: e.target.value }))}
                        placeholder="Lender / payee (optional)"
                        className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                    )}
                    <textarea value={finForm.notes} onChange={e => setFinForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Notes (optional)" rows={2}
                      className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input type="checkbox" checked={finForm.is_private} onChange={e => setFinForm(p => ({ ...p, is_private: e.target.checked }))} />
                    Private — hide from heirs' transparency report
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => addFinancial(cat.key)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Add</button>
                    <button onClick={() => setAddingCategory(null)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
                  </div>
                </div>
              )}

              {items.length === 0 && (
                <div className="px-4 py-3 text-sm text-gray-400">None recorded.</div>
              )}
              <div className="divide-y divide-gray-100">
                {items.map(row => (
                  <div key={row.id}>
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:bg-gray-800"
                      onClick={() => setExpanded(p => ({ ...p, [row.id]: !p[row.id] }))}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm text-gray-800 dark:text-white truncate">{row.name}</span>
                        {row.status && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[row.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
                            {row.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 ml-4">{amountDisplay(row)}</span>
                    </button>

                    {expanded[row.id] && (
                      <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-800 text-sm space-y-2">
                        {row.lender && <div><span className="text-gray-400">Lender: </span>{row.lender}</div>}
                        {row.collateral && <div><span className="text-gray-400">Collateral: </span>{row.collateral}</div>}
                        {row.notes && <div className="text-gray-600 dark:text-gray-400">{row.notes}</div>}
                        {(linkedTasks[row.id]?.length > 0) && (
                          <div className="pt-1">
                            <div className="text-gray-400 text-xs mb-1">Linked tasks:</div>
                            {linkedTasks[row.id].map(t => (
                              <Link key={t.id} to={`/tasks/${t.id}`} className="block text-xs text-blue-600 hover:underline">
                                • {t.text} {t.status === 'done' ? '✓' : ''}
                              </Link>
                            ))}
                          </div>
                        )}
                        {editing === row.id ? (
                          <div className="space-y-2 pt-2">
                            <div className="grid grid-cols-2 gap-2">
                              <input value={editData.name ?? ''} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))}
                                placeholder="Name"
                                className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                              <input type="number" value={editData.amount ?? ''} onChange={e => setEditData(p => ({ ...p, amount: e.target.value === '' ? null : Number(e.target.value) }))}
                                placeholder={amountLabelFor(cat.key)}
                                className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                              <select value={editData.status ?? ''} onChange={e => setEditData(p => ({ ...p, status: e.target.value }))}
                                className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none capitalize">
                                <option value="">Status…</option>
                                {(cat.key === 'asset' ? DISPOSITIONS : statusOptionsFor(cat.key)).map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
                              </select>
                              {(cat.key === 'liability' || cat.key === 'obligation') && (
                                <input value={editData.lender ?? ''} onChange={e => setEditData(p => ({ ...p, lender: e.target.value }))}
                                  placeholder="Lender / payee"
                                  className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none" />
                              )}
                              <textarea value={editData.notes ?? ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))}
                                rows={3} placeholder="Notes…"
                                className="col-span-2 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none" />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-500">
                              <input type="checkbox" checked={!!editData.is_private} onChange={e => setEditData(p => ({ ...p, is_private: e.target.checked }))} />
                              Private — hide from heirs' transparency report
                            </label>
                            <div className="flex gap-2">
                              <button onClick={saveEdit} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs">Save</button>
                              <button onClick={() => setEditing(null)} className="px-3 py-1 text-gray-500 rounded-lg text-xs hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditing(row.id); setEditData({ name: row.name ?? '', amount: row.amount ?? null, lender: row.lender ?? '', status: row.status ?? '', notes: row.notes ?? '', is_private: !!row.is_private }) }}
                            className="text-xs text-blue-600 hover:underline pt-1"
                          >
                            Edit
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
