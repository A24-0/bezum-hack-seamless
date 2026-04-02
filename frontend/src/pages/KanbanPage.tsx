import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tasksApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import type { Task } from '../types'
import { STATUS_LABELS } from '../lib/utils'

const COLUMNS = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const

export default function KanbanPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [filter, setFilter] = useState('')
  const { data: tasks = [], isLoading, isError } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!).then((r) => r.data as Task[]),
    enabled: !!projectId,
  })

  const createTask = useMutation({
    mutationFn: () =>
      tasksApi.create(projectId!, { title: title.trim(), description: description.trim(), status: 'backlog' }).then((r) => r.data),
    onSuccess: () => {
      setTitle('')
      setDescription('')
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      addToast({ type: 'success', title: 'Задача создана' })
    },
    onError: () => {
      addToast({ type: 'error', title: 'Не удалось создать задачу' })
    },
  })

  const updateStatus = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      tasksApi.updateStatus(projectId!, String(taskId), status).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
    },
    onError: () => {
      addToast({ type: 'error', title: 'Не удалось обновить статус' })
    },
  })

  if (!projectId) return null
  const normalizedFilter = filter.trim().toLowerCase()
  const visibleTasks = normalizedFilter
    ? tasks.filter((t) => t.title.toLowerCase().includes(normalizedFilter))
    : tasks

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Канбан</h1>
        <input
          className="input w-full sm:w-72"
          placeholder="Поиск по задачам…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="card p-4 mb-4 grid gap-3">
        <input
          className="input"
          placeholder="Название задачи"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="input resize-none"
          placeholder="Описание задачи"
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
      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить задачи. Обновите страницу.</div>
      ) : visibleTasks.length === 0 ? (
        <div className="card p-6 text-center text-slate-400">
          {filter ? 'Нет задач по этому фильтру.' : 'Пока нет задач. Создайте первую выше.'}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((col) => (
            <div key={col} className="min-w-[240px] flex-1">
              <div className="text-sm font-medium text-slate-300 mb-2 flex items-center justify-between">
                <span>{STATUS_LABELS[col] ?? col}</span>
                <span className="text-xs text-slate-500">
                  {visibleTasks.filter((t) => t.status === col).length}
                </span>
              </div>
              <div className="space-y-2">
                {(visibleTasks as Task[])
                  .filter((t) => t.status === col)
                  .map((t) => (
                    <div key={t.id} className="card p-3">
                      <div className="text-slate-900 dark:text-white text-sm font-medium">{t.title}</div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <StatusBadge status={t.status} size="sm" />
                        <select
                          className="bg-slate-800 border border-slate-600 rounded text-xs px-2 py-1 text-slate-200"
                          value={t.status}
                          disabled={updateStatus.isPending}
                          onChange={(e) => updateStatus.mutate({ taskId: Number(t.id), status: e.target.value })}
                        >
                          {COLUMNS.map((status) => (
                            <option key={status} value={status}>
                              {STATUS_LABELS[status] ?? status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
