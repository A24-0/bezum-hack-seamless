import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useNotifications } from './hooks/useNotifications'
import { ToastContainer } from './components/common/Toast'
import { ThemeSync } from './components/ThemeSync'

import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProjectsListPage from './pages/ProjectsListPage'
import ProjectLayout from './components/layout/ProjectLayout'
import AppLayout from './components/layout/AppLayout'
import ProjectOverviewPage from './pages/ProjectOverviewPage'
import EpochsPage from './pages/EpochsPage'
import EpochPassPage from './pages/EpochPassPage'
import KanbanPage from './pages/KanbanPage'
import DocumentsPage from './pages/DocumentsPage'
import DocumentEditorPage from './pages/DocumentEditorPage'
import MeetingsPage from './pages/MeetingsPage'
import MeetingDetailPage from './pages/MeetingDetailPage'
import CICDPage from './pages/CICDPage'
import MembersPage from './pages/MembersPage'
import NotificationsPage from './pages/NotificationsPage'
import ProjectRelationsPage from './pages/ProjectRelationsPage'
import AdminPage from './pages/AdminPage'
import CabinetPage from './pages/CabinetPage'
import CabinetUserPage from './pages/CabinetUserPage'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function NotificationsListener() {
  useNotifications()
  return null
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  if (user?.role !== 'admin') return <Navigate to="/projects" replace />
  return <>{children}</>
}

export default function App() {
  const { token } = useAuthStore()

  return (
    <BrowserRouter>
      <ThemeSync />
      {token && <NotificationsListener />}
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/"
          element={
            <AuthGuard>
              <AppLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="projects" element={<ProjectsListPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="cabinet" element={<CabinetPage />} />
          <Route path="cabinet/users/:userId" element={<CabinetUserPage />} />
          <Route
            path="admin"
            element={
              <AdminGuard>
                <AdminPage />
              </AdminGuard>
            }
          />

          <Route path="projects/:projectId" element={<ProjectLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<ProjectOverviewPage />} />
            <Route path="epochs" element={<EpochsPage />} />
            <Route path="epochs/:epochId/pass" element={<EpochPassPage />} />
            <Route path="kanban" element={<KanbanPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="documents/:docId" element={<DocumentEditorPage />} />
            <Route path="meetings" element={<MeetingsPage />} />
            <Route path="meetings/:meetingId" element={<MeetingDetailPage />} />
            <Route path="cicd" element={<CICDPage />} />
            <Route path="relations" element={<ProjectRelationsPage />} />
            <Route path="members" element={<MembersPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
