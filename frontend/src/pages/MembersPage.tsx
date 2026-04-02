import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../api'
import { UserAvatar } from '../components/common/UserAvatar'
import type { ProjectMember } from '../types'
import { ChevronRight, FileText, Users } from 'lucide-react'
import { ROLE_LABELS } from '../lib/utils'

export default function MembersPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: members = [], isLoading, isError } = useQuery({
    queryKey: ['members', projectId],
    queryFn: () => projectsApi.members(projectId!).then((r) => r.data),
    enabled: !!projectId,
  })

  if (!projectId) return null

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Участники</h1>
      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить участников.</div>
      ) : members.length === 0 ? (
        <div className="card p-6 text-center text-slate-400">
          <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
          В этом проекте пока нет участников.
        </div>
      ) : (
        <ul className="space-y-2">
          {(members as ProjectMember[]).map((m) => (
            <li key={`${m.project_id}-${m.user_id}`}>
              <Link
                to={`/cabinet/users/${m.user.id}`}
                className="card p-4 flex items-center gap-3 hover:border-indigo-500/40 transition-colors group"
              >
                <UserAvatar user={m.user} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-slate-900 dark:text-white font-medium">{m.user.name}</div>
                  <div className="text-xs text-slate-500">{ROLE_LABELS[m.role] ?? m.role}</div>
                  <div className="text-xs text-indigo-400/90 mt-1.5 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    Описание в кабинете (стек, Git)
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-indigo-400 shrink-0 transition-colors" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
