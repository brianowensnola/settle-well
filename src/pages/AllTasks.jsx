import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { STATUS_STYLES, STATUS_LABELS } from '../lib/constants'

export default function AllTasks() {
  const { estates } = useEstate()
  const [allTasks, setAllTasks] = useState({})
  const [filter, setFilter] = useState('open')
  const [groupBy, setGroupBy] = useState('estate') // 'estate' | 'assignee'
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!estates.length) return
    loadAllTasks()
  }, [estates])

  async function loadAllTasks() {
    const tasksByEstate = {}

    for (const estate of estates) {
      const { data } = await supabase
        .from('estate_tasks')
        .select('*')
        .eq('estate_id', estate.id)
        .is('parent_task_id', null)
        .order('sort_order')

      tasksByEstate[estate.id] = {
        name: estate.deceased_name,
        tasks: data ?? [],
      }
    }

    setAllTasks(tasksByEstate)
    setLoading(false)
  }

  if (!estates.length) return <div className="p-8 text-gray-400">No estates found.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const statusOrder = { in_progress: 0, waiting: 1, pending: 2, done: 3 }

  // Shared status + search filter used by both grouping modes.
  const matchesFilters = t => {
    if (filter !== 'all') {
      if (filter === 'open') { if (t.status === 'done') return false }
      else if (t.status !== filter) return false
    }
    if (search && !t.text.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }

  // Flatten every estate's tasks, tagging each with its estate, for the
  // by-assignee view (which crosses estate boundaries).
  const flatTasks = Object.entries(allTasks).flatMap(([estateId, { name, tasks }]) =>
    tasks.map(t => ({ ...t, _estateId: estateId, _estateName: name }))
  )
  const byAssignee = {}
  for (const t of flatTasks.filter(matchesFilters)) {
    const who = t.assigned_to || 'Unassigned'
    if (!byAssignee[who]) byAssignee[who] = []
    byAssignee[who].push(t)
  }
  // Real people first (alphabetical), "Unassigned" always last.
  const assigneeNames = Object.keys(byAssignee).sort((a, b) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)
  )

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">All Tasks</h1>
        <p className="text-gray-600 dark:text-gray-400">View and manage tasks across all estates</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          placeholder="Search tasks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
        />
        <div className="flex gap-2 flex-wrap">
          {['open', 'waiting', 'done', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${
                filter === f
                  ? 'bg-gray-900 dark:bg-gray-700 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Group by */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Group by:</span>
        {[['estate', 'Estate'], ['assignee', 'Assignee']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setGroupBy(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              groupBy === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tasks grouped by estate */}
      {groupBy === 'estate' && (
      <div className="space-y-8">
        {Object.entries(allTasks).map(([estateId, { name, tasks }]) => {
          let filtered = tasks
          if (filter !== 'all') {
            if (filter === 'open') {
              filtered = tasks.filter(t => t.status !== 'done')
            } else {
              filtered = tasks.filter(t => t.status === filter)
            }
          }
          if (search) {
            filtered = filtered.filter(t => t.text.toLowerCase().includes(search.toLowerCase()))
          }

          if (!filtered.length) return null

          const grouped = {}
          for (const task of filtered) {
            const status = task.status || 'pending'
            if (!grouped[status]) grouped[status] = []
            grouped[status].push(task)
          }

          // Sort by status
          const sorted = Object.entries(grouped).sort(
            (a, b) => (statusOrder[a[0]] ?? 99) - (statusOrder[b[0]] ?? 99)
          )

          return (
            <div key={estateId}>
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{name}</h2>
                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                  {filtered.length} task{filtered.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-3">
                {sorted.map(([status, statusTasks]) => (
                  <div key={status}>
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {STATUS_LABELS[status]}
                    </div>
                    <div className="space-y-2">
                      {statusTasks.map(task => (
                        <Link
                          key={task.id}
                          to={`/tasks/${task.id}`}
                          state={{ estateId }}
                          className="flex items-start gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:shadow-md transition-shadow group"
                        >
                          <span className={`shrink-0 mt-0.5 text-xs px-2 py-1 rounded font-medium ${STATUS_STYLES[status]}`}>
                            {STATUS_LABELS[status]}
                          </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-snug flex-1">
                            {task.text}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* Tasks grouped by assignee (across all estates) */}
      {groupBy === 'assignee' && (
      <div className="space-y-8">
        {assigneeNames.length === 0 && (
          <p className="text-sm text-gray-400">No tasks match the current filter.</p>
        )}
        {assigneeNames.map(who => {
          const personTasks = byAssignee[who]
          const sorted = [...personTasks].sort(
            (a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
          )
          return (
            <div key={who}>
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{who}</h2>
                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                  {personTasks.length} task{personTasks.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {sorted.map(task => {
                  const status = task.status || 'pending'
                  return (
                    <Link
                      key={task.id}
                      to={`/tasks/${task.id}`}
                      state={{ estateId: task._estateId }}
                      className="flex items-start gap-3 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:shadow-md transition-shadow group"
                    >
                      <span className={`shrink-0 mt-0.5 text-xs px-2 py-1 rounded font-medium ${STATUS_STYLES[status]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white leading-snug flex-1">
                        {task.text}
                      </span>
                      <span className="shrink-0 mt-0.5 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded">
                        {task._estateName}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}
