import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'
import TaskRow from '../components/TaskRow'

const EXEC_CYCLE = ['pending', 'in_progress', 'waiting', 'done']
const STAFF_CYCLE = ['pending', 'in_progress', 'waiting', 'submitted']
const statusOrder = { in_progress: 0, waiting: 1, pending: 2, submitted: 3, done: 4 }
const phaseLabel = l => (l || '').replace(/^Phase\s*\d+\s*[—–-]\s*/, '')

export default function AllTasks() {
  const { estates, currentEstate, role } = useEstate()
  const user = useUser()
  const isExec = isFullAccess(role)
  // Only the current family's estates — other families stay separate.
  const familyEstates = estates.filter(e =>
    currentEstate && (currentEstate.group_id ? e.group_id === currentEstate.group_id : e.id === currentEstate.id))

  const [tasks, setTasks] = useState([])      // all family tasks (incl. sub-tasks), tagged with estate
  const [logs, setLogs] = useState([])
  const [sectionMap, setSectionMap] = useState({}) // section_id -> { label, order }
  const [filter, setFilter] = useState('open')
  const [groupBy, setGroupBy] = useState('estate') // 'estate' | 'assignee' | 'phase'
  const [search, setSearch] = useState('')
  const [addingNote, setAddingNote] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [loading, setLoading] = useState(true)
  const noteRef = useRef(null)

  useEffect(() => {
    if (!estates.length) return
    loadAll()
  }, [estates, currentEstate?.id])

  async function loadAll() {
    const ids = familyEstates.map(e => e.id)
    const nameById = Object.fromEntries(familyEstates.map(e => [e.id, e.deceased_name]))
    if (ids.length === 0) { setTasks([]); setLogs([]); setLoading(false); return }
    const [tRes, lRes, sRes] = await Promise.all([
      supabase.from('estate_tasks').select('*').in('estate_id', ids).order('sort_order'),
      supabase.from('estate_task_logs').select('*').in('estate_id', ids).order('created_at'),
      supabase.from('estate_sections').select('id, label, sort_order').in('estate_id', ids),
    ])
    setTasks((tRes.data ?? []).map(t => ({ ...t, _estateName: nameById[t.estate_id] ?? '' })))
    setLogs(lRes.data ?? [])
    setSectionMap(Object.fromEntries((sRes.data ?? []).map(s => [s.id, { label: s.label, order: s.sort_order ?? 99 }])))
    setLoading(false)
  }

  async function setStatus(task, next) {
    await supabase.from('estate_tasks').update({ status: next, updated_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }
  function cycleStatus(task) {
    const cycle = isExec ? EXEC_CYCLE : STAFF_CYCLE
    const idx = cycle.indexOf(task.status)
    setStatus(task, cycle[(idx + 1) % cycle.length])
  }
  function approveTask(task) { setStatus(task, 'done') }
  function sendBackTask(task) { setStatus(task, 'in_progress') }

  // Note is saved against the TASK's own estate (cross-estate safe).
  async function saveNote(task) {
    if (!noteText.trim()) return
    const { data } = await supabase.from('estate_task_logs').insert({
      task_id: task.id,
      estate_id: task.estate_id,
      note: noteText.trim(),
      created_by: user?.email ?? 'Executor',
    }).select().single()
    if (data) setLogs(prev => [...prev, data])
    setNoteText('')
    setAddingNote(null)
  }

  if (!estates.length) return <div className="p-8 text-gray-400">No estates found.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const q = search.toLowerCase()
  const matchesStatus = t => {
    if (filter === 'all') return true
    if (filter === 'open') return t.status !== 'done'
    return t.status === filter
  }
  const matchesText = t => !q || t.text.toLowerCase().includes(q) || (t.tag ?? '').toLowerCase().includes(q)

  const topLevel = tasks.filter(t => !t.parent_task_id)
  const subtasksOf = id => tasks.filter(t => t.parent_task_id === id)
  // Search also looks inside sub-tasks: a parent passes if it matches the text,
  // or any of its sub-tasks do. When only a sub-task matches, show just those.
  const matchesFilters = t => matchesStatus(t) && (matchesText(t) || subtasksOf(t.id).some(matchesText))
  const visibleSubtasks = t => {
    const subs = subtasksOf(t.id)
    if (!q || matchesText(t)) return subs
    return subs.filter(matchesText)
  }
  const logsOf = id => logs.filter(l => l.task_id === id)
  const sortByStatus = arr => [...arr].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9))

  // Shared props for an interactive row.
  const rowProps = task => ({
    task,
    subtasks: visibleSubtasks(task),
    logs: logsOf(task.id),
    onCycle: () => cycleStatus(task),
    onCycleSubtask: cycleStatus,
    canApprove: isExec,
    onApprove: () => approveTask(task),
    onSendBack: () => sendBackTask(task),
    addingNote,
    noteText,
    onStartNote: () => { setAddingNote(task.id); setNoteText(''); setTimeout(() => noteRef.current?.focus(), 50) },
    onNoteChange: setNoteText,
    onSaveNote: () => saveNote(task),
    onCancelNote: () => setAddingNote(null),
    noteRef,
  })

  // Build the groups for the chosen mode.
  const filtered = topLevel.filter(matchesFilters)
  let groups = [] // [{ key, title, count, tasks, contextOf }]

  if (groupBy === 'estate') {
    for (const e of familyEstates) {
      const list = sortByStatus(filtered.filter(t => t.estate_id === e.id))
      if (list.length) groups.push({ key: e.id, title: e.deceased_name, tasks: list, contextOf: t => phaseLabel(sectionMap[t.section_id]?.label) })
    }
  } else if (groupBy === 'assignee') {
    const by = {}
    for (const t of filtered) (by[t.assigned_to || 'Unassigned'] ||= []).push(t)
    const names = Object.keys(by).sort((a, b) => a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b))
    groups = names.map(n => ({ key: n, title: n, tasks: sortByStatus(by[n]), contextOf: t => t._estateName }))
  } else { // phase
    const by = {}; const ord = {}
    for (const t of filtered) {
      const label = sectionMap[t.section_id]?.label || 'No phase'
      ord[label] = sectionMap[t.section_id]?.order ?? 99
      ;(by[label] ||= []).push(t)
    }
    groups = Object.keys(by).sort((a, b) => (ord[a] ?? 99) - (ord[b] ?? 99))
      .map(label => ({ key: label, title: phaseLabel(label), tasks: sortByStatus(by[label]), contextOf: t => t._estateName }))
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">All Tasks</h1>
        <p className="text-gray-600 dark:text-gray-400">Work tasks across the family's estates</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          placeholder="Search tasks..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
        />
        <div className="flex gap-2 flex-wrap">
          {['open', 'waiting', 'submitted', 'done', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium ${filter === f ? 'bg-gray-900 dark:bg-gray-700 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
            >
              {f === 'submitted' ? 'Needs approval' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Group by */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Group by:</span>
        {[['estate', 'Estate'], ['assignee', 'Assignee'], ['phase', 'Phase']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setGroupBy(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${groupBy === key ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {groups.length === 0 && <p className="text-sm text-gray-400">No tasks match the current filter.</p>}
        {groups.map(g => (
          <div key={g.key} className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800 dark:text-white">{g.title}</span>
              <span className="text-xs text-gray-500">{g.tasks.length} task{g.tasks.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="bg-white dark:bg-gray-900">
              {g.tasks.map(task => (
                <TaskRow key={task.id} {...rowProps(task)} contextLabel={g.contextOf(task)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
