import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'

const NAV = [
  { to: '/dashboard',   label: 'Dashboard' },
  { to: '/tasks',       label: 'Tasks' },
  { to: '/finances',    label: 'Finances' },
  { to: '/documents',   label: 'Documents' },
  { to: '/documents/upload', label: 'Upload Files' },
  { to: '/credentials', label: 'Credentials' },
  { to: '/contacts',    label: 'Contacts' },
  { to: '/heir',        label: 'Heir View' },
  { to: '/settings',    label: 'Settings' },
]

export default function Layout() {
  const navigate = useNavigate()
  const { currentEstate, role } = useEstate()
  const user = useUser()

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ background: '#fafaf8' }}>
      {/* Sidebar */}
      <aside className="w-52 shrink-0 flex flex-col border-r border-gray-200 bg-white">
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Estate Admin</div>
          {currentEstate && (
            <div className="text-sm font-semibold text-gray-800 leading-tight">{currentEstate.deceased_name}</div>
          )}
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <div className="text-xs text-gray-400 truncate mb-2">{user?.email}</div>
          <button
            onClick={signOut}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:text-gray-800 rounded hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
