import { Outlet, Link, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Moon, Sun, Layers } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useUIStore } from '../../stores/uiStore'
import { UserAvatar } from '../common/UserAvatar'

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const { darkMode, toggleDarkMode } = useUIStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      {/* Top navbar */}
      <header className="h-14 bg-slate-800 border-b border-slate-700 flex items-center px-4 gap-4 sticky top-0 z-40">
        <Link to="/projects" className="flex items-center gap-2 text-indigo-400 font-bold text-lg mr-4">
          <Layers className="w-5 h-5" />
          Seamless
        </Link>

        <div className="flex-1" />

        <button onClick={toggleDarkMode} className="btn-ghost p-2 rounded-md">
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <Link to="/notifications" className="relative btn-ghost p-2 rounded-md">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-600">
          <UserAvatar user={user} size="sm" />
          <div className="hidden sm:block">
            <div className="text-sm font-medium text-slate-200">{user?.name}</div>
            <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
          </div>
          <button onClick={handleLogout} className="btn-ghost p-2 rounded-md ml-1" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
