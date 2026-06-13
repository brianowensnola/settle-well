import { describeActivity, activityTime, ENTITY_ICON } from '../lib/activity'

// Renders a list of estate_activity_log rows. Privacy is enforced by RLS, so
// whatever rows are passed in are already safe for the current viewer.
export default function ActivityFeed({ logs, emptyText = 'No activity yet.' }) {
  if (!logs || logs.length === 0) {
    return <p className="text-sm text-gray-400">{emptyText}</p>
  }
  return (
    <div className="space-y-2">
      {logs.map(log => {
        const { title, sub, detail } = describeActivity(log)
        return (
          <div key={log.id} className="flex items-start gap-3 border-l-2 border-gray-200 dark:border-gray-800 pl-3 py-1.5">
            <span className="text-sm leading-5 select-none w-5 text-center shrink-0">{ENTITY_ICON[log.entity_type] ?? '•'}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</span>
                <span className="text-xs text-gray-400 shrink-0">{activityTime(log.created_at)}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {sub}{detail ? ` · ${detail}` : ''}
                {log.actor_name ? ` — ${log.actor_name}` : ''}
                {log.is_private ? ' · 🔒' : ''}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
