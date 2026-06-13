import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import ActivityFeed from '../components/ActivityFeed'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'task', label: 'Tasks' },
  { key: 'financial', label: 'Finances' },
  { key: 'document', label: 'Documents' },
  { key: 'note', label: 'Notes' },
  { key: 'user', label: 'Access' },
  { key: 'estate', label: 'Estate' },
]

export default function Activity() {
  const { currentEstate } = useEstate()
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    supabase
      .from('estate_activity_log')
      .select('*')
      .eq('estate_id', currentEstate.id)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => { setLogs(data ?? []); setLoading(false) })
  }, [currentEstate])

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>

  const shown = filter === 'all' ? logs : logs.filter(l => l.entity_type === filter)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">Activity Log</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">A permanent, append-only record of every change. Entries can't be edited or deleted.</p>

      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === f.key ? 'bg-gray-900 text-white dark:bg-gray-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        {loading ? <p className="text-sm text-gray-400">Loading…</p> : <ActivityFeed logs={shown} emptyText="No activity in this view yet." />}
      </div>
    </div>
  )
}
