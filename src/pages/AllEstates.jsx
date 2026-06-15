import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { STATUS_STYLES, STATUS_LABELS, ACTIVE_OBLIGATION_STATUSES } from '../lib/constants'

function daysSince(dod) {
  const diff = new Date() - new Date(dod)
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function AllEstates() {
  const navigate = useNavigate()
  const { estates, currentEstate, switchEstate } = useEstate()
  const [estateStats, setEstateStats] = useState({})
  const [familyName, setFamilyName] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!estates.length) return
    loadAllStats()
  }, [estates])

  useEffect(() => {
    let off = false
    ;(async () => {
      if (!currentEstate?.group_id) { setFamilyName(''); return }
      const { data } = await supabase.from('estate_groups').select('name').eq('id', currentEstate.group_id).maybeSingle()
      if (!off) setFamilyName(data?.name ?? '')
    })()
    return () => { off = true }
  }, [currentEstate?.group_id])

  async function loadAllStats() {
    const stats = {}

    for (const estate of estates) {
      const [tasksRes, financialsRes] = await Promise.all([
        supabase.from('estate_tasks').select('id, status').eq('estate_id', estate.id).is('parent_task_id', null),
        supabase.from('estate_financials').select('amount, category, status').eq('estate_id', estate.id),
      ])

      const tasks = tasksRes.data ?? []
      const financials = financialsRes.data ?? []

      const total = tasks.length
      const done = tasks.filter(t => t.status === 'done').length
      const inProgress = tasks.filter(t => t.status === 'in_progress').length

      const accounts = financials.filter(f => f.category === 'account')
      const obligations = financials.filter(f => f.category === 'obligation' && ACTIVE_OBLIGATION_STATUSES.includes(f.status))
      const totalBalance = accounts.reduce((s, a) => s + (a.amount ?? 0), 0)
      const monthlyBurn = obligations.reduce((s, o) => s + (o.amount ?? 0), 0)

      stats[estate.id] = {
        total,
        done,
        inProgress,
        pct: total ? Math.round((done / total) * 100) : 0,
        totalBalance,
        monthlyBurn,
      }
    }

    setEstateStats(stats)
    setLoading(false)
  }

  if (!estates.length) return <div className="p-8 text-gray-400">No estates found.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  // Only the current family's estates — other families never show here.
  const familyEstates = estates.filter(e =>
    currentEstate && (currentEstate.group_id ? e.group_id === currentEstate.group_id : e.id === currentEstate.id))

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto w-full">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
            {familyName || 'All Estates Overview'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Managing {familyEstates.length} estate{familyEstates.length !== 1 ? 's' : ''}{familyName ? ' in this family' : ''}</p>
        </div>
        {currentEstate?.group_id && (
          <button
            onClick={() => navigate('/quick-estate', { state: { groupId: currentEstate.group_id, familyName } })}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-700 whitespace-nowrap shrink-0"
          >
            + Add family member
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {familyEstates.map(estate => {
          const stats = estateStats[estate.id] || {}
          const dod = estate.deceased_dod
          const days = daysSince(dod)

          return (
            <div key={estate.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => switchEstate(estate)}>
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{estate.deceased_name}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Died {dod} · {days} days ago</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{estate.state_of_residence}</p>
              </div>

              {/* Task Progress */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Task Progress</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{stats.done ?? 0} / {stats.total ?? 0}</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${stats.pct ?? 0}%` }} />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.pct ?? 0}% complete</div>
              </div>

              {/* In Progress */}
              {stats.inProgress > 0 && (
                <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                  <span className="text-blue-700 dark:text-blue-400">{stats.inProgress} task{stats.inProgress !== 1 ? 's' : ''} in progress</span>
                </div>
              )}

              {/* Financials Summary */}
              <div className="space-y-1 text-xs mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Account balance:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{fmt(stats.totalBalance)}</span>
                </div>
                {stats.monthlyBurn > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Monthly burn:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{fmt(stats.monthlyBurn)}</span>
                  </div>
                )}
              </div>

              {/* Click to manage */}
              <button className="w-full px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors">
                Manage This Estate →
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
