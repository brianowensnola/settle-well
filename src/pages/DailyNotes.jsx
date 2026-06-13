import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'

export default function DailyNotes() {
  const { currentEstate, role } = useEstate()
  const user = useUser()
  const canSeePrivate = isFullAccess(role)
  const [notes, setNotes] = useState([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [content, setContent] = useState('')
  const [tags, setTags] = useState([])
  const [newTag, setNewTag] = useState('')
  const [isPrivate, setIsPrivate] = useState(false) // current editing lane (executor only)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (!currentEstate) return
    loadNotes()
  }, [currentEstate])

  async function loadNotes() {
    let query = supabase
      .from('estate_daily_notes')
      .select('*')
      .eq('estate_id', currentEstate.id)
      .order('note_date', { ascending: false })
    // Non-executors only ever see shared notes
    if (!canSeePrivate) query = query.eq('is_private', false)
    const { data } = await query
    setNotes(data ?? [])
    setLoading(false)
  }

  // Load the content/tags for a given date + visibility lane into the editor
  function loadLane(date, priv, list = notes) {
    const existing = list.find(n => n.note_date === date && n.is_private === priv)
    setContent(existing?.content || '')
    setTags(existing?.tags || [])
  }

  async function saveNote() {
    if (!content.trim()) return
    setSaving(true)

    try {
      const wantPrivate = canSeePrivate && isPrivate
      const existing = notes.find(n => n.note_date === selectedDate && n.is_private === wantPrivate)

      if (existing) {
        await supabase
          .from('estate_daily_notes')
          .update({ content, tags, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('estate_daily_notes')
          .insert({
            estate_id: currentEstate.id,
            note_date: selectedDate,
            content,
            tags,
            is_private: wantPrivate,
            created_by: user?.id,
          })
      }

      setContent('')
      setTags([])
      setNewTag('')
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      await loadNotes()
    } catch (err) {
      console.error('Error saving note:', err)
      alert('Error saving note: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteNote(id) {
    if (!confirm('Delete this note?')) return
    await supabase.from('estate_daily_notes').delete().eq('id', id)
    await loadNotes()
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const todayNote = notes.find(n => n.note_date === selectedDate && n.is_private === (canSeePrivate && isPrivate))
  const dateDisplay = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Daily Notes</h1>
        <p className="text-gray-600 dark:text-gray-400">Document important events, calls, and decisions</p>
      </div>

      {showSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-4 text-sm font-medium">
          ✓ Note saved for {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </div>
      )}

      {/* Note Entry */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 mb-6">
        {/* Visibility lane (executor only) */}
        {canSeePrivate && (
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Visibility</label>
            <div className="flex gap-2">
              {[{ p: false, label: 'Shared', hint: 'Everyone on the estate' }, { p: true, label: '🔒 Executor only', hint: 'Only you' }].map(opt => (
                <button
                  key={String(opt.p)}
                  onClick={() => { setIsPrivate(opt.p); loadLane(selectedDate, opt.p) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${isPrivate === opt.p ? (opt.p ? 'bg-gray-800 text-white' : 'bg-blue-600 text-white') : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}
                  title={opt.hint}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => {
              setSelectedDate(e.target.value)
              loadLane(e.target.value, canSeePrivate && isPrivate)
            }}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{dateDisplay}</p>
        </div>

        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Note</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="What happened today? What decisions were made? Who did you talk to?"
            rows={6}
            className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
          />
        </div>

        {/* Tags */}
        <div className="mb-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Tags</label>
          <div className="flex gap-2 mb-2 flex-wrap">
            {tags.map((tag, idx) => (
              <button
                key={idx}
                onClick={() => setTags(prev => prev.filter((_, i) => i !== idx))}
                className="bg-gray-200 dark:bg-gray-800 text-gray-800 dark:text-gray-300 px-2 py-1 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-700"
              >
                {tag} ×
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newTag.trim()) {
                  setTags(prev => [...prev, newTag.trim()])
                  setNewTag('')
                }
              }}
              placeholder="Add tag and press Enter"
              className="flex-1 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={saveNote}
          disabled={!content.trim() || saving}
          className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : todayNote ? 'Update Note' : 'Save Note'}
        </button>
      </div>

      {/* Previous Notes */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Previous Notes</h2>
        <div className="space-y-3">
          {notes.map(note => (
            <div key={note.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    {new Date(note.note_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {note.is_private && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-800 text-white">🔒 Executor only</span>
                    )}
                  </p>
                  {note.tags?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {note.tags.map((tag, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="text-xs text-gray-400 hover:text-red-500"
                >
                  Delete
                </button>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{note.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
