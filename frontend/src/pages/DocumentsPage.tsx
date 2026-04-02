import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Search } from 'lucide-react'
import { documentsApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import type { Document } from '../types'

export default function DocumentsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const { data: docs = [], isLoading, isError } = useQuery({
    queryKey: ['docs', projectId],
    queryFn: () => documentsApi.list(projectId!).then((r) => r.data as Document[]),
    enabled: !!projectId,
  })
  const createDoc = useMutation({
    mutationFn: () =>
      documentsApi
        .create(projectId!, {
          title,
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
          visibility: 'public',
          status: 'draft',
        })
        .then((r) => r.data),
    onSuccess: () => {
      setTitle('')
      qc.invalidateQueries({ queryKey: ['docs', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      addToast({ type: 'success', title: 'Документ создан' })
    },
    onError: () => {
      addToast({ type: 'error', title: 'Не удалось создать документ' })
    },
  })

  if (!projectId) return null
  const filteredDocs = query.trim()
    ? docs.filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
    : docs

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Документы</h1>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Поиск по документам…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="card p-4 mb-4 flex gap-2">
        <input
          className="input"
          placeholder="Название нового документа"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn-primary shrink-0" disabled={!title.trim() || createDoc.isPending} onClick={() => createDoc.mutate()}>
          {createDoc.isPending ? 'Создание…' : 'Создать'}
        </button>
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
              <Link
                to={`/projects/${projectId}/documents/${d.id}`}
                className="card p-4 flex items-center gap-3 hover:border-slate-600 transition-colors"
              >
                <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                <span className="text-slate-900 dark:text-white font-medium flex-1">{d.title}</span>
                <StatusBadge status={d.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
