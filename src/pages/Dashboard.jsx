import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { STATUS_STYLES, STATUS_LABELS } from '../lib/constants'

function daysSince(dod) {
  const diff = new Date() - new Date(dod)
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function fmt(n) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { currentEstate } = useEstate()
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState([])
  const [financials, setFinancials] = useState([])
  const [mailPending, setMailPending] = useState(0)
  const [aiPending, setAiPending] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    Promise.all([
      supabase.from('estate_tasks').select('*').eq('estate_id', currentEstate.id).is('parent_task_id', null),
      supabase.from('estate_task_logs').select('*, estate_tasks(text)').eq('estate_id', currentEstate.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('estate_financials').select('*').eq('estate_id', currentEstate.id),
      supabase.from('family_mail').select('id').eq('status', 'pending'),
      supabase.from('estate_ai_suggestions').select('id').eq('estate_id', currentEstate.id).eq('status', 'pending'),
    ]).then(([t, l, f, m, a]) => {
      setTasks(t.data ?? [])
      setLogs(l.data ?? [])
      setFinancials(f.data ?? [])
      setMailPending((m.data ?? []).length)
      setAiPending((a.data ?? []).length)
      setLoading(false)
    })
  }, [currentEstate])

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate found.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const pct = total ? Math.round((done / total) * 100) : 0
  const submittedCount = tasks.filter(t => t.status === 'submitted').length
  const needsReview = submittedCount + mailPending + aiPending

  const urgent = tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      const order = { in_progress: 0, waiting: 1, pending: 2 }
      return (order[a.status] ?? 9) - (order[b.status] ?? 9)
    })
    .slice(0, 5)

  const accounts = financials.filter(f => f.category === 'account')
  const obligations = financials.filter(f => f.category === 'obligation')
  const liabilities = financials.filter(f => f.category === 'liability')

  const totalBalance = accounts.reduce((s, a) => s + (a.amount ?? 0), 0)
  const monthlyBurn = obligations
    .filter(o => ['active', 'unknown'].includes(o.status))
    .reduce((s, o) => s + (o.amount_max ?? o.amount_min ?? 0), 0)
  const runway = monthlyBurn > 0 ? (totalBalance / monthlyBurn).toFixed(1) : '—'
  const totalLiabilities = liabilities.reduce((s, l) => s + (l.amount ?? 0), 0)

  const dod = currentEstate.deceased_dod
  const days = daysSince(dod)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">{currentEstate.deceased_name}</h1>
            <span className="text-xs sm:text-sm text-gray-400">Died {dod} · {days} days ago · {currentEstate.state_of_residence}</span>
          </div>
          <div className="text-xs sm:text-sm text-gray-500 mt-0.5">Executor: {currentEstate.administrator_name}</div>
        </div>
        <button
          onClick={() => navigate('/quick-estate', currentEstate.group_id ? { state: { groupId: currentEstate.group_id } } : { state: { newFamily: true } })}
          className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm hover:bg-gray-700 dark:hover:bg-gray-600 whitespace-nowrap"
        >
          {currentEstate.group_id ? '+ Add family member' : '+ Add estate'}
        </button>
      </div>

      {/* Needs review */}
      {needsReview > 0 && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 mb-4">
          <div className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1">🔔 {needsReview} item{needsReview === 1 ? '' : 's'} need your review</div>
          <div className="flex gap-4 text-sm">
            {submittedCount > 0 && <Link to="/tasks" className="text-purple-700 dark:text-purple-300 hover:underline">{submittedCount} task{submittedCount === 1 ? '' : 's'} awaiting approval →</Link>}
            {mailPending > 0 && <Link to="/mail" className="text-purple-700 dark:text-purple-300 hover:underline">{mailPending} mail item{mailPending === 1 ? '' : 's'} to review →</Link>}
            {aiPending > 0 && <Link to="/assistant" className="text-purple-700 dark:text-purple-300 hover:underline">{aiPending} AI suggestion{aiPending === 1 ? '' : 's'} to review →</Link>}
          </div>
        </div>
      )}

      {/* Progress */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Task Progress</span>
          <span className="text-sm text-gray-500">{done} / {total} complete</span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-gray-400 mt-1">{pct}%</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Priority */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Priority Items</h2>
          {urgent.length === 0 && <p className="text-sm text-gray-400">All caught up.</p>}
          <div className="space-y-2">
            {urgent.map(t => (
              <Link key={t.id} to={`/tasks/${t.id}`} className="flex items-start gap-2 group">
                <span className={`shrink-0 mt-0.5 text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[t.status]}`}>
                  {STATUS_LABELS[t.status]}
                </span>
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:text-white leading-snug">{t.text}</span>
              </Link>
            ))}
          </div>
          <Link to="/tasks" className="block mt-3 text-xs text-blue-600 hover:underline">View all tasks →</Link>
        </div>

        {/* Financial Snapshot */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Financial Snapshot</h2>
          <div className="space-y-2">
            <Row label="Account balance" value={fmt(totalBalance)} />
            <Row label="Monthly obligations" value={fmt(monthlyBurn)} />
            <Row label="Runway" value={runway !== '—' ? `${runway} months` : '—'} />
            <Row label="Known liabilities" value={totalLiabilities > 0 ? fmt(totalLiabilities) : '—'} />
          </div>
          <Link to="/finances" className="block mt-3 text-xs text-blue-600 hover:underline">View finances →</Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Activity</h2>
        {logs.length === 0 && <p className="text-sm text-gray-400">No activity yet.</p>}
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="flex gap-3 text-sm">
              <span className="shrink-0 text-xs text-gray-400 pt-0.5 w-24">{log.created_at?.slice(0, 10)}</span>
              <div>
                {log.estate_tasks && (
                  <span className="text-gray-400 text-xs mr-1">[{log.estate_tasks.text?.slice(0, 40)}]</span>
                )}
                <span className="text-gray-700 dark:text-gray-300">{log.note}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-800 dark:text-white">{value}</span>
    </div>
  )
}
