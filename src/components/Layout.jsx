import { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { useDarkMode } from '../lib/DarkModeContext'
import { canAccess, isFullAccess } from '../lib/roles'

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
  { to: '/tasks',       label: 'Tasks' },
  { to: '/notes',       label: 'Daily Notes' },
  { to: '/activity',    label: 'Activity Log' },
  { to: '/documents',   label: 'Documents' },
  { to: '/contacts',    label: 'Contacts' },
]

// Executor-only tools — shown in a dedicated top section; they act on the
// currently-selected estate.
const EXECUTOR_NAV = [
  { to: '/assistant',        label: 'AI Assistant' },
  { to: '/finances',         label: 'Finances' },
  { to: '/credentials',      label: 'Credentials' },
  { to: '/documents/upload', label: 'Upload Files' },
  { to: '/intake-review',    label: 'Intake Review' },
  { to: '/send-to-attorney', label: 'Send to Attorney' },
  { to: '/send-documents',   label: 'Send Documents' },
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
  const [executorOpen, setExecutorOpen] = useState(false)
  const closeMobile = () => setMobileNavOpen(false)

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const renderNavLink = (to, label) => (
    <NavLink
      key={to}
      to={to}
      onClick={closeMobile}
      className={({ isActive }) =>
        `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
        }`
      }
    >
      {label}
    </NavLink>
  )

  // Shared nav body + footer, used by both the desktop sidebar and the mobile drawer.
  const renderNavBody = () => (
    <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
      {/* Multi-Estate Section */}
      <div className="px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 mt-2">Multi-Estate</div>
      {renderNavLink('/all-estates', 'All Estates')}
      {renderNavLink('/all-tasks', 'All Tasks')}
      {renderNavLink('/mail', 'Mail Intake')}
      {renderNavLink('/admin', 'Users & Roles')}
      {renderNavLink('/multi-settings', 'Settings')}

      {/* Executor tools — collapsible; act on the currently-selected estate */}
      {isFullAccess(role) && currentEstate && (() => {
        const onExecPage = EXECUTOR_NAV.some(n => pathname === n.to || pathname.startsWith(n.to + '/'))
        const showExec = executorOpen || onExecPage
        return (
          <>
            <button
              onClick={() => setExecutorOpen(o => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 mt-4"
            >
              <span>Executor · <span className="font-normal text-gray-500 dark:text-gray-400">{currentEstate.deceased_name}</span></span>
              <span className="text-gray-400">{showExec ? '▼' : '▶'}</span>
            </button>
            {showExec && (
              <div className="ml-2 space-y-0.5 border-l border-gray-200 dark:border-gray-800 pl-2">
                {EXECUTOR_NAV
                  .filter(({ to }) => canAccess(to, role))
                  .map(({ to, label }) => renderNavLink(to, label))}
              </div>
            )}
          </>
        )
      })()}

      {/* Estates Section */}
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
          estates.map(estate => {
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
                      .map(({ to, label }) => renderNavLink(to, label))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </nav>
  )

  const renderNavFooter = () => (
    <div className="p-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
      <div className="text-xs text-gray-400 dark:text-gray-500 truncate mb-2">{user?.email}</div>
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
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Estate Admin</div>
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
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Estate Admin</span>
              <button onClick={closeMobile} aria-label="Close menu" className="text-xl text-gray-500 leading-none">✕</button>
            </div>
            {renderNavBody()}
            {renderNavFooter()}
          </aside>
        </div>
      )}

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around safe-area-inset-bottom">
        {MOBILE_NAV.filter(({ to }) => canAccess(to, role)).map(({ to, label }) => (
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
            <div className="text-xl mb-0.5">{label}</div>
          </NavLink>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto md:pb-0 pb-16 flex flex-col">
        {/* Mobile top bar with menu button */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-40">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Open menu" className="text-2xl leading-none text-gray-700 dark:text-gray-300">☰</button>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Estate Admin</span>
        </div>
        {currentEstate && estates.length > 1 && (
          <div className="bg-blue-600 text-white px-4 py-2 text-sm font-medium md:sticky md:top-0 z-30 flex items-center gap-2">
            <span className="shrink-0">📋 Managing:</span>
            <select
              value={currentEstate.id}
              onChange={e => {
                const next = estates.find(es => es.id === e.target.value)
                if (next) switchEstate(next)
              }}
              className="bg-blue-700 text-white rounded px-2 py-1 text-sm border border-blue-400 focus:outline-none max-w-[60%]"
            >
              {estates.map(es => (
                <option key={es.id} value={es.id} className="text-gray-900">{es.deceased_name}</option>
              ))}
            </select>
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
    </div>
  )
}
