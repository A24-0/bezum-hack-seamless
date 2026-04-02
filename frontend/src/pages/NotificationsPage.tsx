import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { notificationsApi } from '../api'
import { formatRelativeTime } from '../lib/utils'
import type { Notification } from '../types'

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list().then((r) => r.data as Notification[]),
  })

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Bell className="w-6 h-6 text-indigo-400" />
          Уведомления
        </h1>
        {items.some((n) => !n.is_read) && (
          <button type="button" className="btn-secondary text-sm" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            Прочитать все
          </button>
        )}
      </div>
      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400">Нет уведомлений.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.id}
              className={`card p-4 ${!n.is_read ? 'border-indigo-500/40 bg-slate-800/80' : ''}`}
            >
              <div className="flex justify-between gap-2">
                <div>
                  <div className="text-slate-900 dark:text-white font-medium">{n.title ?? 'Уведомление'}</div>
                  {n.body && <div className="text-sm text-slate-400 mt-1">{n.body}</div>}
                  <div className="text-xs text-slate-500 mt-2">{formatRelativeTime(n.created_at)}</div>
                </div>
                {!n.is_read && (
                  <button
                    type="button"
                    className="text-xs text-indigo-400 shrink-0"
                    onClick={() => markRead.mutate(n.id)}
                  >
                    Прочитано
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
