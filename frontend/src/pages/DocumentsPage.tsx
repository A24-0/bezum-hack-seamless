import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Paperclip, Plus, Search, Trash2, Upload } from 'lucide-react'
import { documentsApi, tasksApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useMemo, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import type { Document, Task } from '../types'
import { extractDocBlocks, makeDocSummary, truncate } from '../lib/docPreview'

export default function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const [query, setQuery] = useState('')
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newFile, setNewFile] = useState<File | null>(null)
  const [taskQuery, setTaskQuery] = useState('')
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const { data: docs = [], isLoading, isError } = useQuery({
    queryKey: ['docs', projectId],
    queryFn: () => documentsApi.list(projectId!).then((r) => r.data as Document[]),
    enabled: !!projectId,
  })
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => tasksApi.list(projectId!).then((r) => r.data as Task[]),
    enabled: !!projectId && createOpen,
  })
  const deleteDoc = useMutation({
    mutationFn: (id: string) => documentsApi.delete(projectId!, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      addToast({ type: 'success', title: 'Документ удалён' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось удалить' }),
  })

  const createDocWithUpload = useMutation({
    mutationFn: async () => {
      if (!newFile) throw new Error('Файл не выбран')
      if (!newTitle.trim()) throw new Error('Название документа пустое')

      const created = await documentsApi
        .create(projectId!, {
          title: newTitle.trim(),
          // Backend может импортировать контент из attachment для текстовых форматов,
          // но TipTap JSON для создания обязателен.
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          visibility: 'public',
          status: 'draft',
        })
        .then((r) => r.data as Document)

      await documentsApi.uploadAttachment(projectId!, String(created.id), newFile)

      // Optional task links
      for (const taskId of selectedTaskIds) {
        await documentsApi.linkTask(projectId!, String(created.id), taskId)
      }

      return created
    },
    onSuccess: (created) => {
      setCreateOpen(false)
      setNewTitle('')
      setNewFile(null)
      setSelectedTaskIds([])
      setTaskQuery('')
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      addToast({ type: 'success', title: 'Документ создан' })
      navigate(`/projects/${projectId}/documents/${created.id}`)
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      addToast({
        type: 'error',
        title: typeof detail === 'string' && detail.trim() ? `Не удалось создать: ${detail}` : 'Не удалось создать документ',
      })
    },
  })

  if (!projectId) return null
  const filteredDocs = query.trim()
    ? docs.filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
    : docs

  const filteredTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || String(t.id).includes(q))
  }, [tasks, taskQuery])

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Документы</h1>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Поиск по документам…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-primary shrink-0 inline-flex items-center gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="w-4 h-4" />
            Добавить
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить документы. Обновите страницу.</div>
      ) : filteredDocs.length === 0 ? (
        <div className="card p-6 text-center text-slate-400">
          {query ? 'Нет документов по запросу.' : 'Пока нет документов. Создайте первый.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredDocs.map((d) => (
            <li key={d.id}>
              <div
                className="card p-4 flex items-center gap-3 hover:border-slate-600 transition-colors group cursor-pointer"
                onClick={() => setPreviewDoc(d)}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                  <span className="text-slate-900 dark:text-white font-medium truncate">{d.title}</span>
                </div>
                {d.attachments && d.attachments.length > 0 && (
                  <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0" title="Вложения">
                    <Paperclip className="w-3.5 h-3.5" />
                    {d.attachments.length}
                  </span>
                )}
                <StatusBadge status={d.status} size="sm" />
                <button
                  type="button"
                  className="btn-ghost p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Удалить"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    if (window.confirm(`Удалить документ «${d.title}»?`)) deleteDoc.mutate(String(d.id))
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[190] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateOpen(false)} />
          <div className="relative w-full sm:max-w-2xl card p-4 max-h-[80vh] overflow-auto">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-500">Создание документа</div>
                <div className="text-lg font-bold text-slate-900 dark:text-white truncate">Добавить новый документ</div>
              </div>
              <button type="button" className="btn-ghost p-2" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs text-slate-400 mb-2">Название (обязательно)</div>
                <input
                  className="input w-full"
                  placeholder="Например: Требования к ТЗ / Анализ встречи…"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>

              <div>
                <div className="text-xs text-slate-400 mb-2">Файл (обязательно)</div>
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null
                      setNewFile(f)
                      e.target.value = ''
                    }}
                    accept=".txt,.md,.json,.csv,.yaml,.yml,.xml,.pdf,.doc,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.html,.htm,.zip"
                  />
                  <span className="btn-secondary text-xs inline-flex items-center gap-1">
                    <Upload className="w-3.5 h-3.5" />
                    {newFile ? 'Файл выбран' : 'Выбрать файл'}
                  </span>
                  <span className="text-slate-500 truncate">{newFile?.name || ''}</span>
                </label>
                <div className="text-[11px] text-slate-500 mt-1">
                  Для “анализа/суть документа” лучше загружать текстовые форматы (txt/md/html/json/yaml/csv/xml).
                </div>
              </div>

              <div className="card p-3 bg-slate-800/20 border-slate-700/60">
                <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Связи (необязательно)</div>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    className="input pl-9"
                    placeholder="Поиск задач по названию или #id…"
                    value={taskQuery}
                    onChange={(e) => setTaskQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-48 overflow-auto space-y-1">
                  {filteredTasks.length === 0 && <div className="text-xs text-slate-500">Нет задач для выбора.</div>}
                  {filteredTasks.map((t) => {
                    const checked = selectedTaskIds.includes(String(t.id))
                    return (
                      <label key={t.id} className="flex items-center justify-between gap-2 text-xs text-slate-200 bg-slate-900/10 rounded px-2 py-1 cursor-pointer">
                        <span className="truncate">
                          #{t.id} {t.title}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const v = String(t.id)
                            setSelectedTaskIds((prev) => {
                              if (e.target.checked) return Array.from(new Set([...prev, v]))
                              return prev.filter((x) => x !== v)
                            })
                          }}
                        />
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button type="button" className="btn-ghost" onClick={() => setCreateOpen(false)} disabled={createDocWithUpload.isPending}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!newTitle.trim() || !newFile || createDocWithUpload.isPending}
                  onClick={() => createDocWithUpload.mutate()}
                >
                  {createDocWithUpload.isPending ? 'Создание…' : 'Создать и открыть'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {previewDoc && (
        <DocPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onOpenAt={(focusIndex) => {
            setPreviewDoc(null)
            navigate(`/projects/${projectId}/documents/${previewDoc.id}?focus=${focusIndex}`)
          }}
          onOpen={() => {
            setPreviewDoc(null)
            navigate(`/projects/${projectId}/documents/${previewDoc.id}`)
          }}
        />
      )}
    </div>
  )
}

function DocPreviewModal({
  doc,
  onClose,
  onOpen,
  onOpenAt,
}: {
  doc: Document
  onClose: () => void
  onOpen: () => void
  onOpenAt: (focusIndex: number) => void
}) {
  const blocks = extractDocBlocks(doc.content)
  const summary = makeDocSummary(blocks)
  const shown = blocks.slice(0, 12)

  return (
    <div className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl card p-4 max-h-[80vh] overflow-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="text-sm text-slate-500">Документ</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white truncate">{doc.title}</div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
              <span>{doc.status}</span>
              {doc.epoch_id ? <span className="text-slate-500">• epoch #{doc.epoch_id}</span> : null}
            </div>
          </div>
          <button type="button" className="btn-ghost p-2" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="border border-slate-700 rounded p-3 mb-4 bg-slate-800/30">
          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Краткая сводка</div>
          <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans">{summary}</pre>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">Части документа</div>
          {shown.length === 0 ? (
            <div className="text-xs text-slate-500">В документе пока нет распознаваемых частей.</div>
          ) : (
            <div className="space-y-2">
              {shown.map((b) => (
                <div key={`${b.type}-${b.index}`} className="border border-slate-700 rounded p-3 bg-slate-800/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs text-slate-500">{b.type === 'heading' ? 'Заголовок' : 'Абзац'} #{b.index}</div>
                    <button type="button" className="btn-secondary text-xs" onClick={() => onOpenAt(b.index)}>
                      Перейти
                    </button>
                  </div>
                  <div className="text-sm text-slate-200 mt-2">{truncate(b.text, 220)}</div>
                </div>
              ))}
              {blocks.length > shown.length && (
                <div className="text-xs text-slate-500">Показаны первые {shown.length} частей из {blocks.length}.</div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button type="button" className="btn-primary" onClick={onOpen}>
            Открыть документ полностью
          </button>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
