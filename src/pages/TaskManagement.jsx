import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function TaskManagement() {
  const { currentEstate } = useEstate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedPerson, setExpandedPerson] = useState(null)
  const [expandedTask, setExpandedTask] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [editingTask, setEditingTask] = useState(null)
  const [editStatus, setEditStatus] = useState('')

  useEffect(() => {
    if (!currentEstate) return
    loadTasks()
  }, [currentEstate])

  async function loadTasks() {
    const { data } = await supabase
      .from('estate_tasks')
      .select('*')
      .eq('estate_id', currentEstate.id)
      .order('assigned_to', { ascending: true })
      .order('status', { ascending: false })

    setTasks(data ?? [])
    setLoading(false)
  }

  async function updateTaskStatus(taskId, newStatus) {
    await supabase
      .from('estate_tasks')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    setEditingTask(null)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  // Group tasks by assignee
  const grouped = {}
  tasks.forEach(task => {
    const assignee = task.assigned_to || 'Unassigned'
    if (!grouped[assignee]) grouped[assignee] = []
    grouped[assignee].push(task)
  })

  const assignees = Object.keys(grouped).sort()

  // Apply status filter
  const filterTasks = (personTasks) => {
    if (statusFilter === 'all') return personTasks
    return personTasks.filter(t => t.status === statusFilter)
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Task Management</h1>
        <p className="text-gray-600 dark:text-gray-400">All tasks by assignee with status tracking</p>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {['all', 'pending', 'in_progress', 'done'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === status
                ? 'bg-gray-900 dark:bg-gray-700 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {status === 'all' ? 'All Tasks' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Assignees */}
      <div className="space-y-3">
        {assignees.map(assignee => {
          const personTasks = grouped[assignee]
          const filteredTasks = filterTasks(personTasks)
          const isExpanded = expandedPerson === assignee

          const pending = personTasks.filter(t => t.status === 'pending').length
          const inProgress = personTasks.filter(t => t.status === 'in_progress').length
          const done = personTasks.filter(t => t.status === 'done').length

          return (
            <div key={assignee} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpandedPerson(isExpanded ? null : assignee)}
                className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{assignee}</h2>
                  <div className="flex gap-4 mt-1 text-sm">
                    {pending > 0 && <span className="text-orange-600 dark:text-orange-400">⏳ {pending} pending</span>}
                    {inProgress > 0 && <span className="text-blue-600 dark:text-blue-400">🔄 {inProgress} in progress</span>}
                    {done > 0 && <span className="text-green-600 dark:text-green-400">✓ {done} done</span>}
                    {personTasks.length === 0 && <span className="text-gray-400">No tasks</span>}
                  </div>
                </div>
                <div className="text-2xl text-gray-400">{isExpanded ? '▼' : '▶'}</div>
              </button>

              {/* Tasks */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredTasks.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">No tasks with this status</div>
                  ) : (
                    filteredTasks.map(task => {
                      const isTaskExpanded = expandedTask === task.id

                      return (
                        <div key={task.id} className="px-4 py-3">
                          {/* Task Header */}
                          <button
                            onClick={() => setExpandedTask(isTaskExpanded ? null : task.id)}
                            className="w-full text-left flex items-start justify-between gap-3 hover:opacity-80"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{task.text}</p>
                              {task.tag && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
                                  {task.tag}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs font-medium">
                                {task.status === 'done' && <span className="text-green-600 dark:text-green-400">✓ Done</span>}
                                {task.status === 'in_progress' && <span className="text-blue-600 dark:text-blue-400">→ In Progress</span>}
                                {task.status === 'pending' && <span className="text-orange-600 dark:text-orange-400">○ Pending</span>}
                              </span>
                              <span className="text-lg text-gray-400">{isTaskExpanded ? '▼' : '▶'}</span>
                            </div>
                          </button>

                          {/* Task Details */}
                          {isTaskExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-3">
                              {/* Status Change */}
                              <div>
                                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">Update Status</label>
                                {editingTask === task.id ? (
                                  <div className="flex gap-2">
                                    <select
                                      value={editStatus}
                                      onChange={e => setEditStatus(e.target.value)}
                                      className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-2 py-1 text-sm"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="in_progress">In Progress</option>
                                      <option value="done">Done</option>
                                    </select>
                                    <button
                                      onClick={() => updateTaskStatus(task.id, editStatus)}
                                      className="px-3 py-1 bg-gray-900 dark:bg-gray-700 text-white rounded text-xs font-medium"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingTask(null)}
                                      className="px-3 py-1 bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditingTask(task.id); setEditStatus(task.status) }}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    Change status
                                  </button>
                                )}
                              </div>
                              {task.date_added && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Added: {new Date(task.date_added).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
