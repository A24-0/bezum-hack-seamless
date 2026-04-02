import { Outlet, Link, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Layers, MessageCircle, Shield, UserRound } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import { useUIStore } from '../../stores/uiStore'
import { UserAvatar } from '../common/UserAvatar'
import { ThemeToggleButton } from '../common/ThemeToggleButton'
import ChatBotDock from '../common/ChatBotDock'
import { VoiceControl } from '../common/VoiceControl'
import { ROLE_LABELS } from '../../lib/utils'

export default function AppLayout() {
  const { user, logout } = useAuthStore()
  const { unreadCount } = useNotificationStore()
  const setChatDockOpen = useUIStore((s) => s.setChatDockOpen)
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900">
      {/* Top navbar */}
      <header className="h-14 bg-white border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700 flex items-center px-4 gap-4 sticky top-0 z-40">
        <Link to="/projects" className="flex items-center gap-2 text-indigo-400 font-bold text-lg mr-4">
          <Layers className="w-5 h-5" />
          Seamless
        </Link>

        <div className="flex-1" />

        <button
          type="button"
          className="btn-ghost p-2 rounded-md flex items-center gap-1.5 text-sm font-medium text-indigo-600 dark:text-indigo-300 shrink-0"
          title="Чат-помощник (кнопка также справа внизу)"
          aria-label="Открыть чат-помощник"
          onClick={() => setChatDockOpen(true)}
        >
          <MessageCircle className="w-5 h-5" strokeWidth={1.75} />
          <span className="hidden sm:inline">Чат</span>
        </button>

        <ThemeToggleButton />

        {user?.role === 'admin' && (
          <Link to="/admin" className="btn-ghost p-2 rounded-md flex items-center gap-1 text-sm" title="Админ-панель">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Админ</span>
          </Link>
        )}

        <Link to="/cabinet" className="btn-ghost p-2 rounded-md flex items-center gap-1 text-sm" title="Личный кабинет">
          <UserRound className="w-4 h-4" />
          <span className="hidden sm:inline">Кабинет</span>
        </Link>

        <Link to="/notifications" className="relative btn-ghost p-2 rounded-md">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-600">
          <UserAvatar user={user ?? { name: 'Пользователь' }} size="sm" />
          <div className="hidden sm:block">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{user?.name}</div>
            <div className="text-xs text-slate-400">
              {user?.role ? ROLE_LABELS[user.role] ?? user.role : ''}
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost p-2 rounded-md ml-1" title="Выйти">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <VoiceControl />
      <ChatBotDock />
    </div>
  )
}
