import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { useDarkMode } from '../lib/DarkModeContext'

const MOBILE_NAV = [
  { to: '/dashboard',   label: '📊', icon: 'Dashboard' },
  { to: '/tasks',       label: '✓', icon: 'Tasks' },
  { to: '/finances',    label: '💰', icon: 'Finances' },
  { to: '/notes',       label: '📝', icon: 'Notes' },
  { to: '/documents',   label: '📄', icon: 'Docs' },
  { to: '/contacts',    label: '👥', icon: 'Contacts' },
]

const DESKTOP_NAV = [
  { to: '/all-estates',  label: 'All Estates', multiOnly: true },
  { to: '/all-tasks',    label: 'All Tasks', multiOnly: true },
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/mail',        label: 'Mail Intake' },
  { to: '/intake-review', label: 'Intake Review' },
  { to: '/checklist',    label: 'Estate Checklist' },
  { to: '/send-to-attorney', label: 'Send to Attorney' },
  { to: '/send-documents', label: 'Send Documents' },
  { to: '/tasks',       label: 'Tasks' },
  { to: '/finances',    label: 'Finances' },
  { to: '/notes',       label: 'Daily Notes' },
  { to: '/documents',   label: 'Documents' },
  { to: '/documents/upload', label: 'Upload Files' },
  { to: '/credentials', label: 'Credentials' },
  { to: '/contacts',    label: 'Contacts' },
  { to: '/heir',        label: 'Heir View' },
  { to: '/settings',    label: 'Settings' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { currentEstate, role, estates, switchEstate } = useEstate()
  const user = useUser()
  const { isDark, setIsDark } = useDarkMode()
  const [showEstatePicker, setShowEstatePicker] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex flex-col-reverse md:flex-row min-h-screen bg-white dark:bg-gray-950 dark:text-white">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-52 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="px-4 py-5 border-b border-gray-100 dark:border-gray-800">
          <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Estate Admin</div>
          {currentEstate && (
            <div className="relative">
              <button
                onClick={() => setShowEstatePicker(!showEstatePicker)}
                className="w-full text-left text-sm font-semibold text-gray-800 dark:text-white leading-tight hover:text-gray-600 dark:hover:text-gray-300 py-1"
              >
                {currentEstate.deceased_name} ▼
              </button>
              {showEstatePicker && estates.length > 1 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-10">
                  {estates.map(estate => (
                    <button
                      key={estate.id}
                      onClick={() => {
                        switchEstate(estate)
                        setShowEstatePicker(false)
                      }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        currentEstate?.id === estate.id
                          ? 'bg-gray-900 dark:bg-gray-700 text-white'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      {estate.deceased_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {DESKTOP_NAV.map(({ to, label, multiOnly }) => {
            if (multiOnly && estates.length <= 1) return null
            return (
              <NavLink
                key={to}
                to={to}
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
          })}
        </nav>

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
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around safe-area-inset-bottom">
        {MOBILE_NAV.map(({ to, label }) => (
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
        {currentEstate && estates.length > 1 && (
          <div className="bg-blue-600 text-white px-4 py-2 text-sm font-medium sticky top-0 z-50">
            📋 Currently managing: <strong>{currentEstate.deceased_name}</strong> — Use sidebar to switch
          </div>
        )}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
