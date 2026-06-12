import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function HeirDashboard() {
  const { currentEstate } = useEstate()
  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState([])
  const [financials, setFinancials] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    loadData()
  }, [currentEstate])

  async function loadData() {
    const [tasksRes, logsRes, financialsRes, docsRes] = await Promise.all([
      supabase.from('estate_tasks').select('*').eq('estate_id', currentEstate.id),
      supabase.from('estate_task_logs').select('*').eq('estate_id', currentEstate.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('estate_financials').select('*').eq('estate_id', currentEstate.id),
      supabase.from('estate_documents').select('*').eq('estate_id', currentEstate.id).in('doc_type', ['legal', 'property']),
    ])

    setTasks(tasksRes.data ?? [])
    setLogs(logsRes.data ?? [])
    setFinancials(financialsRes.data ?? [])
    setDocuments(docsRes.data ?? [])
    setLoading(false)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  // Calculate estate status
  const getEstateStatus = () => {
    const total = tasks.length
    const done = tasks.filter(t => t.status === 'done').length
    if (done === 0) return 'Inventory in progress'
    if (done < total * 0.5) return 'Inventory in progress'
    if (done < total * 0.9) return 'Asset review'
    return 'Distribution pending'
  }

  // Calculate financials
  const accounts = financials.filter(f => f.category === 'account')
  const obligations = financials.filter(f => f.category === 'obligation')
  const totalBalance = accounts.reduce((s, a) => s + (a.amount ?? 0), 0)
  const totalSpent = obligations.reduce((s, o) => s + (o.amount ?? 0), 0)

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">
          {currentEstate.deceased_name} Estate
        </h1>
        <p className="text-gray-600 dark:text-gray-400">Transparency Report</p>
      </div>

      {/* Estate Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Estate Status</h2>
          <p className="text-lg font-medium text-gray-900 dark:text-white">{getEstateStatus()}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {tasks.filter(t => t.status === 'done').length} of {tasks.length} tasks completed
          </p>
        </div>

        {/* Estate Accounting */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Estate Balance</h2>
          <p className="text-lg font-medium text-gray-900 dark:text-white">
            ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Current balance</p>
        </div>
      </div>

      {/* Estate Accounting Breakdown */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Estate Accounting</h2>
        <div className="space-y-3">
          {accounts.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Accounts & Assets</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                ${accounts.reduce((s, a) => s + (a.amount ?? 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
          {obligations.length > 0 && (
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Obligations & Expenses</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                ${obligations.reduce((s, o) => s + (o.amount ?? 0), 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Court Documents */}
      {documents.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Court Documents</h2>
          <div className="space-y-2">
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-900 dark:text-white">{doc.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(doc.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Activity Log</h2>
        <div className="space-y-3">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400">No activity yet.</p>
          ) : (
            logs.map(log => (
              <div key={log.id} className="text-sm border-l-2 border-gray-200 dark:border-gray-800 pl-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 dark:text-white">{log.note}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">by {log.created_by}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          📋 This Transparency Report shows estate status, assets, expenses, court documents, and a complete activity log for all actions taken.
        </p>
      </div>
    </div>
  )
}
