import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useUser } from './lib/AuthContext'
import { EstateProvider, useEstate } from './lib/EstateContext'
import { DarkModeProvider } from './lib/DarkModeContext'
import { isFullAccess } from './lib/roles'
import Layout from './components/Layout'
import Login from './pages/Login'
import Invite from './pages/Invite'
import NewEstate from './pages/NewEstate'
import AllEstates from './pages/AllEstates'
import AllTasks from './pages/AllTasks'
import FamilyFinances from './pages/FamilyFinances'
import Assets from './pages/Assets'
import AssetDetail from './pages/AssetDetail'
import MultiEstateSettings from './pages/MultiEstateSettings'
import IntakeReview from './pages/IntakeReview'
import QuickEstateSetup from './pages/QuickEstateSetup'
import SendToAttorney from './pages/SendToAttorney'
import Dashboard from './pages/Dashboard'
import HeirDashboard from './pages/HeirDashboard'
import ObserverDashboard from './pages/ObserverDashboard'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Finances from './pages/Finances'
import Transactions from './pages/Transactions'
import Documents from './pages/Documents'
import DocumentUpload from './pages/DocumentUpload'
import Contacts from './pages/Contacts'
import ContactDetail from './pages/ContactDetail'
import DailyNotes from './pages/DailyNotes'
import FamilyMail from './pages/FamilyMail'
import Credentials from './pages/Credentials'
import Settings from './pages/Settings'
import Assistant from './pages/Assistant'
import Activity from './pages/Activity'
import AdminUsers from './pages/AdminUsers'
import ExecutorTools from './pages/ExecutorTools'
import DeathNotifications from './pages/DeathNotifications'
import ConfirmEmail from './pages/ConfirmEmail'

function RequireAuth({ children }) {
  const user = useUser()
  if (user === undefined) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function DashboardRouter() {
  const { role } = useEstate()
  if (isFullAccess(role)) return <Dashboard />
  if (role === 'observer') return <ObserverDashboard />
  return <HeirDashboard />
}

function AppRoutes() {
  const user = useUser()
  if (user === undefined) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: '#fafaf8' }}>
      <div className="text-center">
        <div className="text-xl text-gray-600 mb-3">Estate Admin</div>
        <div className="text-sm text-gray-400">Starting up...</div>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/auth/confirm" element={<ConfirmEmail />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/invite" element={user ? <Navigate to="/dashboard" replace /> : <Invite />} />
      <Route path="/new-estate" element={user ? <NewEstate /> : <Navigate to="/login" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<RequireAuth><EstateProvider><Layout /></EstateProvider></RequireAuth>}>
        <Route path="/quick-estate" element={<QuickEstateSetup />} />
        <Route path="/all-estates" element={<AllEstates />} />
        <Route path="/all-tasks" element={<AllTasks />} />
        <Route path="/family-finances" element={<FamilyFinances />} />
        <Route path="/multi-settings" element={<MultiEstateSettings />} />
        <Route path="/admin" element={<AdminUsers />} />
        <Route path="/executor" element={<ExecutorTools />} />
        <Route path="/death-notices" element={<DeathNotifications />} />
        <Route path="/intake-review" element={<IntakeReview />} />
        <Route path="/send-to-attorney" element={<SendToAttorney />} />
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route path="/assistant" element={<Assistant />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/finances" element={<Finances />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/assets/:id" element={<AssetDetail />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/upload" element={<DocumentUpload />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/notes" element={<DailyNotes />} />
        <Route path="/mail" element={<FamilyMail />} />
        <Route path="/credentials" element={<Credentials />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <DarkModeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </DarkModeProvider>
    </BrowserRouter>
  )
}
