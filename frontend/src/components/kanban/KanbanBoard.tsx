import { useMemo, useState, type HTMLAttributes } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { GitPullRequest, GripVertical, UserPlus } from 'lucide-react'
import type { Task, TaskStatus } from '../../types'
import { STATUS_LABELS, getInitials, cn } from '../../lib/utils'
import { StatusBadge } from '../common/StatusBadge'

const DRAG_TASK = (id: string | number) => `task-${id}`

function parseDragId(s: string): number | null {
  if (!s.startsWith('task-')) return null
  const n = Number(s.slice(5))
  return Number.isFinite(n) ? n : null
}

function orderIndexSort(a: Task, b: Task) {
  return (a.order_index ?? 0) - (b.order_index ?? 0)
}

const COLUMNS: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'needs_info', 'review', 'done']

type KanbanBoardProps = {
  tasks: Task[]
  canEdit: boolean
  currentUserId?: string
  onStatusChange: (taskId: number, status: TaskStatus) => Promise<void>
  onReorderColumn: (status: TaskStatus, orderedTaskIds: number[]) => Promise<void>
  onAssignSelf: (taskId: number) => Promise<void>
}

function TaskCardBody({
  task,
  dragHandleProps,
  canEdit,
  showAssignSelf,
  onAssignSelf,
  assigning,
  onPickStatus,
}: {
  task: Task
  dragHandleProps?: HTMLAttributes<HTMLElement>
  canEdit: boolean
  showAssignSelf: boolean
  onAssignSelf: () => void
  assigning: boolean
  onPickStatus?: (status: TaskStatus) => void
}) {
  const labelText = (task.labels ?? []).map((l) => l.label ?? l.name).filter(Boolean)
  return (
    <div className="card p-3 shadow-sm hover:border-indigo-500/40 transition-colors">
      <div className="flex gap-2">
        {canEdit && dragHandleProps && (
          <button
            type="button"
            className="mt-0.5 p-0.5 rounded text-slate-400 hover:text-slate-200 cursor-grab active:cursor-grabbing touch-none shrink-0"
            aria-label="Перетащить"
            {...dragHandleProps}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-slate-900 dark:text-white text-sm font-medium leading-snug">{task.title}</div>
          {labelText.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {labelText.slice(0, 3).map((text, i) => (
                <span
                  key={`${task.id}-l-${i}`}
                  className="text-[10px] px-1.5 py-0 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
                >
                  {text}
                </span>
              ))}
            </div>
          )}
          {(task.linked_pr_count ?? 0) > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-emerald-400/90 font-medium">
                <GitPullRequest className="w-3 h-3 shrink-0" />
                PR: {task.linked_pr_count}
              </div>
              {(task.linked_prs ?? []).slice(0, 2).map((pr, i) => (
                <a
                  key={`${task.id}-pr-${i}`}
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[10px] text-indigo-300 hover:text-indigo-200"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {pr.title}
                </a>
              ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {canEdit && onPickStatus ? (
              <select
                className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-[11px] px-1.5 py-0.5 text-slate-800 dark:text-slate-200 max-w-[140px]"
                value={task.status}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onPickStatus(e.target.value as TaskStatus)}
                aria-label="Статус задачи"
              >
                {COLUMNS.map((c) => (
                  <option key={c} value={c}>
                    {STATUS_LABELS[c] ?? c}
                  </option>
                ))}
              </select>
            ) : (
              <StatusBadge status={task.status} size="sm" />
            )}
            {task.assignee ? (
              <span
                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-600 text-[10px] text-white font-medium"
                title={task.assignee.name}
              >
                {getInitials(task.assignee.name)}
              </span>
            ) : (
              showAssignSelf && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAssignSelf()
                  }}
                  disabled={assigning}
                  className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  На меня
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DraggableTask({
  task,
  canEdit,
  showAssignSelf,
  onAssignSelf,
  assigning,
  onPickStatus,
}: {
  task: Task
  canEdit: boolean
  showAssignSelf: boolean
  onAssignSelf: () => void
  assigning: boolean
  onPickStatus?: (status: TaskStatus) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: DRAG_TASK(task.id),
    disabled: !canEdit,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'opacity-40')}
    >
      <TaskCardBody
        task={task}
        dragHandleProps={canEdit ? { ...listeners, ...attributes } : undefined}
        canEdit={canEdit}
        showAssignSelf={showAssignSelf}
        onAssignSelf={onAssignSelf}
        assigning={assigning}
        onPickStatus={onPickStatus}
      />
    </div>
  )
}

function KanbanColumn({
  status,
  tasksInCol,
  canEdit,
  currentUserId,
  onAssignSelf,
  assigningId,
  onStatusChange,
}: {
  status: TaskStatus
  tasksInCol: Task[]
  canEdit: boolean
  currentUserId?: string
  onAssignSelf: (taskId: number) => void
  assigningId: number | null
  onStatusChange: (taskId: number, status: TaskStatus) => Promise<void>
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `droppable-${status}`,
  })

  return (
    <div className="min-w-[272px] max-w-[320px] flex-1 flex flex-col">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center justify-between px-0.5">
        <span>{STATUS_LABELS[status] ?? status}</span>
        <span className="text-xs text-slate-500 tabular-nums">{tasksInCol.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-xl border border-dashed p-2 min-h-[200px] space-y-2 transition-colors',
          isOver && canEdit ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40'
        )}
      >
        {tasksInCol.map((t) => (
          <DraggableTask
            key={t.id}
            task={t}
            canEdit={canEdit}
            showAssignSelf={
              canEdit &&
              !t.assignee &&
              !!currentUserId
            }
            onAssignSelf={() => onAssignSelf(Number(t.id))}
            assigning={assigningId === Number(t.id)}
            onPickStatus={(st) => {
              if (st !== t.status) void onStatusChange(Number(t.id), st)
            }}
          />
        ))}
        {tasksInCol.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-8 px-2">Перетащите сюда задачу</p>
        )}
      </div>
    </div>
  )
}

function StaticColumn({ status, tasksInCol }: { status: TaskStatus; tasksInCol: Task[] }) {
  return (
    <div className="min-w-[272px] max-w-[320px] flex-1 flex flex-col">
      <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2 flex items-center justify-between px-0.5">
        <span>{STATUS_LABELS[status] ?? status}</span>
        <span className="text-xs text-slate-500 tabular-nums">{tasksInCol.length}</span>
      </div>
      <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 p-2 min-h-[120px] space-y-2 bg-slate-50/80 dark:bg-slate-900/40">
        {tasksInCol.map((t) => (
          <TaskCardBody
            key={t.id}
            task={t}
            canEdit={false}
            showAssignSelf={false}
            onAssignSelf={() => {}}
            assigning={false}
          />
        ))}
      </div>
    </div>
  )
}

export function KanbanBoard({
  tasks,
  canEdit,
  currentUserId,
  onStatusChange,
  onReorderColumn,
  onAssignSelf,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<number | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {} as Record<TaskStatus, Task[]>
    for (const c of COLUMNS) map[c] = []
    for (const t of tasks) {
      const st = COLUMNS.includes(t.status) ? t.status : 'backlog'
      map[st].push(t)
    }
    for (const c of COLUMNS) {
      map[c].sort(orderIndexSort)
    }
    return map
  }, [tasks])

  const activeTask = activeId ? tasks.find((t) => DRAG_TASK(t.id) === activeId) : undefined

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e
    setActiveId(null)
    if (!canEdit || !over) return

    const activeTaskId = parseDragId(String(active.id))
    if (activeTaskId == null) return

    const activeTask = tasks.find((t) => Number(t.id) === activeTaskId)
    if (!activeTask) return

    const overStr = String(over.id)
    let targetStatus: TaskStatus | null = null
    let overTaskId: number | null = null

    if (overStr.startsWith('droppable-')) {
      const s = overStr.replace('droppable-', '') as TaskStatus
      if (COLUMNS.includes(s)) targetStatus = s
    } else if (overStr.startsWith('task-')) {
      overTaskId = parseDragId(overStr)
      if (overTaskId != null) {
        const ot = tasks.find((t) => Number(t.id) === overTaskId)
        if (ot) targetStatus = ot.status
      }
    }
    if (!targetStatus) return

    try {
      if (activeTask.status !== targetStatus) {
        await onStatusChange(activeTaskId, targetStatus)
        return
      }
      if (overTaskId != null && overTaskId !== activeTaskId) {
        const col = activeTask.status
        const list = [...grouped[col]]
        const ids = list.map((t) => Number(t.id))
        const from = ids.indexOf(activeTaskId)
        const to = ids.indexOf(overTaskId)
        if (from === -1 || to === -1 || from === to) return
        const newIds = arrayMove(ids, from, to)
        await onReorderColumn(col, newIds)
      }
    } catch {
      /* toast в родителе */
    }
  }

  const handleAssign = async (taskId: number) => {
    setAssigningId(taskId)
    try {
      await onAssignSelf(taskId)
    } finally {
      setAssigningId(null)
    }
  }

  if (!canEdit) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
        {COLUMNS.map((col) => (
          <StaticColumn key={col} status={col} tasksInCol={grouped[col]} />
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={(e) => void handleDragEnd(e)}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col}
            status={col}
            tasksInCol={grouped[col]}
            canEdit={canEdit}
            currentUserId={currentUserId}
            onAssignSelf={handleAssign}
            assigningId={assigningId}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="opacity-95 rotate-1 scale-[1.02] shadow-xl">
            <TaskCardBody
              task={activeTask}
              canEdit={false}
              showAssignSelf={false}
              onAssignSelf={() => {}}
              assigning={false}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
