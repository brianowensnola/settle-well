import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { STATUS_STYLES, STATUS_LABELS } from '../lib/constants'

const STATUS_CYCLE = ['pending', 'in_progress', 'waiting', 'done']

export default function TaskDetail() {
  const { id } = useParams()
  const { currentEstate } = useEstate()
  const user = useUser()
  const navigate = useNavigate()
  const [task, setTask] = useState(null)
  const [subtasks, setSubtasks] = useState([])
  const [logs, setLogs] = useState([])
  const [noteText, setNoteText] = useState('')
  const [newSubText, setNewSubText] = useState('')
  const [addingSub, setAddingSub] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    load()
  }, [id])

  async function load() {
    const [t, st, l] = await Promise.all([
      supabase.from('estate_tasks').select('*').eq('id', id).single(),
      supabase.from('estate_tasks').select('*').eq('parent_task_id', id).order('sort_order'),
      supabase.from('estate_task_logs').select('*').eq('task_id', id).order('created_at'),
    ])
    setTask(t.data)
    setSubtasks(st.data ?? [])
    setLogs(l.data ?? [])
    setLoading(false)
  }

  async function cycleStatus() {
    const idx = STATUS_CYCLE.indexOf(task.status)
    const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
    await supabase.from('estate_tasks').update({ status: next }).eq('id', id)
    setTask(prev => ({ ...prev, status: next }))
  }

  async function saveNote() {
    if (!noteText.trim()) return
    const { data } = await supabase.from('estate_task_logs').insert({
      task_id: id,
      estate_id: currentEstate.id,
      note: noteText.trim(),
      created_by: user?.email ?? 'Brian',
    }).select().single()
    if (data) setLogs(prev => [...prev, data])
    setNoteText('')
  }

  async function saveSubtask() {
    if (!newSubText.trim()) return
    const { data } = await supabase.from('estate_tasks').insert({
      estate_id: currentEstate.id,
      section_id: task.section_id,
      parent_task_id: id,
      text: newSubText.trim(),
      status: 'pending',
    }).select().single()
    if (data) setSubtasks(prev => [...prev, data])
    setNewSubText('')
    setAddingSub(false)
  }

  async function noteToTask(log) {
    const { data } = await supabase.from('estate_tasks').insert({
      estate_id: currentEstate.id,
      section_id: task.section_id,
      parent_task_id: id,
      text: log.note.slice(0, 200),
      status: 'pending',
    }).select().single()
    if (data) {
      await supabase.from('estate_task_logs').update({ spawned_task_id: data.id }).eq('id', log.id)
      setSubtasks(prev => [...prev, data])
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, spawned_task_id: data.id } : l))
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!task) return <div className="p-8 text-gray-400">Task not found.</div>

  return (
    <div className="p-6 max-w-2xl">
      <Link to="/tasks" className="text-sm text-gray-400 hover:text-gray-600 mb-4 block">← Back to tasks</Link>

      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-3">
          <button
            onClick={cycleStatus}
            className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[task.status]}`}
          >
            {task.status === 'done' ? '✓ Done' : STATUS_LABELS[task.status]}
          </button>
          {task.tag && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{task.tag}</span>}
        </div>
        <h1 className={`text-lg font-medium text-gray-900 leading-snug mb-1 ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
          {task.text}
        </h1>
        <div className="text-xs text-gray-400">Added {task.date_added}</div>
      </div>

      {/* Sub-tasks */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Sub-tasks</h2>
          <button onClick={() => setAddingSub(true)} className="text-xs text-blue-600 hover:underline">+ Add sub-task</button>
        </div>
        {subtasks.length === 0 && !addingSub && <p className="text-sm text-gray-400">No sub-tasks.</p>}
        <div className="space-y-2">
          {subtasks.map(st => (
            <div key={st.id} className={`flex items-center gap-2 text-sm ${st.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
              <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLES[st.status]}`}>{STATUS_LABELS[st.status]}</span>
              {st.text}
            </div>
          ))}
        </div>
        {addingSub && (
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              value={newSubText}
              onChange={e => setNewSubText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveSubtask(); if (e.key === 'Escape') setAddingSub(false) }}
              placeholder="Sub-task..."
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <button onClick={saveSubtask} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Add</button>
            <button onClick={() => setAddingSub(false)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100">Cancel</button>
          </div>
        )}
      </div>

      {/* Log */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Notes / Log</h2>
        {logs.length === 0 && <p className="text-sm text-gray-400 mb-3">No notes yet.</p>}
        <div className="space-y-3 mb-4">
          {logs.map(log => (
            <div key={log.id} className="text-sm border-l-2 border-gray-200 pl-3">
              <div className="text-xs text-gray-400 mb-0.5">{log.created_at?.slice(0, 10)} · {log.created_by}</div>
              <div className="text-gray-700 leading-relaxed">{log.note}</div>
              {!log.spawned_task_id && (
                <button
                  onClick={() => noteToTask(log)}
                  className="mt-1 text-xs text-blue-500 hover:underline"
                >
                  Create task from this note
                </button>
              )}
              {log.spawned_task_id && (
                <span className="text-xs text-green-600 mt-1 block">→ Task created</span>
              )}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note..."
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
          />
          <button
            onClick={saveNote}
            disabled={!noteText.trim()}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm disabled:opacity-40"
          >
            Save note
          </button>
        </div>
      </div>
    </div>
  )
}
