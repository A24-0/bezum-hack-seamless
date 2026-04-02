import { useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { documentsApi, tasksApi, meetingsApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useEffect, useMemo, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import type { Document, Task } from '../types'

export default function DocumentEditorPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['doc', projectId, docId],
    queryFn: () => documentsApi.get(projectId!, docId!).then((r) => r.data as Document),
    enabled: !!projectId && !!docId,
  })
  const { data: versions = [] } = useQuery({
    queryKey: ['docVersions', projectId, docId],
    queryFn: () => documentsApi.versions(projectId!, docId!).then((r) => r.data as any[]),
    enabled: !!projectId && !!docId,
  })
  const { data: linkedTasks = [] } = useQuery({
    queryKey: ['docTasks', projectId, docId],
    queryFn: () => documentsApi.linkedTasks(projectId!, docId!).then((r) => r.data as any[]),
    enabled: !!projectId && !!docId,
  })
  const { data: linkedMeetings = [] } = useQuery({
    queryKey: ['docMeetings', projectId, docId],
    queryFn: () => meetingsApi.list(projectId!).then((r) => (r.data as any[]).filter((m) => Number(m.task_id) > 0)),
    enabled: !!projectId && !!docId,
  })
  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!).then((r) => r.data as Task[]),
    enabled: !!projectId,
  })
  const [taskToLink, setTaskToLink] = useState('')
  const [selectedMeetingId, setSelectedMeetingId] = useState('')
  const initialText = useMemo(() => {
    if (!doc?.content) return ''
    return JSON.stringify(doc.content, null, 2)
  }, [doc])
  const [text, setText] = useState('')
  useEffect(() => {
    setText(initialText)
  }, [initialText])

  const saveVersion = useMutation({
    mutationFn: () => {
      let content: Record<string, unknown>
      try {
        content = JSON.parse(text || '{}')
      } catch {
        content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
      }
      return documentsApi
        .saveVersion(
          projectId!,
          docId!,
          {
            content,
            change_summary: 'Редактирование в интерфейсе',
            ...(selectedMeetingId ? { meeting_id: Number(selectedMeetingId) } : {}),
          } as any
        )
        .then((r) => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc', projectId, docId] })
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      addToast({ type: 'success', title: 'Версия документа сохранена' })
    },
    onError: () => {
      addToast({ type: 'error', title: 'Не удалось сохранить документ' })
    },
  })

  const approveDoc = useMutation({
    mutationFn: () => documentsApi.approve(projectId!, docId!).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc', projectId, docId] })
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      addToast({ type: 'success', title: 'Документ утвержден' })
    },
    onError: () => {
      addToast({ type: 'error', title: 'Ошибка утверждения' })
    },
  })
  const linkTask = useMutation({
    mutationFn: () => documentsApi.linkTask(projectId!, docId!, taskToLink),
    onSuccess: () => {
      setTaskToLink('')
      qc.invalidateQueries({ queryKey: ['docTasks', projectId, docId] })
      addToast({ type: 'success', title: 'Задача привязана к документу' })
    },
  })

  if (!projectId || !docId) return null

  return (
    <div className="p-6 max-w-4xl">
      <Link
        to={`/projects/${projectId}/documents`}
        className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Назад к документам
      </Link>
      {isLoading ? (
        <p className="text-slate-400">Загрузка...</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить документ.</div>
      ) : doc ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{doc.title}</h1>
            <StatusBadge status={doc.status ?? 'draft'} />
          </div>
          <div className="card p-4 text-slate-300 text-sm space-y-3">
            <textarea
              className="input resize-none font-mono text-xs"
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => saveVersion.mutate()} disabled={saveVersion.isPending}>
                {saveVersion.isPending ? 'Сохранение...' : 'Сохранить версию'}
              </button>
              <button className="btn-secondary" onClick={() => approveDoc.mutate()} disabled={approveDoc.isPending}>
                {approveDoc.isPending ? 'Утверждение...' : 'Утвердить'}
              </button>
            </div>
          </div>
          </div>
          <div className="space-y-3">
            <div className="card p-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Связанные задачи</h3>
              <div className="flex gap-2 mb-2">
                <select className="bg-slate-800 border border-slate-600 rounded text-xs px-2 py-1 text-slate-200 w-full" value={taskToLink} onChange={(e) => setTaskToLink(e.target.value)}>
                  <option value="">Выберите задачу...</option>
                  {allTasks.map((t) => <option key={t.id} value={String(t.id)}>#{t.id} {t.title}</option>)}
                </select>
                <button className="btn-secondary text-xs" onClick={() => linkTask.mutate()} disabled={!taskToLink}>Привязать</button>
              </div>
              <div className="text-xs text-slate-400 mb-2">Быстрые упоминания (автосвязь через #id)</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {allTasks.slice(0, 8).map((t) => (
                  <button
                    key={t.id}
                    className="btn-secondary text-xs py-1"
                    onClick={() => setText((prev) => `${prev}\n#${t.id} ${t.title}`)}
                  >
                    #{t.id}
                  </button>
                ))}
              </div>
              <ul className="space-y-1">
                {linkedTasks.map((t: any) => (
                  <li key={t.id} className="text-xs text-slate-300">#{t.id} {t.title}</li>
                ))}
                {linkedTasks.length === 0 && <li className="text-xs text-slate-500">Пока нет связанных задач</li>}
              </ul>
            </div>
            <div className="card p-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">История версий</h3>
              <ul className="space-y-1 max-h-40 overflow-auto">
                {versions.map((v: any) => (
                  <li key={v.id} className="text-xs text-slate-300">
                    v{v.version_num} - {v.change_summary || 'Без описания'}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Связанные встречи</h3>
              <select
                className="bg-slate-800 border border-slate-600 rounded text-xs px-2 py-1 text-slate-200 w-full mb-2"
                value={selectedMeetingId}
                onChange={(e) => {
                  const id = e.target.value
                  setSelectedMeetingId(id)
                  const selected = linkedMeetings.find((m: any) => String(m.id) === id)
                  if (selected?.summary) {
                    setText((prev) => `${prev}\n\nСаммари встречи (${selected.title}):\n${selected.summary}`)
                  }
                }}
              >
                <option value="">Привязать встречу к версии (опционально)</option>
                {linkedMeetings.map((m: any) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.title}
                  </option>
                ))}
              </select>
              <ul className="space-y-1 max-h-40 overflow-auto">
                {linkedMeetings
                  .filter((m: any) => linkedTasks.some((t: any) => Number(t.id) === Number(m.task_id)))
                  .slice(0, 8)
                  .map((m: any) => (
                    <li key={m.id} className="text-xs text-slate-300">{m.title}</li>
                  ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-slate-400">Документ не найден.</p>
      )}
    </div>
  )
}
