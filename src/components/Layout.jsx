import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { useDarkMode } from '../lib/DarkModeContext'
import { canAccess, isFullAccess } from '../lib/roles'
import DisclaimerGate from './DisclaimerGate'

const MOBILE_NAV = [
  { to: '/dashboard',   label: '📊', icon: 'Dashboard' },
  { to: '/tasks',       label: '✓', icon: 'Tasks' },
  { to: '/finances',    label: '💰', icon: 'Finances' },
  { to: '/notes',       label: '📝', icon: 'Notes' },
  { to: '/documents',   label: '📄', icon: 'Docs' },
  { to: '/contacts',    label: '👥', icon: 'Contacts' },
]

// Per-estate items everyone (per their role) uses — shown under each estate.
const SHARED_NAV = [
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/messages',    label: 'Messages' },
  { to: '/tasks',       label: 'Tasks' },
  { to: '/notes',       label: 'Daily Notes' },
  { to: '/documents',   label: 'Documents' },
  { to: '/contacts',    label: 'Contacts' },
]

// Executor-only tools — shown in a dedicated top section; they act on the
// currently-selected estate.
const EXECUTOR_NAV = [
  { to: '/assistant',        label: 'AI Assistant' },
  { to: '/finances',         label: 'Finances' },
  { to: '/assets',           label: 'Assets' },
  { to: '/inventory',        label: 'Inventory' },
  { to: '/documents',        label: 'Documents' },
  { to: '/contacts',         label: 'Contacts' },
  { to: '/credentials',      label: 'Credentials' },
  { to: '/documents/upload', label: 'Upload Files' },
  { to: '/death-notices',    label: 'Death Notifications' },
  { to: '/intake-review',    label: 'Intake Review' },
  { to: '/communications',   label: 'Communications' },
  { to: '/heir-comms',       label: 'Heir Communications' },
  { to: '/activity',         label: 'Activity Log' },
  { to: '/settings',         label: 'Estate Settings' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { currentEstate, role, estates, switchEstate } = useEstate()
  const { pathname } = useLocation()
  const blocked = !canAccess(pathname, role)
  const user = useUser()
  const { isDark, setIsDark } = useDarkMode()
  const [expandedEstate, setExpandedEstate] = useState(currentEstate?.id)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [groupNames, setGroupNames] = useState({}) // group_id -> name
  const [counts, setCounts] = useState({ mail: 0, ai: 0, submittedByEstate: {}, submittedTotal: 0 })
  const closeMobile = () => setMobileNavOpen(false)

  // Group estates into families. A grouped estate's family is its group; an
  // ungrouped estate is its own standalone family. The nav only ever shows the
  // CURRENT family's estates — other families never bleed in.
  const familyKeyOf = e => e?.group_id || (e ? `solo:${e.id}` : null)
  const currentFamilyKey = familyKeyOf(currentEstate)
  const familyMembers = estates.filter(e => currentFamilyKey && familyKeyOf(e) === currentFamilyKey)
  const familyNameOf = key =>
    key?.startsWith('solo:')
      ? (estates.find(e => `solo:${e.id}` === key)?.deceased_name ?? 'Estate')
      : (groupNames[key] || 'Family estate')
  const familyName = currentFamilyKey ? (currentFamilyKey.startsWith('solo:') ? '' : familyNameOf(currentFamilyKey)) : ''
  // Distinct families for the switcher.
  const families = []
  const seenFam = new Set()
  for (const e of estates) {
    const key = familyKeyOf(e)
    if (seenFam.has(key)) continue
    seenFam.add(key)
    families.push({ key, name: familyNameOf(key), firstEstate: estates.find(x => familyKeyOf(x) === key) })
  }

  function switchFamily(key) {
    const fam = families.find(f => f.key === key)
    if (fam?.firstEstate) { switchEstate(fam.firstEstate); setExpandedEstate(fam.firstEstate.id) }
  }

  // Tasks awaiting approval within the current family (for the All Tasks badge).
  const familySubmitted = familyMembers.reduce((s, e) => s + (counts.submittedByEstate[e.id] ?? 0), 0)

  // Pending-item counts for nav badges. Refresh on estate switch and on each
  // navigation so badges clear soon after you act on something.
  useEffect(() => {
    let off = false
    ;(async () => {
      // AI badge counts the whole family's pending findings (the dashboard /
      // Assistant show them family-wide), so the number matches what you can act on.
      const famIds = familyMembers.map(e => e.id)
      const [mailRes, subRes, aiRes] = await Promise.all([
        supabase.from('family_mail').select('id').eq('status', 'pending'),
        supabase.from('estate_tasks').select('estate_id').eq('status', 'submitted'),
        famIds.length
          ? supabase.from('estate_ai_suggestions').select('id').in('estate_id', famIds).eq('status', 'pending')
          : Promise.resolve({ data: [] }),
      ])
      if (off) return
      const byEstate = {}
      for (const r of subRes.data ?? []) byEstate[r.estate_id] = (byEstate[r.estate_id] ?? 0) + 1
      setCounts({
        mail: (mailRes.data ?? []).length,
        ai: (aiRes.data ?? []).length,
        submittedByEstate: byEstate,
        submittedTotal: (subRes.data ?? []).length,
      })
    })()
    return () => { off = true }
  }, [currentEstate, pathname])

  // Names of all family groups the user can see (for the section header + switcher).
  useEffect(() => {
    let off = false
    ;(async () => {
      const { data } = await supabase.from('estate_groups').select('id, name')
      if (!off) setGroupNames(Object.fromEntries((data ?? []).map(g => [g.id, g.name])))
    })()
    return () => { off = true }
  }, [estates])

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  async function changePassword() {
    const pw = prompt('Enter a new password (at least 6 characters):')
    if (!pw) return
    if (pw.length < 6) { alert('Password must be at least 6 characters.'); return }
    const { error } = await supabase.auth.updateUser({ password: pw })
    alert(error ? `Could not change password: ${error.message}` : 'Your password has been updated.')
  }

  const renderNavLink = (to, label, badge = 0) => (
    <NavLink
      key={to}
      to={to}
      onClick={closeMobile}
      className={({ isActive }) =>
        `flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
        }`
      }
    >
      <span className="truncate">{label}</span>
      {badge > 0 && (
        <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full bg-red-500 text-white">
          {badge}
        </span>
      )}
    </NavLink>
  )

  // Shared nav body + footer, used by both the desktop sidebar and the mobile drawer.
  const renderNavBody = () => (
    <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
      {/* Family Section — for the executor, the family name opens the dashboard,
          which is now the single hub for All Tasks, Finances, Mail, Executor
          Tools, etc. (those child links were folded into the dashboard's "Go to"
          cards). Non-executor roles keep direct links to the family areas they
          can use, since they don't have the executor dashboard. */}
      {(() => {
        const showDash = canAccess('/all-estates', role) // executor only
        const childLinks = showDash ? [] : [
          { to: '/all-tasks', label: 'All Tasks' },
          { to: '/mail', label: 'Mail Intake' },
        ].filter(({ to }) => canAccess(to, role))
        if (!showDash && childLinks.length === 0) return null
        // One combined badge so the executor's nav still signals "something needs you."
        const famBadge = (counts.mail ?? 0) + familySubmitted + (isFullAccess(role) ? (counts.ai ?? 0) : 0)
        return (
          <>
            <div className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 mt-2">Family</div>
            {showDash
              ? renderNavLink('/all-estates', familyName || 'Family Dashboard', famBadge)
              : childLinks.map(({ to, label }) => renderNavLink(to, label, to === '/mail' ? counts.mail : to === '/all-tasks' ? familySubmitted : 0))}
          </>
        )
      })()}

      {/* Family switcher — only appears when the user has more than one family */}
      {families.length > 1 && (
        <div className="px-3 mt-4">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Family</label>
          <select
            value={currentFamilyKey ?? ''}
            onChange={e => switchFamily(e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
          >
            {families.map(f => <option key={f.key} value={f.key}>{f.name}</option>)}
          </select>
        </div>
      )}

      {/* Estates Section — only the current family's estates */}
      <div className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 mt-4">Estates</div>
      <div className="space-y-1">
        {estates.length === 0 ? (
          <button
            onClick={() => { closeMobile(); navigate('/quick-estate') }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            + Create New Estate
          </button>
        ) : (
          familyMembers.map(estate => {
            const isExpanded = expandedEstate === estate.id
            return (
              <div key={estate.id}>
                <button
                  onClick={() => {
                    setExpandedEstate(isExpanded ? null : estate.id)
                    switchEstate(estate)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                    currentEstate?.id === estate.id
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <span>{estate.deceased_name}</span>
                  <span className="text-xs">{isExpanded ? '▼' : '▶'}</span>
                </button>

                {isExpanded && (
                  <div className="ml-2 mt-1 space-y-0.5 border-l border-gray-200 dark:border-gray-800 pl-2">
                    {SHARED_NAV
                      .filter(({ to }) => canAccess(to, currentEstate?.id === estate.id ? role : estate._role))
                      .map(({ to, label }) => renderNavLink(to, label,
                        to === '/tasks' ? (counts.submittedByEstate[estate.id] ?? 0) : 0))}
                  </div>
                )}
              </div>
            )
          })
        )}
        {/* Account-level: start a brand-new, unrelated family estate */}
        {estates.length > 0 && isFullAccess(role) && (
          <button
            onClick={() => { closeMobile(); navigate('/quick-estate', { state: { newFamily: true } }) }}
            className="w-full text-left px-3 py-2 mt-1 rounded-lg text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            + New family estate
          </button>
        )}
      </div>
    </nav>
  )

  const renderNavFooter = () => (
    <div className="p-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
      <div className="text-xs text-gray-400 dark:text-gray-500 truncate mb-2">{user?.email}</div>
      <button
        onClick={changePassword}
        className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        🔑 Change password
      </button>
      <button
        onClick={() => setIsDark(!isDark)}
        className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        {isDark ? '☀️ Light mode' : '🌙 Dark mode'}
      </button>
      <button
        onClick={signOut}
        className="w-full text-left px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        Sign out
      </button>
    </div>
  )

  return (
    <div className="flex flex-col-reverse md:flex-row min-h-screen bg-white dark:bg-gray-950 dark:text-white">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-800">
          <img src="/logo.png" alt="SettleWell" className="h-9 mb-2" onError={e => { e.currentTarget.style.display = 'none' }} />
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">SettleWell</div>
        </div>

        {renderNavBody()}
        {renderNavFooter()}
      </aside>

      {/* Mobile slide-out menu (full nav incl. Multi-Estate / Mail) */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex">
          <div className="absolute inset-0 bg-black/40" onClick={closeMobile} />
          <aside className="relative w-64 max-w-[82%] h-full bg-white dark:bg-gray-900 flex flex-col shadow-xl">
            <div className="px-4 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">SettleWell</span>
              <button onClick={closeMobile} aria-label="Close menu" className="text-xl text-gray-500 leading-none">✕</button>
            </div>
            {renderNavBody()}
            {renderNavFooter()}
          </aside>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around safe-area-inset-bottom">
        {MOBILE_NAV.filter(({ to }) => canAccess(to, role)).map(({ to, label }) => {
          const dot = to === '/tasks' && (counts.submittedByEstate[currentEstate?.id] ?? 0) > 0
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center min-h-[56px] text-xs font-medium transition-colors ${
                  isActive
                    ? 'text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800'
                    : 'text-gray-500 dark:text-gray-400'
                }`
              }
            >
              <div className="text-xl mb-0.5 relative">
                {label}
                {dot && <span className="absolute -top-1 -right-2 h-2 w-2 bg-red-500 rounded-full" />}
              </div>
            </NavLink>
          )
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto md:pb-0 pb-16 flex flex-col">
        {/* Mobile top bar with menu button */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-40">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu" className="text-2xl leading-none text-gray-700 dark:text-gray-300">☰</button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">SettleWell</span>
        </div>
        {currentEstate && familyMembers.length > 1 && (
          <div className="bg-blue-600 text-white px-4 py-2 text-sm font-medium md:sticky md:top-0 z-30 flex items-center gap-2">
            <span className="shrink-0">📋 Managing:</span>
            <select
              value={currentEstate.id}
              onChange={e => {
                const next = familyMembers.find(es => es.id === e.target.value)
                if (next) switchEstate(next)
              }}
              className="bg-blue-700 text-white rounded px-2 py-1 text-sm border border-blue-400 focus:outline-none max-w-[60%]"
            >
              {familyMembers.map(es => (
                <option key={es.id} value={es.id} className="text-gray-900">{es.deceased_name}</option>
              ))}
            </select>
          </div>
        )}
        {/* Archived estate — read-only notice */}
        {currentEstate?.archived && (
          <div className="bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-4 py-1.5 text-xs font-medium">
            🗄️ This estate is <strong>archived</strong> (read-only). Reactivate it in Estate Settings to make changes.
          </div>
        )}
        {/* Executor-tool banner — makes it unmistakable which estate you're editing */}
        {currentEstate && !currentEstate.archived && isFullAccess(role) && EXECUTOR_NAV.some(n => pathname === n.to || pathname.startsWith(n.to + '/')) && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-4 py-1.5 text-xs font-medium">
            ⚙️ Executor tool — working in the <strong>{currentEstate.deceased_name}</strong> estate
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {blocked ? (
            <div className="p-8 text-gray-400">You don't have access to this page.</div>
          ) : (
            <Outlet />
          )}
        </div>
      </main>
      <DisclaimerGate />
    </div>
  )
}
