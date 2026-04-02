import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Shield, Users } from 'lucide-react'
import { adminApi } from '../api'
import { useUIStore } from '../stores/uiStore'
import { ROLE_LABELS } from '../lib/utils'

const ROLES = ['admin', 'manager', 'developer', 'customer'] as const

export default function AdminPage() {
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => adminApi.stats().then((r) => r.data),
  })
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => adminApi.users().then((r) => r.data),
  })

  const patchMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: string; is_active?: boolean }) =>
      adminApi.updateUser(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      addToast({ type: 'success', title: 'Сохранено' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось обновить пользователя' }),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-8 h-8 text-indigo-400" />
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Администрирование</h1>
      </div>

      {stats && (
        <div className="card p-4 mb-6 border-indigo-500/20">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Сводки по статусам</h2>
            <div className="text-xs text-slate-500">Задачи / документы / спринты</div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Задачи</div>
              {(() => {
                const by: Record<string, number> = stats.tasks_by_status || {}
                const statuses = ['backlog', 'todo', 'in_progress', 'needs_info', 'review', 'done']
                const total = statuses.reduce((s, x) => s + (by[x] || 0), 0) || 1
                return (
                  <div className="space-y-2">
                    {statuses.map((s) => {
                      const n = by[s] || 0
                      const pct = Math.round((n / total) * 100)
                      return (
                        <div key={s} className="flex items-center gap-3 text-xs">
                          <div className="w-[110px] text-slate-500">{s}</div>
                          <div className="flex-1 h-2 rounded bg-slate-800/60 overflow-hidden border border-slate-700">
                            <div className="h-full bg-indigo-500/60" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-12 text-right text-slate-300 tabular-nums">{n}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Документы</div>
              {(() => {
                const by: Record<string, number> = stats.documents_by_status || {}
                const statuses = ['draft', 'pending_review', 'approved', 'archived']
                const total = statuses.reduce((s, x) => s + (by[x] || 0), 0) || 1
                return (
                  <div className="space-y-2">
                    {statuses
                      .filter((s) => (by[s] || 0) > 0 || s === 'draft')
                      .map((s) => {
                        const n = by[s] || 0
                        const pct = Math.round((n / total) * 100)
                        return (
                          <div key={s} className="flex items-center gap-3 text-xs">
                            <div className="w-[110px] text-slate-500">{s}</div>
                            <div className="flex-1 h-2 rounded bg-slate-800/60 overflow-hidden border border-slate-700">
                              <div className="h-full bg-emerald-500/60" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="w-12 text-right text-slate-300 tabular-nums">{n}</div>
                          </div>
                        )
                      })}
                  </div>
                )
              })()}
            </div>

            <div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Спринты</div>
              {(() => {
                const by: Record<string, number> = stats.epochs_by_status || {}
                const statuses = ['planning', 'active', 'completed']
                const total = statuses.reduce((s, x) => s + (by[x] || 0), 0) || 1
                return (
                  <div className="space-y-2">
                    {statuses.map((s) => {
                      const n = by[s] || 0
                      const pct = Math.round((n / total) * 100)
                      return (
                        <div key={s} className="flex items-center gap-3 text-xs">
                          <div className="w-[110px] text-slate-500">{s}</div>
                          <div className="flex-1 h-2 rounded bg-slate-800/60 overflow-hidden border border-slate-700">
                            <div className="h-full bg-indigo-500/60" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-12 text-right text-slate-300 tabular-nums">{n}</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {statsLoading ? (
          <div className="col-span-full h-20 animate-pulse bg-slate-200 dark:bg-slate-800 rounded-lg" />
        ) : stats ? (
          <>
            {(
              [
                ['Пользователи', stats.users],
                ['Проекты', stats.projects],
                ['Задачи', stats.tasks],
                ['Спринты', stats.epochs],
                ['Документы', stats.documents],
                ['Встречи', stats.meetings],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="card p-4 text-center">
                <div className="text-2xl font-bold text-indigo-400">{n}</div>
                <div className="text-xs text-slate-500 mt-1">{label}</div>
              </div>
            ))}
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Users className="w-5 h-5 text-slate-400" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Пользователи</h2>
      </div>

      {usersLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 dark:bg-slate-800 text-left">
              <tr>
                <th className="p-3 font-medium text-slate-700 dark:text-slate-300">ID</th>
                <th className="p-3 font-medium text-slate-700 dark:text-slate-300">Имя</th>
                <th className="p-3 font-medium text-slate-700 dark:text-slate-300">Email</th>
                <th className="p-3 font-medium text-slate-700 dark:text-slate-300">Роль</th>
                <th className="p-3 font-medium text-slate-700 dark:text-slate-300">Активен</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="p-3 text-slate-500">{u.id}</td>
                  <td className="p-3 text-slate-900 dark:text-slate-100">{u.name}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                  <td className="p-3">
                    <select
                      className="input text-xs py-1 max-w-[140px]"
                      value={u.role}
                      onChange={(e) =>
                        patchMutation.mutate({ id: u.id, role: e.target.value })
                      }
                      disabled={patchMutation.isPending}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r] ?? r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={u.is_active}
                        onChange={(e) =>
                          patchMutation.mutate({ id: u.id, is_active: e.target.checked })
                        }
                        disabled={patchMutation.isPending}
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
