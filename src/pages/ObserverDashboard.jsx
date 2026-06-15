import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { statusStageLabel } from '../lib/constants'

// Observer (Level 4): read-only, NOT a beneficiary. Sees estate status,
// progress, and court documents — but not the financial accounting/asset values
// heirs are entitled to, nor the executor-only activity log.
export default function ObserverDashboard() {
  const { currentEstate } = useEstate()
  const [tasks, setTasks] = useState([])
  const [documents, setDocuments] = useState([])
  const [sends, setSends] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    Promise.all([
      supabase.from('estate_tasks').select('status').eq('estate_id', currentEstate.id),
      supabase.from('estate_documents').select('id, name, created_at').eq('estate_id', currentEstate.id).in('doc_type', ['legal', 'property']),
      supabase.from('attorney_document_sends').select('id, document_count, document_names, recipient_name, sent_at').eq('estate_id', currentEstate.id).order('sent_at', { ascending: false }),
    ]).then(([tasksRes, docsRes, sendsRes]) => {
      setTasks(tasksRes.data ?? [])
      setDocuments(docsRes.data ?? [])
      setSends(sendsRes.data ?? [])
      setLoading(false)
    })
  }, [currentEstate])

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const done = tasks.filter(t => t.status === 'done').length
  const total = tasks.length
  const status = currentEstate.status_stage
    ? (statusStageLabel(currentEstate.status_stage) || 'In progress')
    : (total === 0 || done < total * 0.5 ? 'In progress' : done < total * 0.9 ? 'Under review' : 'Nearing completion')

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
          {currentEstate.deceased_name} Estate
        </h1>
        <p className="text-gray-600 dark:text-gray-400">Status Overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Estate Status</h2>
          <p className="text-lg font-medium text-gray-900 dark:text-white">{status}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Progress</h2>
          <p className="text-lg font-medium text-gray-900 dark:text-white">{done} of {total} tasks completed</p>
          {total > 0 && (
            <div className="mt-3 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-gray-700 dark:bg-gray-400" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
          )}
        </div>
      </div>

      {documents.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Court Documents</h2>
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-900 dark:text-white">{doc.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sends.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Documents sent to attorney</h2>
          <div className="space-y-2">
            {sends.map(s => (
              <div key={s.id} className="p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-900 dark:text-white">
                    {s.document_count} document{s.document_count !== 1 ? 's' : ''} → {s.recipient_name || 'attorney'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{new Date(s.sent_at).toLocaleDateString()}</span>
                </div>
                {s.document_names && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.document_names}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-lg">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          You have read-only observer access: estate status, progress, court documents, and documents sent to the attorney. Financial detail is shown to beneficiaries.
        </p>
      </div>
    </div>
  )
}
