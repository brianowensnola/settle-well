// Estate user roles. Stored value 'administrator' is the full-access role
// (the database permission rules grant write access to it) — displayed as
// "Executor", the term users expect. 'executor' is treated as a legacy alias.
export const ROLE_LABELS = {
  administrator: 'Executor',
  executor: 'Executor',
  heir: 'Heir',
  collaborator: 'Collaborator',
  observer: 'Observer',
}

export const ROLE_DESCRIPTIONS = {
  heir: 'Beneficiary — sees their dashboard and assigned tasks.',
  collaborator: 'Helps with the work — can view and work all non-private tasks, but not private/forensic items.',
  observer: 'Read-only access.',
}

// Roles you can assign when inviting someone (not the executor — that's the
// estate creator / full-access owner).
export const INVITE_ROLES = ['heir', 'collaborator', 'observer']

export const roleLabel = role => ROLE_LABELS[role] ?? role

// Full-access (the Executor): the only role that sees private/forensic items
// and can manage the estate.
export const isFullAccess = role => role === 'administrator' || role === 'executor'

// Which roles may see/visit each page. Pages not listed are open to all estate
// members. 'administrator' is the Executor (full access).
const ALL = ['administrator', 'collaborator', 'heir', 'observer']
export const PAGE_ROLES = {
  '/dashboard':        ALL,
  '/assistant':        ['administrator'],
  '/tasks':            ALL,
  '/mail':             ['administrator', 'collaborator'],
  '/intake-review':    ['administrator'],
  '/send-to-attorney': ['administrator'],
  '/send-documents':   ['administrator'],
  '/finances':         ['administrator'],
  '/notes':            ['administrator', 'collaborator'],
  '/documents':        ['administrator', 'collaborator', 'heir', 'observer'],
  '/documents/upload': ['administrator', 'collaborator'],
  '/credentials':      ['administrator'],
  '/contacts':         ALL,
  '/settings':         ['administrator'],
}

export function canAccess(path, role) {
  const allowed = PAGE_ROLES[path]
  if (!allowed) return true
  const r = role === 'executor' ? 'administrator' : role
  return allowed.includes(r)
}
