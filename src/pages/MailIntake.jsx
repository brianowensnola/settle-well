import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function MailIntake() {
  const { currentEstate } = useEstate()
  const [intakeItems, setIntakeItems] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [form, setForm] = useState({
    name: '',
    from_sender: '',
    category: 'other',
    notes: '',
    requires_action: false,
  })
  const [loading, setLoading] = useState(true)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    if (!currentEstate) return
    loadIntake()
  }, [currentEstate])

  async function loadIntake() {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('estate_documents')
      .select('*')
      .eq('estate_id', currentEstate.id)
      .eq('doc_type', 'mail')
      .gte('created_at', `${today}T00:00:00`)
      .order('created_at', { ascending: false })

    setIntakeItems(data ?? [])
    setLoading(false)
  }

  async function uploadFile(file) {
    if (!file) return
    setUploading(true)

    try {
      const today = new Date().toISOString().split('T')[0]
      const path = `${currentEstate.id}/mail/${today}/${Date.now()}_${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('estate-documents')
        .upload(path, file)

      if (uploadError) throw uploadError

      const { data } = await supabase
        .from('estate_documents')
        .insert({
          estate_id: currentEstate.id,
          name: form.name || file.name,
          doc_type: 'mail',
          file_path: path,
          have: true,
          notes: form.notes,
          requested_from: form.from_sender,
        })
        .select()
        .single()

      if (data) {
        // Auto-create daily mail review task
        const today = new Date().toISOString().split('T')[0]
        const taskName = `Review mail from ${new Date(today).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

        // Check if task already exists for today
        const { data: existingTask } = await supabase
          .from('estate_tasks')
          .select('id')
          .eq('estate_id', currentEstate.id)
          .eq('text', taskName)
          .eq('status', 'pending')
          .single()

        let reviewTaskId = existingTask?.id

        if (!existingTask) {
          // File the mail-review task under a phase so it shows on the board
          const { data: sec } = await supabase
            .from('estate_sections')
            .select('id')
            .eq('estate_id', currentEstate.id)
            .eq('label', 'Phase 2 — First Week')
            .maybeSingle()
          const { data: newTask } = await supabase
            .from('estate_tasks')
            .insert({
              estate_id: currentEstate.id,
              section_id: sec?.id ?? null,
              text: taskName,
              status: 'pending',
              tag: 'mail-review',
              detail: 'Review today\'s mail and decide what actions to take',
            })
            .select()
            .single()
          reviewTaskId = newTask?.id
        }

        // Link mail document to review task
        if (reviewTaskId) {
          await supabase
            .from('estate_documents')
            .update({ linked_task_id: reviewTaskId })
            .eq('id', data.id)
        }

        setIntakeItems(prev => [data, ...prev])
        setForm({ name: '', from_sender: '', category: 'other', notes: '', requires_action: false })
        setUploadedFile(null)
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('Error uploading file: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  async function markProcessed(id) {
    await supabase.from('estate_documents').update({ notes: 'Processed' }).eq('id', id)
    setIntakeItems(prev => prev.filter(item => item.id !== id))
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Daily Mail Intake</h1>
        <p className="text-gray-600 dark:text-gray-400">Scan and upload incoming mail and documents</p>
      </div>

      {showSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 px-4 py-3 rounded-lg mb-4 text-sm font-medium">
          ✓ Mail item uploaded successfully!
        </div>
      )}

      {/* Upload Section */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Upload Mail</h2>

        <div className="space-y-4">
          {/* File Input */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Scan or upload document
            </label>
            <label className="flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 cursor-pointer hover:border-gray-400 dark:hover:border-gray-600">
              <div className="text-center">
                <div className="text-2xl mb-2">📸</div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Click to upload or scan</p>
                <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, HEIC, DOCX</p>
              </div>
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.docx"
                onChange={e => setUploadedFile(e.target.files[0])}
                disabled={uploading}
              />
            </label>
            {uploadedFile && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                File selected: {uploadedFile.name}
              </p>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                Document name
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="E.g., Bank Statement, Tax Notice..."
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                From (sender)
              </label>
              <input
                type="text"
                value={form.from_sender}
                onChange={e => setForm(p => ({ ...p, from_sender: e.target.value }))}
                placeholder="E.g., First National Bank..."
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Any notes about this document..."
              rows={2}
              className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={form.requires_action}
              onChange={e => setForm(p => ({ ...p, requires_action: e.target.checked }))}
            />
            Create action item (if this needs follow-up)
          </label>

          <button
            onClick={() => uploadFile(uploadedFile)}
            disabled={!uploadedFile || uploading}
            className="w-full px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Mail Item'}
          </button>
        </div>
      </div>

      {/* Today's Intake */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Today's Mail ({intakeItems.length})
        </h2>
        {intakeItems.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 text-center text-gray-400">
            No mail items yet today
          </div>
        ) : (
          <div className="space-y-2">
            {intakeItems.map(item => (
              <div key={item.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</h3>
                    {item.requested_from && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">From: {item.requested_from}</p>
                    )}
                    {item.notes && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{item.notes}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button
                    onClick={() => markProcessed(item.id)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                  >
                    Mark processed
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          💡 <strong>Tip:</strong> Check the "Create action item" box if mail needs follow-up. This will automatically create a task for you.
        </p>
      </div>
    </div>
  )
}
