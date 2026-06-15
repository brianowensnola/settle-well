import { Link } from 'react-router-dom'
import { STATUS_STYLES, STATUS_LABELS } from '../lib/constants'

// Shared interactive task row, used by the per-estate Tasks page and the
// cross-estate All Tasks page. All actions are driven by callbacks so each
// page can wire them to the right estate.
export default function TaskRow({
  task, subtasks = [], logs = [], onCycle, canApprove, onApprove, onSendBack,
  addingNote, noteText, onStartNote, onNoteChange, onSaveNote, onCancelNote, noteRef,
  contextLabel,
}) {
  const isDone = task.status === 'done'
  const isSubmitted = task.status === 'submitted'

  return (
    <div className={`border-t border-gray-100 ${isDone ? 'bg-green-50' : isSubmitted ? 'bg-purple-50 dark:bg-purple-900/10' : ''}`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {isSubmitted ? (
          <span className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES.submitted}`} title="Awaiting executor approval">Submitted</span>
        ) : (
          <button
            onClick={onCycle}
            className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer ${STATUS_STYLES[task.status]}`}
            title="Click to cycle status"
          >
            {isDone ? '✓ Done' : STATUS_LABELS[task.status]}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <Link
              to={`/tasks/${task.id}`}
              className={`text-sm leading-snug ${isDone ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white hover:text-gray-900 dark:text-white'}`}
            >
              {task.text}
            </Link>
            {task.tag && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded">{task.tag}</span>
            )}
            {task.assigned_to && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">👤 {task.assigned_to}</span>
            )}
            {contextLabel && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-50 dark:bg-gray-800 text-gray-400 rounded">{contextLabel}</span>
            )}
          </div>

          {/* Submitted for executor approval */}
          {isSubmitted && (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-purple-700 dark:text-purple-300">Marked complete by {task.submitted_by_name || 'a collaborator'} — needs your approval.</span>
              {canApprove && (
                <>
                  <button onClick={onApprove} className="text-xs px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700">Approve</button>
                  <button onClick={onSendBack} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200">Send back</button>
                </>
              )}
            </div>
          )}

          {/* Guidance — why this matters / what to check */}
          {task.detail && !isDone && !isSubmitted && (
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">{task.detail}</p>
          )}

          {/* Sub-tasks */}
          {subtasks.length > 0 && (
            <div className="mt-1.5 pl-3 border-l-2 border-gray-100 space-y-1">
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className={`px-1.5 py-0.5 rounded text-xs ${STATUS_STYLES[st.status]}`}>{STATUS_LABELS[st.status]}</span>
                  <Link to={`/tasks/${st.id}`} className={`hover:text-gray-800 dark:hover:text-gray-200 hover:underline ${st.status === 'done' ? 'line-through' : ''}`}>{st.text}</Link>
                </div>
              ))}
            </div>
          )}

          {/* Log entries */}
          {logs.length > 0 && (
            <div className="mt-2 space-y-1">
              {logs.map(log => (
                <div key={log.id} className="text-xs text-gray-500 leading-relaxed">
                  <span className="text-gray-400 mr-1.5">{log.created_at?.slice(0, 10)}</span>
                  {log.note}
                </div>
              ))}
            </div>
          )}

          {/* Add note */}
          {addingNote === task.id ? (
            <div className="mt-2 space-y-1.5">
              <textarea
                ref={noteRef}
                value={noteText}
                onChange={e => onNoteChange(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className="w-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={onSaveNote} className="px-3 py-1 bg-gray-900 text-white rounded-lg text-xs">Save note</button>
                <button onClick={onCancelNote} className="px-3 py-1 text-gray-500 rounded-lg text-xs hover:bg-gray-100 dark:bg-gray-800">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={onStartNote} className="mt-1.5 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-400">+ Add note</button>
          )}
        </div>
      </div>
    </div>
  )
}
