import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { isFullAccess } from '../lib/roles'

const TOOLS = [
  { to: '/assistant',        label: 'AI Assistant',     icon: '🤖', desc: 'Review the estate, match documents, run a forensic audit.' },
  { to: '/finances',         label: 'Finances',         icon: '💰', desc: 'Accounts, debts, monthly obligations, insurance, and assets.' },
  { to: '/credentials',      label: 'Credentials',      icon: '🔑', desc: 'Account logins and access details for this estate.' },
  { to: '/documents/upload', label: 'Upload Files',     icon: '⬆️', desc: 'Upload documents into this estate.' },
  { to: '/death-notices',    label: 'Death Notifications', icon: '✉️', desc: 'Draft letters notifying agencies, banks, and companies of the death.' },
  { to: '/intake-review',    label: 'Intake Review',    icon: '📝', desc: 'Review and update the estate intake answers.' },
  { to: '/send-to-attorney', label: 'Send to Attorney', icon: '✉️', desc: 'Send selected documents to the attorney with secure links.' },
  { to: '/activity',         label: 'Activity Log',     icon: '🧾', desc: 'Permanent, append-only record of every change.' },
  { to: '/settings',         label: 'Estate Settings',  icon: '⚙️', desc: 'Estate details, stage, and status.' },
  { to: '/multi-settings',   label: 'Multi-Estate Settings', icon: '🗂️', desc: 'Manage and delete estates across the family unit.' },
]

export default function ExecutorTools() {
  const { currentEstate, role } = useEstate()
  const [aiPending, setAiPending] = useState(0)

  useEffect(() => {
    if (!currentEstate) return
    supabase.from('estate_ai_suggestions').select('id').eq('estate_id', currentEstate.id).eq('status', 'pending')
      .then(({ data }) => setAiPending((data ?? []).length))
  }, [currentEstate])

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>
  if (!isFullAccess(role)) return <div className="p-8 text-gray-400">Executor access required.</div>

  const badgeFor = to => (to === '/assistant' ? aiPending : 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">Executor Tools</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        Executor-only tools for the <strong>{currentEstate.deceased_name}</strong> estate.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TOOLS.map(t => (
          <Link
            key={t.to}
            to={t.to}
            className="flex items-start gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-xl leading-none mt-0.5">{t.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                {t.label}
                {badgeFor(t.to) > 0 && (
                  <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full bg-red-500 text-white">{badgeFor(t.to)}</span>
                )}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
