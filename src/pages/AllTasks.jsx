import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'
import { placeTask } from '../lib/aiAdvisor'
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
  const [sections, setSections] = useState([])     // full rows (id, label, estate_id, sort_order)
  const [filter, setFilter] = useState('open')
  const [groupBy, setGroupBy] = useState('estate') // 'estate' | 'assignee' | 'phase'
  const [search, setSearch] = useState('')
  const [addingNote, setAddingNote] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [loading, setLoading] = useState(true)
  const noteRef = useRef(null)

  // Single "Add task" composer (with optional AI placement). In the combined
  // list the executor first picks which estate the task belongs to.
  const [composerOpen, setComposerOpen] = useState(false)
  const [cEstateId, setCEstateId] = useState('')
  const [cText, setCText] = useState('')
  const [cDetail, setCDetail] = useState('')
  const [cSectionId, setCSectionId] = useState('')
  const [cParentId, setCParentId] = useState('')
  const [cReason, setCReason] = useState('')
  const [placing, setPlacing] = useState(false)
  const [savingTask, setSavingTask] = useState(false)
  const [cError, setCError] = useState('')

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
      supabase.from('estate_sections').select('id, label, sort_order, estate_id').in('estate_id', ids),
    ])
    setTasks((tRes.data ?? []).map(t => ({ ...t, _estateName: nameById[t.estate_id] ?? '' })))
    setLogs(lRes.data ?? [])
    setSections(sRes.data ?? [])
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

  function openComposer() {
    const def = familyEstates.find(e => e.id === currentEstate?.id)?.id || familyEstates[0]?.id || ''
    setCEstateId(def)
    setCText(''); setCDetail(''); setCSectionId(''); setCParentId(''); setCReason(''); setCError('')
    setComposerOpen(true)
  }
  // Changing the estate invalidates any phase/parent chosen for the previous one.
  function onComposerEstateChange(id) {
    setCEstateId(id); setCSectionId(''); setCParentId(''); setCReason('')
  }

  async function placeWithAI() {
    if (!cText.trim()) { setCError('Type the task first.'); return }
    if (!cEstateId) { setCError('Pick which estate it belongs to.'); return }
    setPlacing(true); setCError('')
    try {
      const r = await placeTask(cEstateId, cText.trim(), cDetail.trim())
      const sec = sections.find(s => s.estate_id === cEstateId && s.label === r.phase)
      if (sec) setCSectionId(sec.id)
      setCParentId(r.parent_task_id || '')
      setCReason(r.reason || '')
    } catch (e) { setCError(e.message || 'AI placement failed') }
    finally { setPlacing(false) }
  }

  async function createComposerTask() {
    if (!cText.trim()) { setCError('Type the task first.'); return }
    if (!cEstateId) { setCError('Pick which estate it belongs to.'); return }
    const parent = cParentId ? tasks.find(t => t.id === cParentId) : null
    const sectionId = parent ? parent.section_id : cSectionId
    if (!sectionId) { setCError('Choose a phase, or use Place with AI.'); return }
    setSavingTask(true); setCError('')
    const { data, error } = await supabase.from('estate_tasks').insert({
      estate_id: cEstateId,
      section_id: sectionId,
      parent_task_id: cParentId || null,
      text: cText.trim(),
      detail: cDetail.trim() || null,
      status: 'pending',
    }).select().single()
    setSavingTask(false)
    if (error) { setCError(error.message); return }
    if (data) {
      const nameById = Object.fromEntries(familyEstates.map(e => [e.id, e.deceased_name]))
      setTasks(prev => [...prev, { ...data, _estateName: nameById[data.estate_id] ?? '' }])
    }
    setComposerOpen(false)
  }

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

  // Composer option lists, scoped to the estate the executor picked.
  const composerSections = sections.filter(s => s.estate_id === cEstateId)
    .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99))
  const composerParents = tasks.filter(t => t.estate_id === cEstateId && !t.parent_task_id)
    .sort((a, b) => (sectionMap[a.section_id]?.order ?? 99) - (sectionMap[b.section_id]?.order ?? 99) || a.text.localeCompare(b.text))
  const cParentPhase = cParentId ? sectionMap[tasks.find(t => t.id === cParentId)?.section_id]?.label : null

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Combined Task List</h1>
          <p className="text-gray-600 dark:text-gray-400">Every task across the family's estates, in one place</p>
        </div>
        {isExec && !composerOpen && (
          <button onClick={openComposer} className="shrink-0 px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800">+ Add task</button>
        )}
      </div>

      {/* Add task composer */}
      {isExec && composerOpen && (
        <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 bg-white dark:bg-gray-900 space-y-3 mb-6">
          <div className="text-sm font-semibold text-gray-800 dark:text-white">Add a task</div>
          <label className="block">
            <span className="text-xs text-gray-500 dark:text-gray-400">Estate</span>
            <select
              value={cEstateId}
              onChange={e => onComposerEstateChange(e.target.value)}
              className="mt-1 w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            >
              {familyEstates.map(e => (
                <option key={e.id} value={e.id}>{e.deceased_name}</option>
              ))}
            </select>
          </label>
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

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">Make it a subtask of (optional)</span>
              <select
                value={cParentId}
                onChange={e => setCParentId(e.target.value)}
                className="mt-1 w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                <option value="">— None (top-level task) —</option>
                {composerParents.map(t => (
                  <option key={t.id} value={t.id}>{phaseLabel(sectionMap[t.section_id]?.label)} — {t.text}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">Phase</span>
              {cParentId ? (
                <div className="mt-1 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-800 rounded-lg">
                  {phaseLabel(cParentPhase)} <span className="text-gray-400">(follows the parent)</span>
                </div>
              ) : (
                <select
                  value={cSectionId}
                  onChange={e => setCSectionId(e.target.value)}
                  className="mt-1 w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                >
                  <option value="">— Choose a phase —</option>
                  {composerSections.map(s => (
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
