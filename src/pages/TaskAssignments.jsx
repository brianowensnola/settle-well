import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function TaskAssignments() {
  const { currentEstate } = useEstate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedPerson, setExpandedPerson] = useState(null)

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

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  // Group tasks by assigned_to
  const grouped = {}
  tasks.forEach(task => {
    const assignee = task.assigned_to || 'Unassigned'
    if (!grouped[assignee]) grouped[assignee] = []
    grouped[assignee].push(task)
  })

  const assignees = Object.keys(grouped).sort()

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Task Assignments</h1>
        <p className="text-gray-600 dark:text-gray-400">Who has what and their status</p>
      </div>

      <div className="space-y-3">
        {assignees.map(assignee => {
          const personTasks = grouped[assignee]
          const pending = personTasks.filter(t => t.status === 'pending').length
          const inProgress = personTasks.filter(t => t.status === 'in_progress').length
          const done = personTasks.filter(t => t.status === 'done').length
          const isExpanded = expandedPerson === assignee

          return (
            <div key={assignee} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
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

              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {personTasks.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">No tasks assigned</div>
                  ) : (
                    personTasks.map(task => (
                      <div key={task.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{task.text}</p>
                            {task.tag && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
                                {task.tag}
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-medium">
                            {task.status === 'done' && <span className="text-green-600 dark:text-green-400">✓ Done</span>}
                            {task.status === 'in_progress' && <span className="text-blue-600 dark:text-blue-400">→ In Progress</span>}
                            {task.status === 'pending' && <span className="text-orange-600 dark:text-orange-400">○ Pending</span>}
                          </div>
                        </div>
                      </div>
                    ))
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
