import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, FileText, Paperclip, Trash2, Upload } from 'lucide-react'
import { aiApi, documentsApi, tasksApi, meetingsApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import type { Document, DocumentAttachment, Task } from '../types'
import { extractDocBlocks, extractDocPlainText, truncate } from '../lib/docPreview'
import { VOICE_EDITOR_EVENT, type VoiceEditorDetail } from '../lib/voiceCommands'

function downloadBlob(blob: Blob, filename: string) {
  const u = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = u
  a.download = filename
  a.click()
  URL.revokeObjectURL(u)
}

export default function DocumentEditorPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  const focusIndexRaw = searchParams.get('focus')
  const focusIndex = focusIndexRaw ? Number(focusIndexRaw) : null

  const blocks = useMemo(() => extractDocBlocks(doc?.content), [doc?.content])
  const blockRefs = useMemo(() => new Map<number, HTMLDivElement>(), [])

  const plainTextForSummary = useMemo(() => extractDocPlainText(doc?.content), [doc?.content])
  const essenceTextTrimmed = (plainTextForSummary || '').trim()
  const hasTextForEssence = essenceTextTrimmed.length > 0

  /** При смене документа, версии или текста с сервера (в т.ч. после загрузки файла) — новая сводка и блоки из doc.content */
  const {
    data: essenceSummary,
    isPending: essencePending,
    isFetching: essenceFetching,
    isError: essenceIsError,
  } = useQuery({
    queryKey: ['docEssence', projectId, docId, doc?.updated_at, essenceTextTrimmed.slice(0, 4000)],
    queryFn: () => aiApi.summarizeDocument(essenceTextTrimmed).then((r) => r.data.summary),
    enabled: !!projectId && !!docId && !!doc && hasTextForEssence,
    staleTime: 0,
  })

  useEffect(() => {
    if (focusIndex === null || !Number.isFinite(focusIndex)) return
    const el = blockRefs.get(focusIndex)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusIndex, blocks, blockRefs])
  const initialText = useMemo(() => {
    if (!doc?.content) return ''
    return extractDocPlainText(doc.content)
  }, [doc])
  const [text, setText] = useState('')
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    setText(initialText)
  }, [initialText])

  const saveVersion = useMutation({
    mutationFn: () => {
      const raw = (text || '').trim()
      const paragraphs = raw ? raw.split(/\n{2,}/g).map((p) => p.trim()).filter(Boolean) : []
      const content =
        paragraphs.length > 0
          ? {
              type: 'doc',
              content: paragraphs.map((p) => ({
                type: 'paragraph',
                content: [{ type: 'text', text: p }],
              })),
            }
          : { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] }
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

  useEffect(() => {
    const onVoice = (e: Event) => {
      const ce = e as CustomEvent<VoiceEditorDetail>
      const d = ce.detail
      if (!d) return
      if (d.action === 'save') saveVersion.mutate()
      if (d.action === 'focus') bodyTextareaRef.current?.focus()
      if (d.action === 'append' && d.text?.trim()) {
        const add = d.text.trim()
        setText((t) => {
          if (!t.trim()) return add
          return `${t.trimEnd()}\n\n${add}`
        })
        queueMicrotask(() => bodyTextareaRef.current?.focus())
      }
    }
    window.addEventListener(VOICE_EDITOR_EVENT, onVoice)
    return () => window.removeEventListener(VOICE_EDITOR_EVENT, onVoice)
  }, [saveVersion])

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

  const uploadFile = useMutation({
    mutationFn: (file: File) => documentsApi.uploadAttachment(projectId!, docId!, file).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc', projectId, docId] })
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      addToast({ type: 'success', title: 'Файл загружен' })
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      // Бэкенд возвращает detail типа:
      // - "File too large"
      // - "unsupported extension: .ext"
      const title =
        typeof detail === 'string' && detail.trim()
          ? `Не удалось загрузить файл: ${detail}`
          : 'Не удалось загрузить файл (размер или тип)'
      addToast({ type: 'error', title })
    },
  })

  const removeAttachment = useMutation({
    mutationFn: (attachmentId: string) => documentsApi.deleteAttachment(projectId!, docId!, attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc', projectId, docId] })
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      addToast({ type: 'success', title: 'Вложение удалено' })
    },
  })

  const exportTxt = useMutation({
    mutationFn: () => documentsApi.exportPlain(projectId!, docId!).then((r) => r.data),
    onSuccess: (blob) => {
      const name = doc?.title ? `${doc.title.replace(/[^\w\-_.\s]/g, '_').slice(0, 80)}.txt` : 'document.txt'
      downloadBlob(blob, name)
      addToast({ type: 'info', title: 'Загрузка TXT начата' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось экспортировать' }),
  })

  const deleteDoc = useMutation({
    mutationFn: () => documentsApi.delete(projectId!, docId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      addToast({ type: 'success', title: 'Документ удалён' })
      navigate(`/projects/${projectId}/documents`)
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось удалить документ' }),
  })

  const downloadAttachment = async (att: DocumentAttachment) => {
    try {
      const res = await documentsApi.downloadAttachment(projectId!, docId!, String(att.id))
      downloadBlob(res.data, att.original_filename)
    } catch {
      addToast({ type: 'error', title: 'Не удалось скачать файл' })
    }
  }

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
            <div className="border border-slate-700 rounded p-3 bg-slate-800/20">
              <div className="text-xs font-semibold text-slate-200 mb-2">Суть документа</div>
              {!hasTextForEssence && (
                <div className="text-xs text-slate-500 mb-3">
                  В документе пока нет текста для анализа (загрузите файл с текстом или введите текст и сохраните версию).
                </div>
              )}
              {hasTextForEssence && essenceIsError && (
                <div className="text-xs text-red-300 mb-3">Не удалось построить сводку по документу.</div>
              )}
              {hasTextForEssence && !essenceIsError && !essenceSummary && (essencePending || essenceFetching) && (
                <div className="text-xs text-slate-500 mb-3">Анализируем документ…</div>
              )}
              {hasTextForEssence && !essenceIsError && essenceSummary && (
                <pre className="text-sm text-slate-200 whitespace-pre-wrap font-sans mb-3">{essenceSummary}</pre>
              )}
              {blocks.length === 0 ? (
                <div className="text-xs text-slate-500">Части документа не распознаны.</div>
              ) : (
                <div className="max-h-48 overflow-auto space-y-2 pr-1">
                  {blocks.slice(0, 40).map((b) => (
                    <div
                      key={`${b.type}-${b.index}`}
                      ref={(el) => {
                        if (!el) return
                        blockRefs.set(b.index, el)
                      }}
                      className={`cursor-pointer border rounded px-2 py-2 ${
                        focusIndex === b.index
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                          : 'border-slate-700 bg-slate-900/10 hover:border-slate-500 text-slate-200'
                      }`}
                      onClick={() =>
                        setSearchParams((sp) => {
                          const p = new URLSearchParams(sp)
                          p.set('focus', String(b.index))
                          return p
                        })
                      }
                      title="Клик = выделить часть"
                    >
                      <div className="text-[11px] text-slate-400">
                        {b.type === 'heading' ? 'Заголовок' : 'Абзац'} #{b.index}
                      </div>
                      <div className="text-sm mt-1">{truncate(b.text, 160)}</div>
                    </div>
                  ))}
                </div>
              )}
              {blocks.length > 40 && <div className="text-[11px] text-slate-500 mt-2">Показаны первые 40 частей.</div>}
            </div>
            <textarea
              ref={bodyTextareaRef}
              className="input resize-none text-sm"
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Введите текст документа. Сохраняется в документ как секции (разделяются пустой строкой)."
            />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => saveVersion.mutate()} disabled={saveVersion.isPending}>
                {saveVersion.isPending ? 'Сохранение...' : 'Сохранить версию'}
              </button>
              <button className="btn-secondary" onClick={() => approveDoc.mutate()} disabled={approveDoc.isPending}>
                {approveDoc.isPending ? 'Утверждение...' : 'Утвердить'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => exportTxt.mutate()}
                disabled={exportTxt.isPending}
              >
                <FileText className="w-4 h-4" />
                {exportTxt.isPending ? 'Экспорт…' : 'Скачать TXT'}
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  if (window.confirm('Удалить документ и все вложения?')) deleteDoc.mutate()
                }}
                disabled={deleteDoc.isPending}
              >
                <Trash2 className="w-4 h-4" />
                Удалить документ
              </button>
            </div>
          </div>
          </div>
          <div className="space-y-3">
            <div className="card p-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-indigo-400" />
                Вложения (PDF, XML, Office…)
              </h3>
              <label className="flex items-center gap-2 text-xs text-slate-400 mb-2 cursor-pointer">
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.xml,.txt,.md,.json,.csv,.doc,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.zip,.html,.yaml,.yml"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadFile.mutate(f)
                    e.target.value = ''
                  }}
                />
                <span className="btn-secondary text-xs inline-flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadFile.isPending ? 'Загрузка…' : 'Загрузить файл'}
                </span>
                <span className="text-slate-500">до ~26 МБ</span>
              </label>
              <ul className="space-y-1 max-h-48 overflow-auto">
                {(doc.attachments ?? []).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-xs text-slate-300 bg-slate-800/50 rounded px-2 py-1"
                  >
                    <span className="truncate flex-1" title={a.original_filename}>
                      {a.original_filename}
                    </span>
                    <span className="text-slate-500 shrink-0">{(a.size_bytes / 1024).toFixed(1)} КБ</span>
                    <button
                      type="button"
                      className="btn-ghost p-1 shrink-0"
                      title="Скачать"
                      onClick={() => downloadAttachment(a)}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      className="btn-ghost p-1 shrink-0 text-red-400"
                      title="Удалить"
                      onClick={() => {
                        if (window.confirm('Удалить вложение?')) removeAttachment.mutate(String(a.id))
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
                {(!doc.attachments || doc.attachments.length === 0) && (
                  <li className="text-xs text-slate-500">Пока нет файлов</li>
                )}
              </ul>
            </div>
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
