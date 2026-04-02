import type { CSSProperties } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DndContext, DragEndEvent } from '@dnd-kit/core'
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowUpRight, FileText, GitPullRequest, GripVertical, Link2, Target } from 'lucide-react'
import { cicdApi, documentsApi, epochsApi, meetingsApi, projectsApi, tasksApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useUIStore } from '../stores/uiStore'
import type { Document, Epoch, Meeting, PullRequest, Task } from '../types'
import { STATUS_COLORS, STATUS_LABELS, cn } from '../lib/utils'

/** 0 = «рискованная» пара статусов (красный), 1 = согласованный поток (зелёный) */
function docTaskAlignmentScore(docStatus: string, taskStatus: string): number {
  const D = docStatus || 'draft'
  const T = taskStatus || 'backlog'
  const m: Record<string, Partial<Record<string, number>>> = {
    draft: {
      backlog: 0.42,
      todo: 0.48,
      in_progress: 0.52,
      needs_info: 0.4,
      review: 0.38,
      done: 0.12,
    },
    pending_review: {
      backlog: 0.38,
      todo: 0.45,
      in_progress: 0.58,
      needs_info: 0.42,
      review: 0.88,
      done: 0.45,
    },
    approved: {
      backlog: 0.32,
      todo: 0.42,
      in_progress: 0.68,
      needs_info: 0.48,
      review: 0.78,
      done: 0.97,
    },
  }
  return m[D]?.[T] ?? 0.5
}

function mergeOrder(prev: string[], nextIds: string[]): string[] {
  const set = new Set(nextIds)
  const kept = prev.filter((id) => set.has(id))
  const tail = nextIds.filter((id) => !kept.includes(id))
  return [...kept, ...tail]
}

function StatPill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200/90 dark:border-slate-700/90 p-4 shadow-sm bg-gradient-to-br',
        accent
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{value}</div>
    </div>
  )
}

export default function ProjectRelationsPage() {
  const { projectId } = useParams<{ projectId: string }>()

  const { addToast } = useUIStore()

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
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then((r) => r.data),
    enabled: !!projectId,
  })
  const hasGithubRepo = Boolean(project?.gitlab_repo_url && String(project.gitlab_repo_url).trim())

  const { data: prs = [] } = useQuery({
    queryKey: ['prs', projectId],
    queryFn: () => cicdApi.listPRs(projectId!).then((r) => r.data as PullRequest[]),
    enabled: !!projectId && hasGithubRepo,
  })
  const { data: epochs = [] } = useQuery({
    queryKey: ['epochs', projectId],
    queryFn: () => epochsApi.list(projectId!).then((r) => r.data as Epoch[]),
    enabled: !!projectId,
  })

  const [docOrder, setDocOrder] = useState<string[]>([])
  const [taskOrder, setTaskOrder] = useState<string[]>([])
  useEffect(() => {
    const ids = docs.map((d) => String(d.id))
    setDocOrder((prev) => mergeOrder(prev, ids))
  }, [docs])
  useEffect(() => {
    const ids = tasks.map((t) => String(t.id))
    setTaskOrder((prev) => mergeOrder(prev, ids))
  }, [tasks])

  // docId -> set(taskId)
  const [linksNonce, setLinksNonce] = useState(0)
  const [linkedTaskIdsByDoc, setLinkedTaskIdsByDoc] = useState<Record<string, Set<string>>>({})
  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    async function loadLinks() {
      const next: Record<string, Set<string>> = {}
      await Promise.all(
        docs.map(async (d) => {
          try {
            const linkedResp = await documentsApi.linkedTasks(projectId!, String(d.id))
            const linked = linkedResp.data
            next[String(d.id)] = new Set(linked.map((t: any) => String(t.id)))
          } catch {
            next[String(d.id)] = new Set()
          }
        })
      )

      if (!cancelled) setLinkedTaskIdsByDoc(next)
    }

    loadLinks()
    return () => {
      cancelled = true
    }
  }, [projectId, docs, linksNonce])

  const taskById = useMemo(() => {
    const m = new Map<string, Task>()
    for (const t of tasks) m.set(String(t.id), t)
    return m
  }, [tasks])
  const docById = useMemo(() => {
    const m = new Map<string, Document>()
    for (const d of docs) m.set(String(d.id), d)
    return m
  }, [docs])

  const orderedDocs = useMemo(
    () => docOrder.map((id) => docById.get(id)).filter(Boolean) as Document[],
    [docOrder, docById]
  )
  const orderedTasks = useMemo(
    () => taskOrder.map((id) => taskById.get(id)).filter(Boolean) as Task[],
    [taskOrder, taskById]
  )

  const toggleLink = async (docId: string, taskId: string, shouldLink: boolean) => {
    try {
      if (shouldLink) await documentsApi.linkTask(projectId!, docId, taskId)
      else await documentsApi.unlinkTask(projectId!, docId, taskId)
      setLinksNonce((n) => n + 1)
    } catch (e: any) {
      addToast({
        type: 'error',
        title: 'Ошибка связи',
        body: e?.response?.data?.detail || e?.message,
      })
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId.startsWith('doc:') && overId.startsWith('doc:')) {
      const a = activeId.slice('doc:'.length)
      const o = overId.slice('doc:'.length)
      const oldIdx = docOrder.indexOf(a)
      const newIdx = docOrder.indexOf(o)
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) setDocOrder((prev) => arrayMove(prev, oldIdx, newIdx))
    }
    if (activeId.startsWith('task:') && overId.startsWith('task:')) {
      const a = activeId.slice('task:'.length)
      const o = overId.slice('task:'.length)
      const oldIdx = taskOrder.indexOf(a)
      const newIdx = taskOrder.indexOf(o)
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) setTaskOrder((prev) => arrayMove(prev, oldIdx, newIdx))
    }
  }

  const taskStatuses = useMemo(
    () => ['backlog', 'todo', 'in_progress', 'needs_info', 'review', 'done'] as const,
    []
  )
  // Matches backend `DocumentStatus` enum: draft / pending_review / approved
  const docStatuses = useMemo(() => ['draft', 'pending_review', 'approved'] as const, [])

  const heatmap = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {}
    for (const ds of docStatuses) counts[ds] = {}
    for (const ds of docStatuses) for (const ts of taskStatuses) counts[ds][ts] = 0

    for (const d of orderedDocs) {
      const linked = linkedTaskIdsByDoc[String(d.id)] || new Set()
      let ds = (d.status || 'draft') as string
      if (!counts[ds]) ds = 'draft'
      for (const tid of linked) {
        const t = taskById.get(String(tid))
        if (!t) continue
        const ts = (t.status || 'backlog') as string
        if (counts[ds] && counts[ds][ts] !== undefined) counts[ds][ts] += 1
      }
    }

    let max = 0
    for (const ds of docStatuses) {
      for (const ts of taskStatuses) max = Math.max(max, counts[ds][ts] || 0)
    }
    return { counts, max }
  }, [docStatuses, orderedDocs, linkedTaskIdsByDoc, taskStatuses, taskById])

  const totalLinks = useMemo(() => {
    let sum = 0
    for (const ds of docStatuses) {
      for (const ts of taskStatuses) sum += heatmap.counts[ds]?.[ts] || 0
    }
    return sum
  }, [docStatuses, taskStatuses, heatmap.counts])

  if (!projectId) return null

  return (
    <div className="min-h-full px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-gradient-to-br from-indigo-500/[0.07] via-slate-50 to-violet-500/[0.06] dark:from-indigo-950/40 dark:via-slate-900 dark:to-violet-950/30 p-6 sm:p-8 mb-8">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-500/25">
              <Link2 className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Связи</h1>
              <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 max-w-2xl">
                Документы и задачи в одной матрице, тепловая карта статусов и граф. По задаче можно перейти на канбан — карточка подсветится.
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="max-w-6xl mx-auto pb-10 space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatPill label="Спринты" value={epochs.length} accent="from-amber-500/20 to-orange-500/10" />
        <StatPill label="Задачи" value={tasks.length} accent="from-emerald-500/20 to-teal-500/10" />
        <StatPill label="Документы" value={docs.length} accent="from-sky-500/20 to-blue-500/10" />
        <StatPill label="Встречи" value={meetings.length} accent="from-fuchsia-500/20 to-pink-500/10" />
        <div className="col-span-2 sm:col-span-3 lg:col-span-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm p-4 shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Pull requests</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">{hasGithubRepo ? prs.length : '—'}</div>
          {!hasGithubRepo && <div className="text-[10px] text-slate-500 mt-1">Репозиторий в CI/CD</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700/90 bg-white/90 dark:bg-slate-900/60 shadow-sm p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-500 shrink-0" />
            Матрица «документ ↔ задача»
          </h2>
          <p className="text-xs text-slate-500 mb-4">Клик по ячейке — связать или снять. Заголовки задач ведут на канбан.</p>

          <div className="space-y-3">
            <DndContext onDragEnd={handleDragEnd}>
              <div>
                <div className="text-xs text-slate-400 mb-2">Документы (перетаскивайте — порядок строк в таблице)</div>
                <div className="max-h-64 overflow-auto rounded-lg border border-slate-700 p-2">
                  <SortableContext items={docOrder.map((id) => `doc:${id}`)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {orderedDocs.map((d) => (
                        <DocChip key={String(d.id)} doc={d} />
                      ))}
                      {orderedDocs.length === 0 && (
                        <div className="text-sm text-slate-500">Пока нет документов</div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-xs text-slate-400 mb-2">Задачи (перетаскивайте — порядок столбцов в таблице)</div>
                <div className="overflow-x-auto rounded-lg border border-slate-700 p-2">
                  <SortableContext items={taskOrder.map((id) => `task:${id}`)} strategy={horizontalListSortingStrategy}>
                    <div className="flex gap-2 min-w-max">
                      {orderedTasks.map((t) => (
                        <TaskChip key={String(t.id)} task={t} projectId={projectId} />
                      ))}
                      {orderedTasks.length === 0 && <div className="text-sm text-slate-500">Пока нет задач</div>}
                    </div>
                  </SortableContext>
                </div>
              </div>
            </DndContext>

            <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
              <table className="min-w-[900px] w-full text-xs">
                <thead className="bg-slate-100/95 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="sticky left-0 bg-slate-100/95 dark:bg-slate-900/90 z-10 p-3 text-left w-[320px] border-r border-slate-200/80 dark:border-slate-700/80">
                      Документы
                    </th>
                    {orderedTasks.map((t) => (
                      <th key={String(t.id)} className="p-2 text-center whitespace-nowrap align-top min-w-[128px]">
                        <Link
                          to={`/projects/${projectId}/kanban#task-${t.id}`}
                          className="group block rounded-lg px-1.5 py-2 -mx-0.5 transition-colors hover:bg-indigo-500/15 border border-transparent hover:border-indigo-500/25"
                          title="Открыть задачу на канбане"
                        >
                          <div className="flex items-center justify-center gap-2">
                            <StatusBadge status={t.status} size="sm" />
                          </div>
                          <div className="text-[11px] text-slate-200 truncate max-w-[168px] mx-auto mt-1 flex items-center justify-center gap-0.5">
                            <span className="truncate">
                              #{t.id} {t.title}
                            </span>
                            <ArrowUpRight className="w-3 h-3 shrink-0 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white/50 dark:bg-slate-900/20 divide-y divide-slate-200 dark:divide-slate-700/60">
                  {orderedDocs.map((d) => (
                    <tr key={String(d.id)} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                      <td className="sticky left-0 bg-white/95 dark:bg-slate-900/90 z-10 p-3 border-r border-slate-200/80 dark:border-slate-700/80">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              to={`/projects/${projectId}/documents/${d.id}`}
                              className="text-sm text-slate-200 hover:text-indigo-300 truncate block"
                            >
                              {d.title}
                            </Link>
                            <div className="mt-1">
                              <StatusBadge status={d.status} size="sm" />
                            </div>
                          </div>
                          <div className="text-slate-500">
                            <GripVertical className="w-4 h-4" />
                          </div>
                        </div>
                      </td>
                      {orderedTasks.map((t) => {
                        const linked = linkedTaskIdsByDoc[String(d.id)]?.has(String(t.id)) ?? false
                        return (
                          <td key={`${d.id}-${t.id}`} className="p-2 text-center">
                            <button
                              type="button"
                              className={`w-8 h-8 rounded-full border transition-colors ${
                                linked
                                  ? 'bg-indigo-500/30 border-indigo-500/60 text-indigo-200 hover:bg-indigo-500/40'
                                  : 'bg-slate-800/30 border-slate-700 text-slate-500 hover:border-slate-600'
                              }`}
                              title={linked ? 'Связь есть. Клик — удалить' : 'Связи нет. Клик — добавить'}
                              onClick={() => toggleLink(String(d.id), String(t.id), !linked)}
                            >
                              {linked ? '✓' : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {orderedDocs.length === 0 && (
                    <tr>
                      <td colSpan={orderedTasks.length + 1} className="p-4 text-sm text-slate-500">
                        Нет данных для таблицы
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setLinksNonce((n) => n + 1)}
              >
                Пересчитать связи
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-700/90 bg-white/90 dark:bg-slate-900/60 shadow-sm p-5 sm:p-6">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
            Тепловая карта и граф
          </h2>
          <p className="text-xs text-slate-500 mb-4">Узлы графа можно тянуть; у задачи и документа — ссылка на канбан или документ.</p>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950/[0.15] dark:bg-slate-950/30">
              <RelationsGraphCanvas
                projectId={projectId}
                orderedDocs={orderedDocs}
                orderedTasks={orderedTasks}
                linkedTaskIdsByDoc={linkedTaskIdsByDoc}
                taskById={taskById}
                heatmapCounts={heatmap.counts}
                heatmapMax={heatmap.max}
                docStatuses={docStatuses}
                taskStatuses={taskStatuses}
              />
            </div>
            <p className="text-[11px] text-slate-500 px-1">
              Связи на графе: цвет от красного к зелёному — согласованность статусов документа и задачи и близость узлов на поле
              (перетащите карточки; дальше = холоднее). Толщина линии — «жар» пары в матрице статусов.
            </p>

            <div className="overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="min-w-[700px] w-full text-xs">
                <thead className="bg-slate-100/90 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300">
                  <tr>
                    <th className="p-3 text-left">Статус документов →</th>
                    {taskStatuses.map((ts) => (
                      <th key={ts} className="p-3 text-center">
                        {STATUS_LABELS[ts] ?? ts}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/60">
                  {docStatuses.map((ds) => (
                    <tr key={ds}>
                      <td className="p-3 text-left text-slate-300">{STATUS_LABELS[ds] ?? ds}</td>
                      {taskStatuses.map((ts) => {
                        const v = heatmap.counts[ds]?.[ts] || 0
                        const align = docTaskAlignmentScore(ds, ts)
                        const intensity = heatmap.max ? v / heatmap.max : 0
                        let bg: string
                        let fg = 'text-slate-200'
                        if (v === 0) {
                          bg = 'rgba(30, 41, 59, 0.55)'
                          fg = 'text-slate-500'
                        } else {
                          const mix = 0.55 * align + 0.45 * intensity
                          const hue = mix * 118
                          const light = 48 - intensity * 14
                          bg = `hsla(${hue}, 72%, ${light}%, 0.92)`
                        }
                        return (
                          <td key={`${ds}-${ts}`} className="p-2 text-center">
                            <div
                              className={`w-11 h-11 mx-auto rounded-lg border flex items-center justify-center shadow-inner ${v > 0 ? 'border-white/10' : 'border-slate-700'}`}
                              style={{ background: bg }}
                              title={`Документ: ${STATUS_LABELS[ds] ?? ds} · Задача: ${STATUS_LABELS[ts] ?? ts} · связей: ${v}. Цвет: зелёный = согласованный поток, красный = риск.`}
                            >
                              <span className={`font-semibold text-sm ${fg}`}>{v}</span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-xs text-slate-500 mt-3 flex flex-wrap gap-2 items-center">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-[hsla(0,72%,42%,0.9)]" /> низкая согласованность
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-[hsla(118,72%,42%,0.9)]" /> здоровый поток
            </span>
            <span className="text-slate-500">· насыщенность = число связей в ячейке</span>
          </div>

          <div className="text-xs text-slate-400 mt-2">
            Всего связей документ ↔ задача: <span className="text-slate-200 font-medium">{totalLinks}</span>
          </div>
          {totalLinks === 0 && (
            <div className="text-xs text-slate-500 mt-2">
              Похоже, связей документ↔задача нет или они не подгрузились для этой страницы.
            </div>
          )}

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-400" />
              Быстрый просмотр: встречи
            </h2>
            <ul className="space-y-2">
              {meetings.slice(0, 6).map((m) => (
                <li key={m.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/40">
                  <Link
                    to={`/projects/${projectId}/meetings/${m.id}`}
                    className="text-sm text-slate-900 dark:text-white hover:text-indigo-300"
                  >
                    {m.title}
                  </Link>
                  <div className="text-xs text-slate-400 mt-1">
                    Статус: {STATUS_LABELS[m.status] ?? m.status} | Задача: {m.task_id ? `#${m.task_id}` : 'нет'} | Саммари:{' '}
                    {m.summary ? 'да' : 'нет'}
                  </div>
                </li>
              ))}
              {meetings.length === 0 && <li className="text-sm text-slate-500">Пока нет встреч</li>}
            </ul>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <GitPullRequest className="w-4 h-4 text-indigo-400" />
              Быстрый просмотр: PR
            </h2>
            {!hasGithubRepo ? (
              <p className="text-sm text-slate-500">
                Сохраните URL репозитория GitHub в разделе CI/CD — тогда PR подтянутся из веток репозитория и появятся здесь и в карточках задач на Канбане.
              </p>
            ) : (
              <ul className="space-y-2">
                {prs.slice(0, 8).map((pr) => (
                  <li key={pr.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-800/40">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-slate-900 dark:text-white hover:text-indigo-300"
                    >
                      {pr.title}
                    </a>
                    <div className="text-xs text-slate-400 mt-1">
                      {pr.source_branch} {'->'} {pr.target_branch} | Задача:{' '}
                      {pr.task_id ? `#${pr.task_id}` : 'не привязана'}
                    </div>
                  </li>
                ))}
                {prs.length === 0 && (
                  <li className="text-sm text-slate-500">
                    Нет PR в базе. Откройте CI/CD и нажмите «Синхронизировать с GitHub» — подтянем открытые и закрытые PR из сохранённого репозитория.
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

type GraphNode = {
  key: string
  kind: 'doc' | 'task'
  id: string
  title: string
  status: string
}

type GraphEdge = {
  fromKey: string
  toKey: string
  heatAlpha: number
  align: number
}

function RelationsGraphCanvas({
  projectId,
  orderedDocs,
  orderedTasks,
  linkedTaskIdsByDoc,
  taskById,
  heatmapCounts,
  heatmapMax,
  docStatuses,
  taskStatuses,
}: {
  projectId: string
  orderedDocs: Document[]
  orderedTasks: Task[]
  linkedTaskIdsByDoc: Record<string, Set<string>>
  taskById: Map<string, Task>
  heatmapCounts: Record<string, Record<string, number>>
  heatmapMax: number
  docStatuses: readonly string[]
  taskStatuses: readonly string[]
}) {
  const MAX_DOCS = 9
  const MAX_TASKS = 9
  const GRAPH_W = 980
  const GRAPH_H = 520
  const NODE_W = 220
  const NODE_H = 64

  const viewportRef = useRef<HTMLDivElement | null>(null)

  const taskCandidate = orderedTasks.slice(0, MAX_TASKS * 3)
  const taskCandidateSet = useMemo(() => new Set(taskCandidate.map((t) => String(t.id))), [taskCandidate])

  const docScored = useMemo(() => {
    const scored = orderedDocs.map((d) => {
      const linked = linkedTaskIdsByDoc[String(d.id)] || new Set()
      let score = 0
      for (const tid of linked) {
        if (taskCandidateSet.has(String(tid))) score += 1
      }
      return { d, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored
  }, [orderedDocs, linkedTaskIdsByDoc, taskCandidateSet])

  const docSel = useMemo(() => {
    const selected = docScored.filter((x) => x.score > 0).slice(0, MAX_DOCS).map((x) => x.d)
    return selected.length ? selected : docScored.slice(0, MAX_DOCS).map((x) => x.d)
  }, [docScored])

  const taskSel = useMemo(() => {
    const docSet = new Set(docSel.map((d) => String(d.id)))
    const taskCounts = new Map<string, number>()
    for (const d of docSel) {
      const linked = linkedTaskIdsByDoc[String(d.id)] || new Set()
      for (const tid of linked) {
        const key = String(tid)
        // Only count tasks that are in the candidate pool to keep graph light.
        if (!taskCandidateSet.has(key)) continue
        taskCounts.set(key, (taskCounts.get(key) || 0) + 1)
      }
    }
    const tasks = orderedTasks
      .filter((t) => taskCounts.has(String(t.id)))
      .sort((a, b) => (taskCounts.get(String(b.id)) || 0) - (taskCounts.get(String(a.id)) || 0))
      .slice(0, MAX_TASKS)
    return tasks.length ? tasks : orderedTasks.slice(0, MAX_TASKS)
  }, [docSel, orderedTasks, linkedTaskIdsByDoc, taskCandidateSet])

  const taskSelSet = useMemo(() => new Set(taskSel.map((t) => String(t.id))), [taskSel])

  const graphNodes = useMemo((): GraphNode[] => {
    const nodes: GraphNode[] = []
    for (let i = 0; i < docSel.length; i++) {
      const d = docSel[i]
      nodes.push({
        key: `doc:${String(d.id)}`,
        kind: 'doc',
        id: String(d.id),
        title: d.title,
        status: (d.status || 'draft') as string,
      })
    }
    for (let i = 0; i < taskSel.length; i++) {
      const t = taskSel[i]
      nodes.push({
        key: `task:${String(t.id)}`,
        kind: 'task',
        id: String(t.id),
        title: t.title,
        status: (t.status || 'backlog') as string,
      })
    }
    return nodes
  }, [docSel, taskSel])

  const initialPositionsRef = useRef<Record<string, { x: number; y: number }>>({})
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})

  useEffect(() => {
    const next: Record<string, { x: number; y: number }> = {}
    const leftX = 120
    const rightX = 640
    const yStepDoc = Math.max(76, (GRAPH_H - 90) / Math.max(1, docSel.length))
    const yStepTask = Math.max(76, (GRAPH_H - 90) / Math.max(1, taskSel.length))

    for (let i = 0; i < docSel.length; i++) {
      const d = docSel[i]
      next[`doc:${String(d.id)}`] = { x: leftX, y: 60 + i * yStepDoc }
    }
    for (let i = 0; i < taskSel.length; i++) {
      const t = taskSel[i]
      next[`task:${String(t.id)}`] = { x: rightX, y: 60 + i * yStepTask }
    }

    initialPositionsRef.current = next
    setPositions(next)
  }, [docSel, taskSel])

  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  const dragRef = useRef<{
    nodeKey: string | null
    offsetX: number
    offsetY: number
    panning: boolean
    startClientX: number
    startClientY: number
    startPanX: number
    startPanY: number
  }>({
    nodeKey: null,
    offsetX: 0,
    offsetY: 0,
    panning: false,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
  })

  const getGraphPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = viewportRef.current
      if (!el) return { x: 0, y: 0 }
      const r = el.getBoundingClientRect()
      return {
        x: (clientX - r.left - pan.x) / zoom,
        y: (clientY - r.top - pan.y) / zoom,
      }
    },
    [pan.x, pan.y, zoom]
  )

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY
      const next = delta > 0 ? zoom / 1.12 : zoom * 1.12
      setZoom(Math.max(0.6, Math.min(2.0, next)))
    },
    [zoom]
  )

  const onPointerDownBackground = useCallback((e: React.PointerEvent) => {
    // Only pan when clicking empty background.
    const target = e.target as HTMLElement
    if (target?.dataset?.node === '1') return
    const d = dragRef.current
    d.panning = true
    d.startClientX = e.clientX
    d.startClientY = e.clientY
    d.startPanX = pan.x
    d.startPanY = pan.y
  }, [pan.x, pan.y])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (d.panning) {
        const dx = e.clientX - d.startClientX
        const dy = e.clientY - d.startClientY
        setPan({ x: d.startPanX + dx, y: d.startPanY + dy })
      }
      if (!d.nodeKey) return
      const p = getGraphPoint(e.clientX, e.clientY)
      setPositions((prev) => ({
        ...prev,
        [d.nodeKey as string]: {
          x: p.x - d.offsetX,
          y: p.y - d.offsetY,
        },
      }))
    }

    const onUp = () => {
      const d = dragRef.current
      d.nodeKey = null
      d.panning = false
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [getGraphPoint])

  const edges = useMemo((): GraphEdge[] => {
    const docSet = new Set(docSel.map((d) => `doc:${String(d.id)}`))
    const taskSet = taskSelSet
    const list: GraphEdge[] = []

    let count = 0
    const MAX_EDGES = 120

    const safeMax = heatmapMax || 1
    for (const d of docSel) {
      const linked = linkedTaskIdsByDoc[String(d.id)] || new Set()
      const fromKey = `doc:${String(d.id)}`
      if (!docSet.has(fromKey)) continue
      for (const tid of linked) {
        const tId = String(tid)
        if (!taskSet.has(tId)) continue
        const t = taskById.get(tId)
        if (!t) continue
        const toKey = `task:${tId}`
        let ds = (d.status || 'draft') as string
        if (!heatmapCounts[ds]) ds = 'draft'
        const ts = (t.status || 'backlog') as string
        const v = heatmapCounts[ds]?.[ts] || 0
        const heatAlpha = v / safeMax
        const align = docTaskAlignmentScore(ds, ts)
        list.push({ fromKey, toKey, heatAlpha, align })
        count += 1
        if (count >= MAX_EDGES) break
      }
      if (count >= MAX_EDGES) break
    }

    return list
  }, [docSel, linkedTaskIdsByDoc, taskSelSet, taskById, heatmapCounts, heatmapMax])

  const edgesForSvg = edges.filter((e) => positions[e.fromKey] && positions[e.toKey])

  const resetLayout = useCallback(() => {
    setPan({ x: 0, y: 0 })
    setZoom(1)
    setPositions(initialPositionsRef.current)
  }, [])

  return (
    <div className="h-[520px] relative">
      <div className="absolute top-2 right-2 flex gap-2 z-10">
        <button type="button" className="btn-secondary text-xs" onClick={resetLayout}>
          Сбросить
        </button>
      </div>

      <div
        ref={viewportRef}
        className="absolute inset-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-950/10"
        onWheel={onWheel}
        onPointerDown={onPointerDownBackground}
      >
        <div
          className="absolute left-0 top-0"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: GRAPH_W, height: GRAPH_H }}
        >
          <svg width={GRAPH_W} height={GRAPH_H} className="absolute left-0 top-0 pointer-events-none">
            {/* Grid */}
            {Array.from({ length: 12 }).map((_, i) => {
              const x = i * 80
              return <line key={`gx-${i}`} x1={x} y1={0} x2={x} y2={GRAPH_H} stroke="rgba(148,163,184,0.15)" />
            })}
            {Array.from({ length: 8 }).map((_, i) => {
              const y = i * 80
              return <line key={`gy-${i}`} x1={0} y1={y} x2={GRAPH_W} y2={y} stroke="rgba(148,163,184,0.15)" />
            })}

            {/* Edges */}
            {edgesForSvg.map((e, idx) => {
              const pa = positions[e.fromKey]
              const pb = positions[e.toKey]
              if (!pa || !pb) return null
              const x1 = pa.x + NODE_W
              const y1 = pa.y + NODE_H / 2
              const x2 = pb.x
              const y2 = pb.y + NODE_H / 2
              const dist = Math.hypot(x2 - x1, y2 - y1)
              const maxD = 780
              const distScore = 1 - Math.min(1, dist / maxD)
              const mix = 0.52 * e.align + 0.48 * distScore
              const hue = mix * 118
              const ha = Math.max(0.08, Math.min(1, e.heatAlpha))
              const strokeWidth = 1.2 + ha * 4.2
              const opacity = 0.28 + ha * 0.62
              const stroke = `hsla(${hue}, 76%, 52%, ${opacity})`
              return (
                <path
                  key={`${e.fromKey}-${e.toKey}-${idx}`}
                  d={`M${x1} ${y1} C ${x1 + 80} ${y1}, ${x2 - 80} ${y2}, ${x2} ${y2}`}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray="5 6"
                  fill="none"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>

          {/* Nodes */}
          {graphNodes.map((n) => {
            const p = positions[n.key]
            if (!p) return null
            const color = STATUS_COLORS[n.status] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
            const title = n.title.length > 22 ? n.title.slice(0, 22) + '…' : n.title

            return (
              <div
                key={n.key}
                data-node="1"
                style={{ position: 'absolute', left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                className={`relative px-3 py-2 rounded-xl border shadow-sm select-none cursor-grab ${color}`}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  const p0 = getGraphPoint(e.clientX, e.clientY)
                  dragRef.current.nodeKey = n.key
                  dragRef.current.offsetX = p0.x - p.x
                  dragRef.current.offsetY = p0.y - p.y
                  dragRef.current.panning = false
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  // Snap to initial position on double-click.
                  const init = initialPositionsRef.current[n.key]
                  if (init) setPositions((prev) => ({ ...prev, [n.key]: init }))
                }}
                title={`${n.kind === 'doc' ? 'Документ' : 'Задача'}: ${n.title}`}
              >
                {n.kind === 'doc' ? (
                  <Link
                    to={`/projects/${projectId}/documents/${n.id}`}
                    className="absolute top-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-indigo-600 shadow-sm hover:bg-indigo-50 dark:bg-slate-900/90 dark:text-indigo-300 dark:hover:bg-indigo-950/80"
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Открыть документ"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <Link
                    to={`/projects/${projectId}/kanban#task-${n.id}`}
                    className="absolute top-1.5 right-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-indigo-600 shadow-sm hover:bg-indigo-50 dark:bg-slate-900/90 dark:text-indigo-300 dark:hover:bg-indigo-950/80"
                    onPointerDown={(e) => e.stopPropagation()}
                    title="Открыть на канбане"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                )}
                <div className="text-xs font-semibold pr-8">
                  {n.kind === 'doc' ? 'Док:' : 'Задача:'} {title}
                </div>
                <div className="mt-1">
                  <span className="text-[11px] opacity-80">{STATUS_LABELS[n.status] ?? n.status}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TaskChip({ task, projectId }: { task: Task; projectId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task:${String(task.id)}`,
  })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`shrink-0 min-w-[180px] px-3 py-2 rounded-lg border ${
        isDragging ? 'border-indigo-500/60 bg-indigo-500/15' : 'border-slate-700 bg-slate-800/20 hover:border-slate-600'
      }`}
      title="Drag — поменять порядок столбца"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/projects/${projectId}/kanban#task-${task.id}`}
            className="group text-sm text-slate-200 hover:text-indigo-300 truncate block"
            title="Открыть на канбане"
          >
            <span className="truncate">
              #{task.id} {task.title}
            </span>{' '}
            <ArrowUpRight className="inline w-3 h-3 -mt-0.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
          <div className="mt-1">
            <StatusBadge status={task.status} size="sm" />
          </div>
        </div>
      </div>
    </div>
  )
}

function DocChip({ doc }: { doc: Document }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `doc:${String(doc.id)}`,
  })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`px-3 py-2 rounded-lg border ${
        isDragging ? 'border-indigo-500/60 bg-indigo-500/15' : 'border-slate-700 bg-slate-800/20 hover:border-slate-600'
      }`}
      title="Drag — поменять порядок строки"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/projects/${doc.project_id}/documents/${doc.id}`}
            className="text-sm text-slate-200 hover:text-indigo-300 truncate block"
          >
            {doc.title}
          </Link>
          <div className="mt-1">
            <StatusBadge status={doc.status} size="sm" />
          </div>
        </div>
      </div>
    </div>
  )
}
