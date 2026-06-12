import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useUser } from './lib/AuthContext'
import { EstateProvider } from './lib/EstateContext'
import { DarkModeProvider } from './lib/DarkModeContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Invite from './pages/Invite'
import NewEstate from './pages/NewEstate'
import AllEstates from './pages/AllEstates'
import AllTasks from './pages/AllTasks'
import IntakeReview from './pages/IntakeReview'
import EstateChecklist from './pages/EstateChecklist'
import QuickEstateSetup from './pages/QuickEstateSetup'
import SendToAttorney from './pages/SendToAttorney'
import SendDocumentsToAttorney from './pages/SendDocumentsToAttorney'
import Dashboard from './pages/Dashboard'
import HeirDashboard from './pages/HeirDashboard'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Finances from './pages/Finances'
import Transactions from './pages/Transactions'
import Documents from './pages/Documents'
import DocumentUpload from './pages/DocumentUpload'
import Contacts from './pages/Contacts'
import ContactDetail from './pages/ContactDetail'
import DailyNotes from './pages/DailyNotes'
import MailIntake from './pages/MailIntake'
import Credentials from './pages/Credentials'
import Settings from './pages/Settings'

function RequireAuth({ children }) {
  const user = useUser()
  if (user === undefined) return <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function DashboardRouter() {
  const { role } = useEstate()
  if (role === 'executor' || role === 'administrator') {
    return <Dashboard />
  }
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
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/invite" element={user ? <Navigate to="/dashboard" replace /> : <Invite />} />
      <Route path="/new-estate" element={user ? <NewEstate /> : <Navigate to="/login" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<RequireAuth><EstateProvider><Layout /></EstateProvider></RequireAuth>}>
        <Route path="/quick-estate" element={<QuickEstateSetup />} />
        <Route path="/all-estates" element={<AllEstates />} />
        <Route path="/all-tasks" element={<AllTasks />} />
        <Route path="/intake-review" element={<IntakeReview />} />
        <Route path="/checklist" element={<EstateChecklist />} />
        <Route path="/send-to-attorney" element={<SendToAttorney />} />
        <Route path="/send-documents" element={<SendDocumentsToAttorney />} />
        <Route path="/dashboard" element={<DashboardRouter />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/finances" element={<Finances />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/upload" element={<DocumentUpload />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<ContactDetail />} />
        <Route path="/notes" element={<DailyNotes />} />
        <Route path="/mail" element={<MailIntake />} />
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
