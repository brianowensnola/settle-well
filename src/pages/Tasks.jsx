import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { SECTION_COLORS, STATUS_STYLES, STATUS_LABELS } from '../lib/constants'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'

const EXEC_CYCLE = ['pending', 'in_progress', 'waiting', 'done']
const STAFF_CYCLE = ['pending', 'in_progress', 'waiting', 'submitted'] // non-executors submit for approval

// Display helper: "Phase 2 — First Week" → "First Week" (stored label is unchanged)
const phaseLabel = l => (l || '').replace(/^Phase\s*\d+\s*[—–-]\s*/, '')

export default function Tasks() {
  const { currentEstate, role } = useEstate()
  const user = useUser()
  const canSeePrivate = isFullAccess(role)
  const isExec = isFullAccess(role)
  const [sections, setSections] = useState([])
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [filter, setFilter] = useState('open')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [groupBy, setGroupBy] = useState('phase') // 'phase' | 'assignee'
  const [search, setSearch] = useState('')
  const [addingNote, setAddingNote] = useState(null) // task id
  const [noteText, setNoteText] = useState('')
  const [addingTask, setAddingTask] = useState(null) // section id
  const [newTaskText, setNewTaskText] = useState('')
  const [loading, setLoading] = useState(true)
  const noteRef = useRef(null)

  useEffect(() => {
    if (!currentEstate) return
    load()
  }, [currentEstate])

  async function load() {
    const [s, t, l] = await Promise.all([
      supabase.from('estate_sections').select('*').eq('estate_id', currentEstate.id).order('sort_order'),
      supabase.from('estate_tasks').select('*').eq('estate_id', currentEstate.id).order('sort_order'),
      supabase.from('estate_task_logs').select('*').eq('estate_id', currentEstate.id).order('created_at'),
    ])
    setSections(s.data ?? [])
    setTasks(t.data ?? [])
    setLogs(l.data ?? [])
    setLoading(false)
  }

  async function setStatus(task, next) {
    await supabase.from('estate_tasks').update({ status: next, updated_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }
  async function cycleStatus(task) {
    const cycle = isExec ? EXEC_CYCLE : STAFF_CYCLE
    const idx = cycle.indexOf(task.status)
    setStatus(task, cycle[(idx + 1) % cycle.length])
  }
  // Executor approval of a submitted (non-executor-completed) task
  function approveTask(task) { setStatus(task, 'done') }
  function sendBackTask(task) { setStatus(task, 'in_progress') }

  async function saveNote(taskId) {
    if (!noteText.trim()) return
    const { data } = await supabase.from('estate_task_logs').insert({
      task_id: taskId,
      estate_id: currentEstate.id,
      note: noteText.trim(),
      created_by: user?.email ?? 'Brian',
    }).select().single()
    if (data) setLogs(prev => [...prev, data])
    setNoteText('')
    setAddingNote(null)
  }

  async function saveTask(sectionId) {
    if (!newTaskText.trim()) return
    const { data } = await supabase.from('estate_tasks').insert({
      estate_id: currentEstate.id,
      section_id: sectionId,
      text: newTaskText.trim(),
      status: 'pending',
    }).select().single()
    if (data) setTasks(prev => [...prev, data])
    setNewTaskText('')
    setAddingTask(null)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const q = search.toLowerCase()

  function matches(t) {
    if (t.parent_task_id) return false
    if (t.is_private && !canSeePrivate) return false
    if (filter === 'open' && t.status === 'done') return false
    if (filter === 'done' && t.status !== 'done') return false
    if (filter === 'waiting' && t.status !== 'waiting') return false
    if (filter === 'submitted' && t.status !== 'submitted') return false
    if (assigneeFilter !== 'all' && (t.assigned_to || 'Unassigned') !== assigneeFilter) return false
    if (q && !t.text.toLowerCase().includes(q) && !(t.tag ?? '').toLowerCase().includes(q)) return false
    return true
  }

  function visibleTasks(sectionId) {
    return tasks.filter(t => t.section_id === sectionId && matches(t))
  }

  const assignees = ['all', ...new Set(tasks.map(t => t.assigned_to || 'Unassigned'))]
  const sectionLabel = id => phaseLabel(sections.find(s => s.id === id)?.label ?? '')
  const submittedCount = tasks.filter(t => t.status === 'submitted' && (canSeePrivate || !t.is_private)).length

  // Group filtered top-level tasks by assignee (for the by-person view)
  const byAssignee = {}
  for (const t of tasks.filter(matches)) {
    const a = t.assigned_to || 'Unassigned'
    ;(byAssignee[a] ||= []).push(t)
  }
  const assigneeGroups = Object.keys(byAssignee).sort((a, b) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)
  )

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3 flex-wrap gap-3">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Tasks</h1>
          <input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 sm:w-44"
          />
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 flex-wrap mb-3">
          {[
            { key: 'open', label: 'Open' },
            { key: 'waiting', label: 'Waiting' },
            { key: 'done', label: 'Done' },
            { key: 'all', label: 'All' },
            ...(isExec ? [{ key: 'submitted', label: `Needs approval${submittedCount ? ` (${submittedCount})` : ''}`, highlight: submittedCount > 0 }] : []),
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f.key ? 'bg-gray-900 dark:bg-gray-700 text-white' : f.highlight ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Assignee Filters */}
        <div className="flex gap-2 flex-wrap">
          {assignees.map(a => (
            <button
              key={a}
              onClick={() => setAssigneeFilter(a)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${assigneeFilter === a ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
            >
              {a === 'all' ? 'All People' : a}
            </button>
          ))}
        </div>

        {/* Group by */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">Group by:</span>
          {['phase', 'assignee'].map(g => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${groupBy === g ? 'bg-gray-900 dark:bg-gray-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
            >
              {g === 'phase' ? 'Phase' : 'Person'}
            </button>
          ))}
        </div>
      </div>

      {groupBy === 'phase' && (
      <div className="space-y-4">
        {sections.map(sec => {
          const c = SECTION_COLORS[sec.color] ?? SECTION_COLORS.gray
          const visible = visibleTasks(sec.id)
          const isCollapsed = collapsed[sec.id]

          return (
            <div key={sec.id} className="rounded-xl border overflow-hidden" style={{ borderColor: c.border }}>
              {/* Section header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                style={{ background: c.bg }}
                onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !p[sec.id] }))}
              >
                <span className="text-sm font-semibold" style={{ color: c.text }}>{phaseLabel(sec.label)}</span>
                <span className="text-xs" style={{ color: c.text }}>{isCollapsed ? '▶' : '▼'}</span>
              </button>

              {!isCollapsed && (
                <div className="bg-white dark:bg-gray-900">
                  {visible.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      subtasks={tasks.filter(t => t.parent_task_id === task.id)}
                      logs={logs.filter(l => l.task_id === task.id)}
                      onCycle={() => cycleStatus(task)}
                      canApprove={isExec}
                      onApprove={() => approveTask(task)}
                      onSendBack={() => sendBackTask(task)}
                      addingNote={addingNote}
                      noteText={noteText}
                      onStartNote={() => { setAddingNote(task.id); setNoteText(''); setTimeout(() => noteRef.current?.focus(), 50) }}
                      onNoteChange={setNoteText}
                      onSaveNote={() => saveNote(task.id)}
                      onCancelNote={() => setAddingNote(null)}
                      noteRef={noteRef}
                    />
                  ))}

                  {/* Add task inline */}
                  {addingTask === sec.id ? (
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                      <input
                        autoFocus
                        value={newTaskText}
                        onChange={e => setNewTaskText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveTask(sec.id); if (e.key === 'Escape') setAddingTask(null) }}
                        placeholder="Task description..."
                        className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                      <button onClick={() => saveTask(sec.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Add</button>
                      <button onClick={() => setAddingTask(null)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTask(sec.id)}
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:bg-gray-800 border-t border-gray-100"
                    >
                      + Add task
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}

      {groupBy === 'assignee' && (
      <div className="space-y-4">
        {assigneeGroups.map(person => (
          <div key={person} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800 dark:text-white">
                {person === 'Unassigned' ? '👤 Unassigned' : `👤 ${person}`}
              </span>
              <span className="text-xs text-gray-500">{byAssignee[person].length}</span>
            </div>
            <div className="bg-white dark:bg-gray-900">
              {byAssignee[person].map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  contextLabel={sectionLabel(task.section_id)}
                  subtasks={tasks.filter(t => t.parent_task_id === task.id)}
                  logs={logs.filter(l => l.task_id === task.id)}
                  onCycle={() => cycleStatus(task)}
                  addingNote={addingNote}
                  noteText={noteText}
                  onStartNote={() => { setAddingNote(task.id); setNoteText(''); setTimeout(() => noteRef.current?.focus(), 50) }}
                  onNoteChange={setNoteText}
                  onSaveNote={() => saveNote(task.id)}
                  onCancelNote={() => setAddingNote(null)}
                  noteRef={noteRef}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  )
}

function TaskRow({ task, subtasks, logs, onCycle, canApprove, onApprove, onSendBack, addingNote, noteText, onStartNote, onNoteChange, onSaveNote, onCancelNote, noteRef, contextLabel }) {
  const isDone = task.status === 'done'
  const isSubmitted = task.status === 'submitted'

  return (
    <div className={`border-t border-gray-100 ${isDone ? 'bg-green-50' : isSubmitted ? 'bg-purple-50 dark:bg-purple-900/10' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {isSubmitted ? (
          <span className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES.submitted}`} title="Awaiting executor approval">Submitted</span>
        ) : (
          <button
            onClick={onCycle}
            className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${STATUS_STYLES[task.status]}`}
            title="Click to cycle status"
          >
            {isDone ? '✓ Done' : STATUS_LABELS[task.status]}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <Link
              to={`/tasks/${task.id}`}
              className={`text-sm leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white hover:text-gray-900 dark:text-white'}`}
            >
              {task.text}
            </Link>
            {task.tag && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">{task.tag}</span>
            )}
            {task.assigned_to && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">👤 {task.assigned_to}</span>
            )}
            {contextLabel && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-50 dark:bg-gray-800 text-gray-400 rounded">{contextLabel}</span>
            )}
          </div>

          {/* Submitted for executor approval */}
          {isSubmitted && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-purple-700 dark:text-purple-300">Marked complete by {task.submitted_by_name || 'a collaborator'} — needs your approval.</span>
              {canApprove && (
                <>
                  <button onClick={onApprove} className="text-xs px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">Approve</button>
                  <button onClick={onSendBack} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200">Send back</button>
                </>
              )}
            </div>
          )}

          {/* Guidance — why this matters / what to check */}
          {task.detail && !isDone && !isSubmitted && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">{task.detail}</p>
          )}

          {/* Sub-tasks */}
          {subtasks.length > 0 && (
            <div className="mt-1.5 pl-3 border-l-2 border-gray-100 space-y-1">
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_STYLES[st.status]}`}>{STATUS_LABELS[st.status]}</span>
                  <Link to={`/tasks/${st.id}`} className={`hover:text-gray-800 dark:hover:text-gray-200 hover:underline ${st.status === 'done' ? 'line-through' : ''}`}>{st.text}</Link>
                </div>
              ))}
            </div>
          )}

          {/* Log entries */}
          {logs.length > 0 && (
            <div className="mt-2 space-y-1">
              {logs.map(log => (
                <div key={log.id} className="text-xs text-gray-500 leading-relaxed">
                  <span className="text-gray-400 mr-1.5">{log.created_at?.slice(0, 10)}</span>
                  {log.note}
                </div>
              ))}
            </div>
          )}

          {/* Add note */}
          {addingNote === task.id ? (
            <div className="mt-2 space-y-1.5">
              <textarea
                ref={noteRef}
                value={noteText}
                onChange={e => onNoteChange(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={onSaveNote} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs">Save note</button>
                <button onClick={onCancelNote} className="px-3 py-1 text-gray-500 rounded-lg text-xs hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={onStartNote} className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-400">+ Add note</button>
          )}
        </div>
      </div>
    </div>
  )
}
