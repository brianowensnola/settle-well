// Turn an estate_activity_log row into a human-readable line. Pure formatting —
// the log itself is written by database triggers (see migration 023).

const ACTION_VERB = {
  created: 'Created', updated: 'Updated', status_changed: 'Status changed',
  deleted: 'Deleted', uploaded: 'Uploaded', renamed: 'Renamed', added: 'Added',
  removed: 'Removed', invited: 'Invited', joined: 'Joined',
  role_changed: 'Role changed', stage_changed: 'Estate stage',
}

const ENTITY_NOUN = {
  task: 'task', financial: 'finance entry', document: 'document',
  note: 'note', user: 'member', estate: 'estate',
}

// Small emoji marker per entity, just for quick visual scanning.
export const ENTITY_ICON = {
  task: '✓', financial: '$', document: '📄', note: '📝', user: '👤', estate: '🏛',
}

export function describeActivity(log) {
  const verb = ACTION_VERB[log.action] ?? log.action
  const noun = ENTITY_NOUN[log.entity_type] ?? log.entity_type
  // estate stage/status reads better without the "estate" noun repeated
  const sub = log.entity_type === 'estate' ? verb : `${verb} ${noun}`
  return { title: log.entity_label || '(unnamed)', sub, detail: log.detail || null }
}

export function activityTime(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
