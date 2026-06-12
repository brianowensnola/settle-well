import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { SECTION_COLORS, STATUS_STYLES, STATUS_LABELS } from '../lib/constants'
import { useUser } from '../lib/AuthContext'

const STATUS_CYCLE = ['pending', 'in_progress', 'waiting', 'done']

export default function Tasks() {
  const { currentEstate } = useEstate()
  const user = useUser()
  const [sections, setSections] = useState([])
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState([])
  const [collapsed, setCollapsed] = useState({})
  const [filter, setFilter] = useState('open')
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

  async function cycleStatus(task) {
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    await supabase.from('estate_tasks').update({ status: next, updated_at: new Date().toISOString() }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
  }

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

  function visibleTasks(sectionId) {
    return tasks.filter(t => {
      if (t.section_id !== sectionId) return false
      if (t.parent_task_id) return false
      if (filter === 'open' && t.status === 'done') return false
      if (filter === 'done' && t.status !== 'done') return false
      if (filter === 'waiting' && t.status !== 'waiting') return false
      if (q && !t.text.toLowerCase().includes(q) && !(t.tag ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Tasks</h1>
        <div className="flex gap-2 flex-wrap">
          <input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 w-44"
          />
          {['open', 'waiting', 'done', 'all'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

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
                <span className="text-sm font-semibold" style={{ color: c.text }}>{sec.label}</span>
                <span className="text-xs" style={{ color: c.text }}>{isCollapsed ? '▶' : '▼'}</span>
              </button>

              {!isCollapsed && (
                <div className="bg-white">
                  {visible.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
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

                  {/* Add task inline */}
                  {addingTask === sec.id ? (
                    <div className="flex gap-2 px-4 py-3 border-t border-gray-100">
                      <input
                        autoFocus
                        value={newTaskText}
                        onChange={e => setNewTaskText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveTask(sec.id); if (e.key === 'Escape') setAddingTask(null) }}
                        placeholder="Task description..."
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
                      />
                      <button onClick={() => saveTask(sec.id)} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Add</button>
                      <button onClick={() => setAddingTask(null)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTask(sec.id)}
                      className="w-full text-left px-4 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-100"
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
    </div>
  )
}

function TaskRow({ task, subtasks, logs, onCycle, addingNote, noteText, onStartNote, onNoteChange, onSaveNote, onCancelNote, noteRef }) {
  const isDone = task.status === 'done'

  return (
    <div className={`border-t border-gray-100 ${isDone ? 'bg-green-50' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          onClick={onCycle}
          className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${STATUS_STYLES[task.status]}`}
          title="Click to cycle status"
        >
          {isDone ? '✓ Done' : STATUS_LABELS[task.status]}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <Link
              to={`/tasks/${task.id}`}
              className={`text-sm leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-800 hover:text-gray-900'}`}
            >
              {task.text}
            </Link>
            {task.tag && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{task.tag}</span>
            )}
          </div>

          {/* Sub-tasks */}
          {subtasks.length > 0 && (
            <div className="mt-1.5 pl-3 border-l-2 border-gray-100 space-y-1">
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_STYLES[st.status]}`}>{STATUS_LABELS[st.status]}</span>
                  <span className={st.status === 'done' ? 'line-through' : ''}>{st.text}</span>
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
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={onSaveNote} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs">Save note</button>
                <button onClick={onCancelNote} className="px-3 py-1 text-gray-500 rounded-lg text-xs hover:bg-gray-100">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={onStartNote} className="mt-1.5 text-xs text-gray-400 hover:text-gray-600">+ Add note</button>
          )}
        </div>
      </div>
    </div>
  )
}
