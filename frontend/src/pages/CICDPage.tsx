import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitPullRequest, RefreshCw } from 'lucide-react'
import { cicdApi, tasksApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useUIStore } from '../stores/uiStore'
import type { PullRequest, Release, Task } from '../types'
import { useState } from 'react'

export default function CICDPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const [linkByPrId, setLinkByPrId] = useState<Record<number, string>>({})
  const { data: prs = [], isLoading, isError } = useQuery({
    queryKey: ['prs', projectId],
    queryFn: () => cicdApi.listPRs(projectId!).then((r) => r.data as PullRequest[]),
    enabled: !!projectId,
  })
  const { data: releases = [] } = useQuery({
    queryKey: ['releases', projectId],
    queryFn: () => cicdApi.listReleases(projectId!).then((r) => r.data as Release[]),
    enabled: !!projectId,
  })
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!).then((r) => r.data as Task[]),
    enabled: !!projectId,
  })
  const syncMutation = useMutation({
    mutationFn: () => cicdApi.syncGitlab(projectId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prs', projectId] })
      addToast({ type: 'info', title: 'Запрос на синхронизацию отправлен' })
    },
    onError: () => addToast({ type: 'error', title: 'Синхронизация не удалась' }),
  })
  const linkMutation = useMutation({
    mutationFn: ({ prId, taskId }: { prId: number; taskId: string }) => cicdApi.linkPRToTask(projectId!, String(prId), taskId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prs', projectId] })
      addToast({ type: 'success', title: 'Запрос на слияние привязан к задаче' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось привязать запрос к задаче' }),
  })

  if (!projectId) return null

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">CI/CD — запросы на слияние</h1>
        <button className="btn-secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? 'Синхронизация…' : 'Синхронизировать'}
        </button>
      </div>
      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить запросы на слияние.</div>
      ) : prs.length === 0 ? (
        <p className="text-slate-400">Пока нет синхронизированных запросов на слияние.</p>
      ) : (
        <ul className="space-y-2 mb-6">
          {prs.map((pr: any) => (
            <li key={pr.id} className="card p-4 space-y-2">
              <div className="flex items-center gap-3">
              <GitPullRequest className="w-5 h-5 text-indigo-400 shrink-0" />
              <a href={pr.url} target="_blank" rel="noreferrer" className="text-slate-900 dark:text-white font-medium flex-1 hover:text-indigo-300">
                {pr.title}
              </a>
              <StatusBadge status={pr.status} size="sm" />
              </div>
              <div className="text-xs text-slate-500">
                {pr.source_branch} {'->'} {pr.target_branch}
                {pr.task_id ? ` | привязана задача #${pr.task_id}` : ' | задача не привязана'}
              </div>
              <div className="flex gap-2">
                <select
                  className="bg-slate-800 border border-slate-600 rounded text-xs px-2 py-1 text-slate-200 min-w-48"
                  value={linkByPrId[Number(pr.id)] ?? ''}
                  onChange={(e) => setLinkByPrId((prev) => ({ ...prev, [Number(pr.id)]: e.target.value }))}
                >
                  <option value="">Выберите задачу для привязки</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      #{t.id} {t.title}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-secondary text-xs"
                  disabled={!linkByPrId[Number(pr.id)]}
                  onClick={() => linkMutation.mutate({ prId: Number(pr.id), taskId: linkByPrId[Number(pr.id)] })}
                >
                  Привязать
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Релизы</h2>
        {releases.length === 0 ? (
          <p className="text-slate-400 text-sm">Пока нет релизов.</p>
        ) : (
          <ul className="space-y-2">
            {releases.map((r: any) => (
              <li key={r.id} className="card p-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-slate-900 dark:text-white">{r.name || r.version_tag}</div>
                  <div className="text-xs text-slate-400">{r.description || 'Нет описания релиза'}</div>
                </div>
                <div className="text-xs text-slate-500">{r.version_tag}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
