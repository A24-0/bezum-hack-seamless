import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KanbanBoard } from '../components/kanban/KanbanBoard'
import { tasksApi, projectsApi, epochsApi, documentsApi, meetingsApi } from '../api'
import { useAuthStore } from '../stores/authStore'
import { useUIStore } from '../stores/uiStore'
import { invalidateProjectScopedData } from '../lib/invalidateProjectQueries'
import type { Task, TaskStatus, Document, Meeting, Epoch, ProjectMember } from '../types'
import type { User } from '../types'
import { canEditProjectTasks, projectMemberRole } from '../lib/projectPermissions'
import { ProgressRing } from '../components/common/ProgressRing'
import { StatusBadge } from '../components/common/StatusBadge'
import { ArrowLeft, ChevronLeft, ChevronRight, Target, FileText, Users } from 'lucide-react'

const COLUMNS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'needs_info', 'review', 'done']

function StatusDistribution({ tasks }: { tasks: Task[] }) {
  const counts = useMemo(() => {
    const out: Record<TaskStatus, number> = {
      backlog: 0,
      todo: 0,
      in_progress: 0,
      needs_info: 0,
      review: 0,
      done: 0,
    }
    for (const t of tasks) {
      const st = COLUMNS.includes(t.status as TaskStatus) ? (t.status as TaskStatus) : 'backlog'
      out[st] = (out[st] || 0) + 1
    }
    return out
  }, [tasks])

  const total = Math.max(1, tasks.length)

  return (
    <div className="card p-4">
      <div className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Статусы задач</div>
      <div className="h-3 rounded bg-slate-800/50 flex overflow-hidden border border-slate-700">
        {COLUMNS.map((s) => {
          const pct = (counts[s] / total) * 100
          if (pct <= 0.01) return null
          return (
            <div
              key={s}
              className="h-full"
              style={{
                width: `${pct}%`,
                background:
                  s === 'done'
                    ? 'rgba(34,197,94,.45)'
                    : s === 'in_progress'
                      ? 'rgba(234,179,8,.45)'
                      : s === 'review'
                        ? 'rgba(245,158,11,.45)'
                        : s === 'needs_info'
                          ? 'rgba(249,115,22,.45)'
                          : s === 'todo'
                            ? 'rgba(59,130,246,.45)'
                            : 'rgba(148,163,184,.45)',
              }}
              title={`${s}: ${counts[s]}`}
            />
          )
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {COLUMNS.map((s) => (
          <div key={s} className="text-xs text-slate-500 flex items-center justify-between">
            <span>{s}</span>
            <span className="text-slate-300 tabular-nums">{counts[s]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EpochPassPage() {
  const { projectId, epochId } = useParams<{ projectId: string; epochId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const { user } = useAuthStore()

  const epochIdNum = Number(epochId)

  const { data: epochs = [] } = useQuery({
    queryKey: ['epochs', projectId],
    queryFn: () => epochsApi.list(projectId!).then((r) => r.data),
    enabled: !!projectId,
  })

  const currentEpochIndex = useMemo(() => {
    return epochs.findIndex((e: any) => Number(e.id) === epochIdNum)
  }, [epochs, epochIdNum])

  const prevEpoch = epochs[currentEpochIndex - 1]
  const nextEpoch = epochs[currentEpochIndex + 1]

  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => projectsApi.members(projectId!).then((r) => r.data),
    enabled: !!projectId,
  })

  const canEdit = canEditProjectTasks(user as User | null, members as ProjectMember[] | undefined)

  const { data: tasks = [] as Task[], isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', projectId, 'epoch', epochIdNum],
    queryFn: () => tasksApi.list(projectId!, { epoch_id: String(epochIdNum) }).then((r) => r.data as Task[]),
    enabled: !!projectId && Number.isFinite(epochIdNum),
  })

  const doneCount = tasks.filter((t) => t.status === 'done').length
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0

  const { data: docs = [] } = useQuery({
    queryKey: ['docs', projectId, 'epoch', epochIdNum],
    queryFn: () => documentsApi.list(projectId!, { epoch_id: String(epochIdNum) }).then((r) => r.data as Document[]),
    enabled: !!projectId && Number.isFinite(epochIdNum),
  })

  const { data: meetings = [] } = useQuery({
    queryKey: ['meetings', projectId, 'epoch', epochIdNum],
    queryFn: () =>
      meetingsApi
        .list(projectId!)
        .then((r) => (r.data as Meeting[]).filter((m) => Number((m as any).epoch_id) === epochIdNum)),
    enabled: !!projectId && Number.isFinite(epochIdNum),
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: TaskStatus }) => {
      await tasksApi.updateStatus(projectId!, String(taskId), status)
    },
    onSuccess: () => invalidateProjectScopedData(qc, projectId),
    onError: () => addToast({ type: 'error', title: 'Не удалось обновить статус' }),
  })

  const reorderMutation = useMutation({
    mutationFn: async ({ orderedTaskIds }: { orderedTaskIds: number[] }) => {
      await Promise.all(orderedTaskIds.map((id, i) => tasksApi.update(projectId!, String(id), { order_index: i })))
    },
    onSuccess: () => invalidateProjectScopedData(qc, projectId),
    onError: () => addToast({ type: 'error', title: 'Не удалось сохранить порядок' }),
  })

  const assignSelfMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await tasksApi.update(projectId!, String(taskId), { assignee_id: user?.id ? Number(user.id) : undefined })
    },
    onSuccess: () => invalidateProjectScopedData(qc, projectId),
    onError: () => addToast({ type: 'error', title: 'Не удалось назначить' }),
  })

  const currentEpoch = epochs[currentEpochIndex] as any
  if (!projectId || !epochIdNum || !Number.isFinite(epochIdNum) || !currentEpoch) return null

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to={`../epochs`} className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            <ArrowLeft className="w-4 h-4" /> К спринтам
          </Link>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">{currentEpoch.name}</h1>
            </div>
            {currentEpoch.goals ? <div className="text-sm text-slate-500 mt-1">{currentEpoch.goals}</div> : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ProgressRing progress={progress} size={68} />
          <div className="text-sm">
            <div className="text-slate-900 dark:text-white font-semibold">{progress}%</div>
            <div className="text-slate-400">{doneCount}/{tasks.length || 0} задач</div>
          </div>

          <div className="flex items-center gap-2">
            {prevEpoch ? (
              <button
                className="btn-secondary text-xs inline-flex items-center gap-2"
                onClick={() => navigate(`../epochs/${prevEpoch.id}/pass`)}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Предыдущая
              </button>
            ) : null}
            {nextEpoch ? (
              <button
                className="btn-primary text-xs inline-flex items-center gap-2"
                onClick={() => navigate(`../epochs/${nextEpoch.id}/pass`)}
              >
                Следующая <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <StatusBadge status={currentEpoch.status} />

      {tasksLoading ? (
        <div className="text-slate-400">Загрузка задач…</div>
      ) : (
        <KanbanBoard
          tasks={tasks}
          canEdit={canEdit}
          currentUserId={user?.id ? String(user.id) : undefined}
          onStatusChange={async (taskId: number, status: TaskStatus) => updateStatusMutation.mutateAsync({ taskId, status })}
          onReorderColumn={async (_status: TaskStatus, orderedTaskIds: number[]) => reorderMutation.mutateAsync({ orderedTaskIds })}
          onAssignSelf={async (taskId: number) => assignSelfMutation.mutateAsync(taskId)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <StatusDistribution tasks={tasks} />
        </div>

        <div className="lg:col-span-1 space-y-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-900">
              <FileText className="w-4 h-4 text-indigo-400" /> Документы спринта
            </div>
            {docs.length === 0 ? (
              <div className="text-xs text-slate-500">Пока нет документов.</div>
            ) : (
              <ul className="space-y-2">
                {docs.slice(0, 8).map((d) => (
                  <li key={d.id}>
                    <Link
                      to={`/projects/${projectId}/documents/${d.id}`}
                      className="text-sm text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      <span className="truncate">{d.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-900">
              <Users className="w-4 h-4 text-purple-400" /> Встречи спринта
            </div>
            {meetings.length === 0 ? (
              <div className="text-xs text-slate-500">Пока нет встреч.</div>
            ) : (
              <ul className="space-y-2">
                {meetings.slice(0, 6).map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/projects/${projectId}/meetings/${m.id}`}
                      className="text-sm text-purple-400 hover:text-purple-300 inline-flex items-center gap-2"
                    >
                      <span className="truncate">{m.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="card p-4">
            <div className="text-sm font-semibold text-slate-900 mb-2">Подсказка</div>
            <div className="text-xs text-slate-500 leading-relaxed">
              Используйте кнопки “Предыдущая/Следующая”, чтобы проходить спринт как “воронку”.
              Для задач, документов и встреч в этом экране — только данные текущей эпохи.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

