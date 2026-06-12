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
  const [linkedDocs, setLinkedDocs] = useState([])
  const [noteText, setNoteText] = useState('')
  const [newSubText, setNewSubText] = useState('')
  const [addingSub, setAddingSub] = useState(false)
  const [uploading, setUploading] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mailItems, setMailItems] = useState([])
  const [contacts, setContacts] = useState([])
  const [mailActions, setMailActions] = useState({})
  const [processingMail, setProcessingMail] = useState(false)
  const [estateUsers, setEstateUsers] = useState([])
  const [editingAssignment, setEditingAssignment] = useState(false)
  const [newAssignedTo, setNewAssignedTo] = useState('')

  useEffect(() => {
    if (!id) return
    load()
  }, [id])

  async function load() {
    const [t, st, l, d] = await Promise.all([
      supabase.from('estate_tasks').select('*').eq('id', id).single(),
      supabase.from('estate_tasks').select('*').eq('parent_task_id', id).order('sort_order'),
      supabase.from('estate_task_logs').select('*').eq('task_id', id).order('created_at'),
      supabase.from('estate_documents').select('*').eq('linked_task_id', id),
    ])
    setTask(t.data)
    setSubtasks(st.data ?? [])
    setLogs(l.data ?? [])
    setLinkedDocs(d.data ?? [])

    // Load estate users for assignment
    const { data: users } = await supabase
      .from('estate_users')
      .select('*')
      .eq('estate_id', t.data?.estate_id)
    setEstateUsers(users ?? [])
    setNewAssignedTo(t.data?.assigned_to || '')

    // If this is a mail review task, load mail items and contacts
    if (t.data?.tag === 'mail-review') {
      const { data: mail } = await supabase
        .from('estate_documents')
        .select('*')
        .eq('linked_task_id', id)
        .eq('doc_type', 'mail')

      const { data: conts } = await supabase
        .from('estate_contacts')
        .select('*')
        .eq('estate_id', t.data.estate_id)
        .order('name')

      setMailItems(mail ?? [])
      setContacts(conts ?? [])

      // Initialize mail actions state
      const actions = {}
      mail?.forEach(item => {
        actions[item.id] = {
          createTask: false,
          sendToContact: false,
          sendToContactId: '',
          fileInDocuments: false,
          category: 'legal',
        }
      })
      setMailActions(actions)
    }

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

  async function uploadDocument(file) {
    if (!file || !currentEstate) return
    setUploading(true)
    const path = `${currentEstate.id}/tasks/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('estate-documents').upload(path, file)
    if (!error) {
      const { data } = await supabase.from('estate_documents').insert({
        estate_id: currentEstate.id,
        name: file.name,
        doc_type: 'task',
        file_path: path,
        have: true,
        linked_task_id: id,
      }).select().single()
      if (data) setLinkedDocs(prev => [...prev, data])
    }
    setUploading(null)
  }

  async function processMail() {
    setProcessingMail(true)

    try {
      for (const mailItem of mailItems) {
        const actions = mailActions[mailItem.id]

        // Create task if checked
        if (actions.createTask) {
          await supabase.from('estate_tasks').insert({
            estate_id: currentEstate.id,
            text: `Action: ${mailItem.name} from ${mailItem.requested_from || 'Unknown'}`,
            status: 'pending',
            notes: mailItem.notes,
            linked_task_id: id,
          })
        }

        // Send to contact if checked
        if (actions.sendToContact && actions.sendToContactId) {
          const recipient = contacts.find(c => c.id === actions.sendToContactId)
          await supabase.from('attorney_document_sends').insert({
            estate_id: currentEstate.id,
            document_ids: [mailItem.id],
            document_count: 1,
            document_names: mailItem.name,
            sent_at: new Date().toISOString(),
            recipient_id: actions.sendToContactId,
            recipient_name: recipient?.name,
          })
        }

        // File in documents category if checked
        if (actions.fileInDocuments) {
          await supabase
            .from('estate_documents')
            .update({ notes: `Filed under: ${actions.category}` })
            .eq('id', mailItem.id)
        }
      }

      alert('Mail actions processed!')
      await load()
    } catch (err) {
      console.error('Error processing mail:', err)
      alert('Error processing mail: ' + err.message)
    } finally {
      setProcessingMail(false)
    }
  }

  async function updateAssignment() {
    await supabase
      .from('estate_tasks')
      .update({ assigned_to: newAssignedTo })
      .eq('id', id)
    setTask(prev => ({ ...prev, assigned_to: newAssignedTo }))
    setEditingAssignment(false)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>
  if (!task) return <div className="p-8 text-gray-400">Task not found.</div>

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto w-full">
      <Link to="/tasks" className="text-sm text-gray-400 hover:text-gray-600 dark:text-gray-400 mb-4 block">← Back to tasks</Link>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <div className="flex items-start gap-3 mb-3 flex-wrap">
          <button
            onClick={cycleStatus}
            className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[task.status]}`}
          >
            {task.status === 'done' ? '✓ Done' : STATUS_LABELS[task.status]}
          </button>
          {task.tag && <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-full">{task.tag}</span>}
          {task.assigned_to && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              👤 {task.assigned_to}
            </span>
          )}
        </div>
        <h1 className={`text-lg font-medium text-gray-900 dark:text-white leading-snug mb-1 ${task.status === 'done' ? 'line-through text-gray-400' : ''}`}>
          {task.text}
        </h1>
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>Added {task.date_added}</span>
          {editingAssignment ? (
            <div className="flex gap-1">
              <select
                value={newAssignedTo}
                onChange={e => setNewAssignedTo(e.target.value)}
                className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-2 py-1 text-xs"
              >
                <option value="">Unassigned</option>
                {estateUsers.map(u => (
                  <option key={u.id} value={u.name}>{u.name}</option>
                ))}
              </select>
              <button onClick={updateAssignment} className="text-blue-600 hover:underline">Save</button>
              <button onClick={() => setEditingAssignment(false)} className="text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditingAssignment(true)} className="text-blue-600 hover:underline">
              {task.assigned_to ? 'Change assigned' : 'Assign task'}
            </button>
          )}
        </div>
      </div>

      {/* Mail Review Section */}
      {task?.tag === 'mail-review' && mailItems.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Mail Items to Review ({mailItems.length})
          </h2>

          <div className="space-y-4 mb-4">
            {mailItems.map(mail => (
              <div key={mail.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">{mail.name}</h3>
                  {mail.requested_from && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">From: {mail.requested_from}</p>
                  )}
                  {mail.notes && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{mail.notes}</p>
                  )}
                </div>

                <div className="space-y-2">
                  {/* Create Task Checkbox */}
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={mailActions[mail.id]?.createTask || false}
                      onChange={e =>
                        setMailActions(prev => ({
                          ...prev,
                          [mail.id]: { ...prev[mail.id], createTask: e.target.checked },
                        }))
                      }
                    />
                    ☐ Create Task for follow-up
                  </label>

                  {/* Send to Contact Checkbox */}
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={mailActions[mail.id]?.sendToContact || false}
                      onChange={e =>
                        setMailActions(prev => ({
                          ...prev,
                          [mail.id]: { ...prev[mail.id], sendToContact: e.target.checked },
                        }))
                      }
                    />
                    ☐ Send to Contact
                  </label>

                  {mailActions[mail.id]?.sendToContact && (
                    <div className="ml-6">
                      <select
                        value={mailActions[mail.id]?.sendToContactId || ''}
                        onChange={e =>
                          setMailActions(prev => ({
                            ...prev,
                            [mail.id]: { ...prev[mail.id], sendToContactId: e.target.value },
                          }))
                        }
                        className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-2 py-1 text-xs focus:outline-none"
                      >
                        <option value="">Choose contact...</option>
                        {contacts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* File in Documents Checkbox */}
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={mailActions[mail.id]?.fileInDocuments || false}
                      onChange={e =>
                        setMailActions(prev => ({
                          ...prev,
                          [mail.id]: { ...prev[mail.id], fileInDocuments: e.target.checked },
                        }))
                      }
                    />
                    ☐ File in Documents
                  </label>

                  {mailActions[mail.id]?.fileInDocuments && (
                    <div className="ml-6">
                      <select
                        value={mailActions[mail.id]?.category || 'legal'}
                        onChange={e =>
                          setMailActions(prev => ({
                            ...prev,
                            [mail.id]: { ...prev[mail.id], category: e.target.value },
                          }))
                        }
                        className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded px-2 py-1 text-xs focus:outline-none"
                      >
                        <option value="legal">Legal</option>
                        <option value="financial">Finance</option>
                        <option value="bills">Bills</option>
                        <option value="loans">Loans</option>
                        <option value="utilities">Utilities</option>
                        <option value="business">Business</option>
                        <option value="insurance">Insurance</option>
                        <option value="medical">Medical</option>
                        <option value="government">Government</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={processMail}
            disabled={processingMail}
            className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {processingMail ? 'Processing...' : 'Process Mail Actions'}
          </button>
        </div>
      )}

      {/* Sub-tasks */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Sub-tasks</h2>
          <button onClick={() => setAddingSub(true)} className="text-xs text-blue-600 hover:underline">+ Add sub-task</button>
        </div>
        {subtasks.length === 0 && !addingSub && <p className="text-sm text-gray-400">No sub-tasks.</p>}
        <div className="space-y-2">
          {subtasks.map(st => (
            <div key={st.id} className={`flex items-center gap-2 text-sm ${st.status === 'done' ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
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
              className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            />
            <button onClick={saveSubtask} className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm">Add</button>
            <button onClick={() => setAddingSub(false)} className="px-3 py-1.5 text-gray-500 rounded-lg text-sm hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Documents</h2>
          <label className="text-xs text-blue-600 hover:underline cursor-pointer">
            {uploading ? 'Uploading...' : '+ Upload'}
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx"
              onChange={e => uploadDocument(e.target.files[0])} disabled={uploading} />
          </label>
        </div>
        {linkedDocs.length === 0 && <p className="text-sm text-gray-400">No documents linked to this task.</p>}
        <div className="space-y-2">
          {linkedDocs.map(doc => (
            <div key={doc.id} className="flex items-center gap-2 text-sm">
              <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">{doc.doc_type}</span>
              <span className="text-gray-700 dark:text-gray-300">{doc.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Log */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Notes / Log</h2>
        {logs.length === 0 && <p className="text-sm text-gray-400 mb-3">No notes yet.</p>}
        <div className="space-y-3 mb-4">
          {logs.map(log => (
            <div key={log.id} className="text-sm border-l-2 border-gray-200 dark:border-gray-800 pl-3">
              <div className="text-xs text-gray-400 mb-0.5">{log.created_at?.slice(0, 10)} · {log.created_by}</div>
              <div className="text-gray-700 dark:text-gray-300 leading-relaxed">{log.note}</div>
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
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
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
