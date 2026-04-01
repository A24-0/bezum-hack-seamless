import {
  Bell,
  GitPullRequest,
  FileText,
  Calendar,
  CheckCircle2,
  MessageSquare,
  AtSign,
} from 'lucide-react'
import { cn, formatRelativeTime } from '../../lib/utils'
import type { Notification } from '../../types'

interface NotificationItemProps {
  notification: Notification
  onClick?: () => void
}

const ICON_MAP: Record<string, React.ReactNode> = {
  task_assigned: <CheckCircle2 className="w-4 h-4 text-blue-400" />,
  task_status_changed: <CheckCircle2 className="w-4 h-4 text-yellow-400" />,
  document_updated: <FileText className="w-4 h-4 text-purple-400" />,
  document_approved: <FileText className="w-4 h-4 text-green-400" />,
  meeting_scheduled: <Calendar className="w-4 h-4 text-indigo-400" />,
  meeting_reminder: <Calendar className="w-4 h-4 text-orange-400" />,
  pr_merged: <GitPullRequest className="w-4 h-4 text-purple-400" />,
  comment_added: <MessageSquare className="w-4 h-4 text-slate-400" />,
  mention: <AtSign className="w-4 h-4 text-indigo-400" />,
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const icon = ICON_MAP[notification.type] ?? <Bell className="w-4 h-4 text-slate-400" />

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors flex items-start gap-3',
        !notification.is_read && 'bg-indigo-500/5'
      )}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', notification.is_read ? 'text-slate-300' : 'text-slate-100 font-medium')}>
          {notification.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-xs text-slate-600 mt-1">{formatRelativeTime(notification.created_at)}</p>
      </div>
      {!notification.is_read && (
        <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
      )}
    </button>
  )
}
