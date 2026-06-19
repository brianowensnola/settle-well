import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { SECTION_COLORS } from '../lib/constants'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'
import { placeTask } from '../lib/aiAdvisor'
import TaskRow from '../components/TaskRow'

const EXEC_CYCLE = ['pending', 'in_progress', 'waiting', 'done']
const STAFF_CYCLE = ['pending', 'in_progress', 'waiting', 'submitted'] // non-executors submit for approval

// Display helper: "Phase 3 — Government Notifications" → "Government Notifications" (stored label is unchanged)
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
  const [loading, setLoading] = useState(true)
  const noteRef = useRef(null)

  // Single "Add task" composer (with optional AI placement)
  const [composerOpen, setComposerOpen] = useState(false)
  const [cText, setCText] = useState('')
  const [cDetail, setCDetail] = useState('')
  const [cSectionId, setCSectionId] = useState('') // chosen phase (section id)
  const [cParentId, setCParentId] = useState('')   // chosen parent task ('' = top-level)
  const [cReason, setCReason] = useState('')        // AI explanation, if any
  const [placing, setPlacing] = useState(false)     // AI placement in progress
  const [savingTask, setSavingTask] = useState(false)
  const [cError, setCError] = useState('')

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

  function openComposer() {
    setCText(''); setCDetail(''); setCSectionId(''); setCParentId(''); setCReason(''); setCError('')
    setComposerOpen(true)
  }

  // Ask the AI where this task belongs, then pre-fill the phase + parent so the
  // user can confirm or change it. Nothing is saved here.
  async function placeWithAI() {
    if (!cText.trim()) { setCError('Type the task first.'); return }
    setPlacing(true); setCError('')
    try {
      const r = await placeTask(currentEstate.id, cText.trim(), cDetail.trim())
      const sec = sections.find(s => s.label === r.phase)
      if (sec) setCSectionId(sec.id)
      setCParentId(r.parent_task_id || '')
      setCReason(r.reason || '')
    } catch (e) { setCError(e.message || 'AI placement failed') }
    finally { setPlacing(false) }
  }

  async function createComposerTask() {
    if (!cText.trim()) { setCError('Type the task first.'); return }
    // A sub-task lives in its parent's phase; otherwise use the chosen phase.
    const parent = cParentId ? tasks.find(t => t.id === cParentId) : null
    const sectionId = parent ? parent.section_id : cSectionId
    if (!sectionId) { setCError('Choose a phase, or use Place with AI.'); return }
    setSavingTask(true); setCError('')
    const { data, error } = await supabase.from('estate_tasks').insert({
      estate_id: currentEstate.id,
      section_id: sectionId,
      parent_task_id: cParentId || null,
      text: cText.trim(),
      detail: cDetail.trim() || null,
      status: 'pending',
    }).select().single()
    setSavingTask(false)
    if (error) { setCError(error.message); return }
    if (data) setTasks(prev => [...prev, data])
    setComposerOpen(false)
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

  // Top-level tasks that a new task could be nested under (for the composer).
  const sectionOrder = Object.fromEntries(sections.map((s, i) => [s.id, i]))
  const parentOptions = tasks
    .filter(t => !t.parent_task_id && (canSeePrivate || !t.is_private))
    .sort((a, b) => (sectionOrder[a.section_id] ?? 99) - (sectionOrder[b.section_id] ?? 99) || a.text.localeCompare(b.text))

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

        {/* Single Add task */}
        <div className="mt-4">
          {!composerOpen ? (
            <button onClick={openComposer} className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800">+ Add task</button>
          ) : (
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900 space-y-3">
              <div className="text-sm font-semibold text-gray-800 dark:text-white">Add a task</div>
              <input
                autoFocus
                value={cText}
                onChange={e => setCText(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              <input
                value={cDetail}
                onChange={e => setCDetail(e.target.value)}
                placeholder="Optional detail / why it matters"
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              />

              <div className="flex items-center gap-2">
                <button onClick={placeWithAI} disabled={placing || !cText.trim()} className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-sm hover:bg-blue-100 disabled:opacity-50">
                  {placing ? 'Thinking…' : '🤖 Place with AI'}
                </button>
                <span className="text-xs text-gray-400">or choose where it goes below</span>
              </div>

              {cReason && (
                <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900 rounded-lg px-3 py-2">
                  🤖 {cReason} <span className="text-blue-400">— adjust below if it's not right.</span>
                </div>
              )}

              {/* Placement controls — pre-filled by AI, fully editable */}
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Make it a subtask of (optional)</span>
                  <select
                    value={cParentId}
                    onChange={e => setCParentId(e.target.value)}
                    className="mt-1 w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                  >
                    <option value="">— None (top-level task) —</option>
                    {parentOptions.map(t => (
                      <option key={t.id} value={t.id}>{sectionLabel(t.section_id)} — {t.text}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Phase</span>
                  {cParentId ? (
                    <div className="mt-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg">
                      {sectionLabel(tasks.find(t => t.id === cParentId)?.section_id)} <span className="text-gray-400">(follows the parent)</span>
                    </div>
                  ) : (
                    <select
                      value={cSectionId}
                      onChange={e => setCSectionId(e.target.value)}
                      className="mt-1 w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                    >
                      <option value="">— Choose a phase —</option>
                      {sections.map(s => (
                        <option key={s.id} value={s.id}>{phaseLabel(s.label)}</option>
                      ))}
                    </select>
                  )}
                </label>
              </div>

              {cError && <div className="text-xs text-red-600">{cError}</div>}

              <div className="flex gap-2">
                <button onClick={createComposerTask} disabled={savingTask || !cText.trim()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  {savingTask ? 'Adding…' : 'Create task'}
                </button>
                <button onClick={() => setComposerOpen(false)} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800">Cancel</button>
              </div>
            </div>
          )}
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
                      onCycleSubtask={cycleStatus}
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
                  {visible.length === 0 && (
                    <div className="px-4 py-3 text-xs text-gray-400">No tasks in this phase.</div>
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
                  onCycleSubtask={cycleStatus}
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
