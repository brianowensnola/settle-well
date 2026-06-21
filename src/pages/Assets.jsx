import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'
import { ASSET_TYPE_LABELS, assetRequiredItems } from '../lib/assetTypes'
import { familySiblings, setAssetSharedWith, moveAssetToEstate } from '../lib/assetActions'

const fmt = n => n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', currencySign: 'accounting', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const DISPO_BADGE = {
  undecided: 'bg-gray-100 dark:bg-gray-800 text-gray-500',
  keep: 'bg-blue-100 text-blue-700', sell: 'bg-amber-100 text-amber-700',
  transfer: 'bg-blue-100 text-blue-700', gift: 'bg-purple-100 text-purple-700',
  sold: 'bg-green-100 text-green-700', distributed: 'bg-green-100 text-green-700',
}

export default function Assets() {
  const { currentEstate, role, estates } = useEstate()
  const [assets, setAssets] = useState([])
  const [docAssetIds, setDocAssetIds] = useState(new Set()) // assets that have a supporting file
  const [typeFilter, setTypeFilter] = useState('all')
  const [dispoFilter, setDispoFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [manageId, setManageId] = useState(null) // asset row with the manage panel open
  const [busyId, setBusyId] = useState(null)

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

  const siblings = familySiblings(estates, currentEstate)
  const estName = eid => (estates ?? []).find(e => e.id === eid)?.deceased_name || 'other estate'

  // Toggle whether an asset is joint (shared) with a sibling estate.
  async function toggleJoint(a, sibId, on) {
    const next = on ? [...new Set([...(a.shared_with || []), sibId])] : (a.shared_with || []).filter(x => x !== sibId)
    setBusyId(a.id)
    try {
      await setAssetSharedWith(a.id, next)
      setAssets(prev => prev.map(x => x.id === a.id ? { ...x, shared_with: next } : x))
    } catch (e) { alert('Could not update sharing: ' + e.message) }
    finally { setBusyId(null) }
  }

  // Move an asset (and its docs/linked tasks) to another estate.
  async function doMove(a, targetId) {
    const target = siblings.find(s => s.id === targetId)
    if (!confirm(`Move "${a.name}" to the ${target?.deceased_name} estate? Its attached documents and linked tasks move with it.`)) return
    setBusyId(a.id)
    try {
      await moveAssetToEstate(a, targetId)
      setManageId(null)
      await load() // it leaves this estate's list unless still shared here
    } catch (e) { alert('Move failed: ' + e.message) }
    finally { setBusyId(null) }
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
          {filtered.map(a => {
            const owned = a.estate_id === currentEstate.id
            const pct = completeness(a)
            const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
            const open = manageId === a.id
            return (
              <div key={a.id}>
                <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <Link to={`/assets/${a.id}`} className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 dark:text-white">{a.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type ?? 'Other'}</span>
                      {a.beneficiary && <span>· → {a.beneficiary}</span>}
                      {a.shared_with?.length > 0 && <span className="text-blue-500">· ↔ joint</span>}
                      {!owned && <span>· shared from {estName(a.estate_id)}</span>}
                    </div>
                  </Link>
                  <span className="shrink-0 hidden sm:flex items-center gap-1.5 w-24" title={`${pct}% complete`}>
                    <span className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><span className={`block h-full ${color} rounded-full`} style={{ width: `${pct}%` }} /></span>
                    <span className="text-[11px] text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
                  </span>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium capitalize ${DISPO_BADGE[a.status] ?? 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>{a.status || 'undecided'}</span>
                  <span className="shrink-0 text-sm font-medium text-gray-700 dark:text-gray-300 w-20 text-right">{fmt(a.amount)}</span>
                  {siblings.length > 0 && owned && (
                    <button onClick={() => setManageId(open ? null : a.id)} title="Joint / move"
                      className={`shrink-0 px-1.5 leading-none text-lg rounded ${open ? 'text-gray-900 dark:text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>⋯</button>
                  )}
                </div>
                {open && owned && (
                  <div className="px-4 pb-3 bg-gray-50 dark:bg-gray-800/40 text-xs text-gray-600 dark:text-gray-300 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">Joint with:</span>
                      {siblings.map(s => (
                        <label key={s.id} className="inline-flex items-center gap-1">
                          <input type="checkbox" disabled={busyId === a.id} checked={(a.shared_with || []).includes(s.id)}
                            onChange={e => toggleJoint(a, s.id, e.target.checked)} />
                          {s.deceased_name}
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">Move to:</span>
                      {siblings.map(s => (
                        <button key={s.id} disabled={busyId === a.id} onClick={() => doMove(a, s.id)}
                          className="px-2 py-1 border border-gray-200 dark:border-gray-700 rounded hover:bg-white dark:hover:bg-gray-800 disabled:opacity-50">
                          {busyId === a.id ? 'Moving…' : `${s.deceased_name} →`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
