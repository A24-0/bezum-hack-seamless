import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { GitPullRequest, FileText, Video, Target, Link2 } from 'lucide-react'
import { cicdApi, documentsApi, epochsApi, meetingsApi, tasksApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import type { Document, Epoch, Meeting, PullRequest, Task } from '../types'
import { STATUS_LABELS } from '../lib/utils'

export default function ProjectRelationsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!).then((r) => r.data as Task[]),
    enabled: !!projectId,
  })
  const { data: docs = [] } = useQuery({
    queryKey: ['docs', projectId],
    queryFn: () => documentsApi.list(projectId!).then((r) => r.data as Document[]),
    enabled: !!projectId,
  })
  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings', projectId],
    queryFn: () => meetingsApi.list(projectId!).then((r) => r.data as Meeting[]),
    enabled: !!projectId,
  })
  const { data: prs = [] } = useQuery({
    queryKey: ['prs', projectId],
    queryFn: () => cicdApi.listPRs(projectId!).then((r) => r.data as PullRequest[]),
    enabled: !!projectId,
  })
  const { data: epochs = [] } = useQuery({
    queryKey: ['epochs', projectId],
    queryFn: () => epochsApi.list(projectId!).then((r) => r.data as Epoch[]),
    enabled: !!projectId,
  })

  if (!projectId) return null

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Link2 className="w-6 h-6 text-indigo-400" />
          Карта интеграций
        </h1>
        <p className="text-slate-400 text-sm mt-1">Сквозной вид: спринты, задачи, документы, встречи и PR</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3"><div className="text-xs text-slate-400">Спринты</div><div className="text-xl text-slate-900 dark:text-white font-semibold">{epochs.length}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-400">Задачи</div><div className="text-xl text-slate-900 dark:text-white font-semibold">{tasks.length}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-400">Документы</div><div className="text-xl text-slate-900 dark:text-white font-semibold">{docs.length}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-400">Встречи</div><div className="text-xl text-slate-900 dark:text-white font-semibold">{meetings.length}</div></div>
        <div className="card p-3"><div className="text-xs text-slate-400">Запросы на слияние</div><div className="text-xl text-slate-900 dark:text-white font-semibold">{prs.length}</div></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-indigo-400" />Задачи с CI/CD и встречами</h2>
          <ul className="space-y-2">
            {tasks.slice(0, 12).map((t) => {
              const taskPrs = prs.filter((pr) => Number(pr.task_id) === Number(t.id))
              const taskMeetings = meetings.filter((m) => Number(m.task_id) === Number(t.id))
              return (
                <li key={t.id} className="border border-slate-700 rounded p-2">
                  <div className="flex items-center gap-2">
                    <Link to={`/projects/${projectId}/kanban`} className="text-sm text-slate-900 dark:text-white hover:text-indigo-300">#{t.id} {t.title}</Link>
                    <StatusBadge status={t.status} size="sm" />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Запросы: {taskPrs.length} | Встречи: {taskMeetings.length}
                  </div>
                </li>
              )
            })}
            {tasks.length === 0 && <li className="text-sm text-slate-500">Пока нет задач</li>}
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-400" />Документы и связанный контекст</h2>
          <ul className="space-y-2">
            {docs.slice(0, 12).map((d) => {
              const meetingRefs = meetings.filter((m) => (m.summary || '').toLowerCase().includes(d.title.toLowerCase().slice(0, 12).toLowerCase()))
              return (
                <li key={d.id} className="border border-slate-700 rounded p-2">
                  <div className="flex items-center gap-2">
                    <Link to={`/projects/${projectId}/documents/${d.id}`} className="text-sm text-slate-900 dark:text-white hover:text-indigo-300">{d.title}</Link>
                    <StatusBadge status={d.status} size="sm" />
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Версия: {d.current_version} | Связанные встречи (эвристика): {meetingRefs.length}
                  </div>
                </li>
              )
            })}
            {docs.length === 0 && <li className="text-sm text-slate-500">Пока нет документов</li>}
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><Video className="w-4 h-4 text-indigo-400" />Итоги встреч</h2>
          <ul className="space-y-2">
            {meetings.slice(0, 8).map((m) => (
              <li key={m.id} className="border border-slate-700 rounded p-2">
                <Link to={`/projects/${projectId}/meetings/${m.id}`} className="text-sm text-slate-900 dark:text-white hover:text-indigo-300">{m.title}</Link>
                <div className="text-xs text-slate-400 mt-1">
                  Статус: {STATUS_LABELS[m.status] ?? m.status} | Задача: {m.task_id ? `#${m.task_id}` : 'нет'} | Саммари: {m.summary ? 'да' : 'нет'}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2"><GitPullRequest className="w-4 h-4 text-indigo-400" />Поток PR</h2>
          <ul className="space-y-2">
            {prs.slice(0, 10).map((pr) => (
              <li key={pr.id} className="border border-slate-700 rounded p-2">
                <a href={pr.url} target="_blank" rel="noreferrer" className="text-sm text-slate-900 dark:text-white hover:text-indigo-300">{pr.title}</a>
                <div className="text-xs text-slate-400 mt-1">
                  {pr.source_branch} {'->'} {pr.target_branch} | Задача: {pr.task_id ? `#${pr.task_id}` : 'не привязана'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
