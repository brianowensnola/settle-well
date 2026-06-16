import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { ASSET_TYPE_LABELS, assetRequiredItems } from '../lib/assetTypes'

const fmt = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencySign: 'accounting', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const DISPO_BADGE = {
  undecided: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
  keep: 'bg-blue-100 text-blue-700', sell: 'bg-amber-100 text-amber-700',
  transfer: 'bg-blue-100 text-blue-700', gift: 'bg-purple-100 text-purple-700',
  sold: 'bg-green-100 text-green-700', distributed: 'bg-green-100 text-green-700',
}

export default function Assets() {
  const { currentEstate, role } = useEstate()
  const [assets, setAssets] = useState([])
  const [docAssetIds, setDocAssetIds] = useState(new Set()) // assets that have a supporting file
  const [typeFilter, setTypeFilter] = useState('all')
  const [dispoFilter, setDispoFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const { data } = await supabase.from('estate_financials').select('*')
      .or(`estate_id.eq.${currentEstate.id},shared_with.cs.{${currentEstate.id}}`)
      .eq('category', 'asset').order('name')
    setAssets(data ?? [])

    // Which assets have at least one supporting document with a file.
    const { data: docs } = await supabase.from('estate_documents')
      .select('asset_id').eq('estate_id', currentEstate.id).not('asset_id', 'is', null).not('file_path', 'is', null)
    setDocAssetIds(new Set((docs ?? []).map(d => d.asset_id)))

    setLoading(false)
  }

  function completeness(a) {
    const items = assetRequiredItems(a, docAssetIds.has(a.id))
    const done = items.filter(i => i.done).length
    return Math.round((done / items.length) * 100)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Asset management is available to the executor only.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading…</div>

  const q = search.trim().toLowerCase()
  const filtered = assets.filter(a =>
    (typeFilter === 'all' || (a.asset_type || 'other') === typeFilter) &&
    (dispoFilter === 'all' || (a.status || 'undecided') === dispoFilter) &&
    (!q || a.name.toLowerCase().includes(q))
  )
  const types = ['all', ...new Set(assets.map(a => a.asset_type || 'other'))]
  const dispositions = ['all', ...new Set(assets.map(a => a.status || 'undecided'))]
  const totalValue = filtered.filter(a => !['sold', 'distributed'].includes(a.status)).reduce((s, a) => s + (a.amount ?? 0), 0)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white">Assets</h1>
        <div className="flex items-center gap-4">
          <Link to="/inventory" className="text-sm text-blue-600 hover:underline">Inventory →</Link>
          <Link to="/finances" className="text-sm text-blue-600 hover:underline">+ Add in Finances</Link>
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {filtered.length} asset{filtered.length !== 1 ? 's' : ''} · est. value {fmt(totalValue)} (excludes sold/distributed)
      </p>

      <input
        placeholder="Search assets..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none mb-3"
      />
      <div className="flex flex-wrap gap-2 mb-2">
        {types.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${typeFilter === t ? 'bg-gray-900 dark:bg-gray-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
            {t === 'all' ? 'All types' : (ASSET_TYPE_LABELS[t] ?? t)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {dispositions.map(d => (
          <button key={d} onClick={() => setDispoFilter(d)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${dispoFilter === d ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
            {d === 'all' ? 'All dispositions' : d}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
        {filtered.length === 0 && <div className="p-6 text-sm text-gray-400">No assets match.</div>}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {filtered.map(a => (
            <Link key={a.id} to={`/assets/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-white">{a.name}</div>
                <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type ?? 'Other'}</span>
                  {a.beneficiary && <span>· → {a.beneficiary}</span>}
                  {a.shared_with?.length > 0 && <span className="text-blue-500">· ↔ joint</span>}
                </div>
              </div>
              {(() => {
                const pct = completeness(a)
                const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                return (
                  <span className="shrink-0 hidden sm:flex items-center gap-1.5 w-24" title={`${pct}% complete`}>
                    <span className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><span className={`block h-full ${color} rounded-full`} style={{ width: `${pct}%` }} /></span>
                    <span className="text-[11px] text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
                  </span>
                )
              })()}
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DISPO_BADGE[a.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>{a.status || 'undecided'}</span>
              <span className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300 w-20 text-right">{fmt(a.amount)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
