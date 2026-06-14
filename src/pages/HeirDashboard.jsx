import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { statusStageLabel } from '../lib/constants'

const fmt = n => '$' + (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function HeirDashboard() {
  const { currentEstate } = useEstate()
  const [tasks, setTasks] = useState([])
  const [summary, setSummary] = useState(null) // safe accounting aggregates (RPC)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    loadData()
  }, [currentEstate])

  async function loadData() {
    const [tasksRes, sumRes, docsRes] = await Promise.all([
      supabase.from('estate_tasks').select('*').eq('estate_id', currentEstate.id),
      supabase.rpc('estate_transparency', { p_estate_id: currentEstate.id }),
      supabase.from('estate_documents').select('*').eq('estate_id', currentEstate.id).in('doc_type', ['legal', 'property']),
    ])

    setTasks(tasksRes.data ?? [])
    setSummary(sumRes.data ?? null)
    setDocuments(docsRes.data ?? [])
    setLoading(false)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  // Estate status: executor-set stage if present, else derived from task progress
  const getEstateStatus = () => {
    if (currentEstate.status_stage) return statusStageLabel(currentEstate.status_stage) || 'In progress'
    const total = tasks.length
    const done = tasks.filter(t => t.status === 'done').length
    if (total === 0 || done < total * 0.5) return 'Inventory in progress'
    if (done < total * 0.9) return 'Asset review'
    return 'Distribution pending'
  }

  const s = summary || {}
  const totalBalance = s.accounts_total ?? 0
  const assetList = Array.isArray(s.assets) ? s.assets : []

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

      {/* Estate Accounting */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Estate Accounting</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            ['Accounts', s.accounts_total],
            ['Money received', s.received],
            ['Money spent', s.spent],
            ['Known assets', s.assets_total],
            ['Liabilities', s.liabilities_total],
            ['Monthly obligations', s.monthly_obligations],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">{fmt(val)}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">Summary figures only. Account numbers and credentials are not shown.</p>
      </div>

      {/* Asset Summary */}
      {assetList.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Asset Summary</h2>
          <div className="space-y-2">
            {assetList.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                <span className="text-sm text-gray-900 dark:text-white">{a.name}</span>
                {a.status && <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{a.status}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

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

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-900 dark:text-blue-300">
          📋 This Transparency Report shows estate status, assets, expenses, and court documents.
        </p>
      </div>
    </div>
  )
}
