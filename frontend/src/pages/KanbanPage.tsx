import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tasksApi, projectsApi, epochsApi } from '../api'
import { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import type { Project, Task, TaskStatus } from '../types'
import { invalidateProjectScopedData } from '../lib/invalidateProjectQueries'
import { canEditProjectTasks, projectMemberRole } from '../lib/projectPermissions'
import { KanbanBoard } from '../components/kanban/KanbanBoard'
import { ChevronDown, ChevronRight, Code2, Filter, GitPullRequest, LayoutGrid } from 'lucide-react'
import { cn } from '../lib/utils'

type TaskScope = 'all' | 'mine' | 'unassigned'

export default function KanbanPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | undefined>(
    searchParams.get('highlight') ?? undefined
  )

  useEffect(() => {
    const param = searchParams.get('highlight')
    if (!param) return
    const next = new URLSearchParams(searchParams)
    next.delete('highlight')
    setSearchParams(next, { replace: true })
    setHighlightedTaskId(param)
    const timer = setTimeout(() => setHighlightedTaskId(undefined), 3000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const { user } = useAuthStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [filter, setFilter] = useState('')
  const [scope, setScope] = useState<TaskScope>('all')
  const [epochFilter, setEpochFilter] = useState<string>('')
  const [createOpen, setCreateOpen] = useState(false)

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then((r) => r.data as Project),
    enabled: !!projectId,
  })
  const hasGithubRepo = Boolean(project?.gitlab_repo_url && String(project.gitlab_repo_url).trim())

  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => projectsApi.members(projectId!).then((r) => r.data),
    enabled: !!projectId,
  })

  const canEdit = canEditProjectTasks(user, members)
  const isDeveloperInProject = projectMemberRole(user, members) === 'developer'

  const { data: epochs = [] } = useQuery({
    queryKey: ['epochs', projectId],
    queryFn: () => epochsApi.list(projectId!).then((r) => r.data),
    enabled: !!projectId,
  })

  const listParams = useMemo((): Record<string, string> => {
    const p: Record<string, string> = {}
    if (scope === 'mine' && user?.id) p.assignee_id = String(user.id)
    if (epochFilter) p.epoch_id = epochFilter
    return p
  }, [scope, user?.id, epochFilter])

  const { data: tasksRaw = [], isLoading, isError } = useQuery({
    queryKey: ['tasks', projectId, scope, epochFilter, listParams],
    queryFn: () => tasksApi.list(projectId!, listParams).then((r) => r.data as Task[]),
    enabled: !!projectId,
  })

  const tasks = useMemo(() => {
    let list = tasksRaw
    if (scope === 'unassigned') {
      list = list.filter((t) => t.assignee_id == null && !t.assignee)
    }
    return list
  }, [tasksRaw, scope])

  /** Переход со страницы «Связи» по ссылке /kanban#task-… */
  useEffect(() => {
    const id = location.hash.replace(/^#/, '')
    if (!id.startsWith('task-')) return
    const t = window.setTimeout(() => {
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-slate-100', 'dark:ring-offset-slate-900')
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-slate-100', 'dark:ring-offset-slate-900')
      }, 2200)
    }, 120)
    return () => clearTimeout(t)
  }, [location.hash, tasks])

  const myCount = useMemo(() => {
    if (!user?.id) return 0
    if (scope === 'mine') return tasksRaw.length
    return tasksRaw.filter((t) => String(t.assignee_id ?? t.assignee?.id) === String(user.id)).length
  }, [tasksRaw, user?.id, scope])

  const createTask = useMutation({
    mutationFn: () =>
      tasksApi
        .create(projectId!, { title: title.trim(), description: description.trim(), status: 'backlog' })
        .then((r) => r.data),
    onSuccess: () => {
      setTitle('')
      setDescription('')
      invalidateProjectScopedData(qc, projectId)
      addToast({ type: 'success', title: 'Задача создана' })
    },
    onError: () => {
      addToast({ type: 'error', title: 'Не удалось создать задачу' })
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: TaskStatus }) => {
      await tasksApi.updateStatus(projectId!, String(taskId), status)
    },
    onSuccess: () => {
      invalidateProjectScopedData(qc, projectId)
    },
    onError: () => {
      addToast({ type: 'error', title: 'Не удалось обновить статус' })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async ({ orderedTaskIds }: { orderedTaskIds: number[] }) => {
      await Promise.all(
        orderedTaskIds.map((id, i) => tasksApi.update(projectId!, String(id), { order_index: i }))
      )
    },
    onSuccess: () => {
      invalidateProjectScopedData(qc, projectId)
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось сохранить порядок' }),
  })

  const assignSelfMutation = useMutation({
    mutationFn: (taskId: number) =>
      tasksApi.update(projectId!, String(taskId), { assignee_id: user?.id ? Number(user.id) : undefined }),
    onSuccess: () => {
      invalidateProjectScopedData(qc, projectId)
      addToast({ type: 'success', title: 'Вы назначены исполнителем' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось назначить' }),
  })

  if (!projectId) return null
  const normalizedFilter = filter.trim().toLowerCase()
  const visibleTasks = normalizedFilter
    ? tasks.filter((t) => t.title.toLowerCase().includes(normalizedFilter))
    : tasks

  return (
    <div className="p-4 sm:p-6 max-w-[1920px] mx-auto">
      <div className="flex flex-col gap-4 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-6 h-6 text-indigo-400 shrink-0" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Канбан</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Перетаскивайте карточки за ручку · порядок в колонке сохраняется
            </p>
          </div>
          <input
            className="input w-full sm:w-72"
            placeholder="Поиск по названию…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {isDeveloperInProject && (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 flex gap-3 items-start">
            <Code2 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium text-indigo-300">Режим разработчика.</span> Фильтр «Мои задачи» показывает
              только назначенные вам карточки. Без исполнителя — возьмите задачу кнопкой «На меня».
            </div>
          </div>
        )}

        {hasGithubRepo && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3 flex gap-3 items-start">
            <GitPullRequest className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-medium text-emerald-300">GitHub.</span> Для этого проекта сохранён репозиторий. На
              странице{' '}
              <Link to={`/projects/${projectId}/cicd`} className="text-indigo-400 hover:underline">
                CI/CD
              </Link>{' '}
              нажмите «Синхронизировать с GitHub» — откроем PR по веткам репозитория; они появятся в карточках задач
              (по номеру в ветке или вручную в CI/CD).
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" />
            Показать:
          </span>
          {(
            [
              ['all', 'Все', null] as const,
              ['mine', `Мои (${myCount})`, user?.id ? true : false] as const,
              ['unassigned', 'Без исполнителя', true] as const,
            ] as const
          ).map(([key, label, enabled]) => (
            <button
              key={key}
              type="button"
              disabled={enabled === false}
              onClick={() => setScope(key as TaskScope)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                scope === key
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-indigo-500/50',
                enabled === false && 'opacity-40 cursor-not-allowed'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Спринт:</span>
          <select
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded text-xs px-2 py-1.5 text-slate-600 dark:text-slate-300"
            value={epochFilter}
            onChange={(e) => setEpochFilter(e.target.value)}
          >
            <option value="">Все</option>
            {epochs.map((e: any) => (
              <option key={e.id} value={String(e.id)}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canEdit && (
        <div className="card mb-5 overflow-hidden border-slate-200 dark:border-slate-700">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/80"
            onClick={() => setCreateOpen((o) => !o)}
          >
            <span>Новая задача</span>
            {createOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {createOpen && (
            <div className="px-4 pb-4 pt-0 grid gap-3 border-t border-slate-200 dark:border-slate-700">
              <div className="pt-3 grid gap-3">
                <input
                  className="input"
                  placeholder="Название задачи"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <textarea
                  className="input resize-none"
                  placeholder="Описание (необязательно)"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div>
                  <button
                    className="btn-primary"
                    disabled={!title.trim() || createTask.isPending}
                    onClick={() => createTask.mutate()}
                  >
                    {createTask.isPending ? 'Создание…' : 'Создать задачу'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить задачи. Обновите страницу.</div>
      ) : visibleTasks.length === 0 ? (
        <div className="card p-8 text-center text-slate-400">
          {filter
            ? 'Нет задач по этому фильтру.'
            : scope === 'mine'
              ? 'Нет задач, назначенных на вас.'
              : scope === 'unassigned'
                ? 'Нет задач без исполнителя.'
                : 'Пока нет задач.'}
        </div>
      ) : (
        <KanbanBoard
          tasks={visibleTasks}
          canEdit={canEdit}
          currentUserId={user?.id}
          highlightedTaskId={highlightedTaskId}
          onStatusChange={async (taskId, status) => {
            await updateStatusMutation.mutateAsync({ taskId, status })
          }}
          onReorderColumn={async (_status, orderedTaskIds) => {
            await reorderMutation.mutateAsync({ orderedTaskIds })
          }}
          onAssignSelf={async (taskId) => {
            await assignSelfMutation.mutateAsync(taskId)
          }}
        />
      )}
    </div>
  )
}
