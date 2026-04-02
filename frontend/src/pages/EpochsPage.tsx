import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock, Target, Rocket } from 'lucide-react'
import { epochsApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { isEndDateAfterStart, isValidDateInputYmd } from '../lib/dateValidation'
import { useUIStore } from '../stores/uiStore'
import { invalidateProjectScopedData } from '../lib/invalidateProjectQueries'

function EpochCard({ epoch, projectId }: { epoch: any; projectId: string }) {
  const qc = useQueryClient()
  const [showRelease, setShowRelease] = useState(false)
  const [releaseForm, setReleaseForm] = useState({ name: '', version_tag: '', description: '' })

  const releaseMutation = useMutation({
    mutationFn: () => epochsApi.createRelease(projectId, epoch.id, releaseForm as any).then(r => r.data),
    onSuccess: () => {
      invalidateProjectScopedData(qc, projectId)
      setShowRelease(false)
    },
  })

  const statusColor: Record<string, string> = {
    active: 'border-l-green-500',
    planning: 'border-l-yellow-500',
    completed: 'border-l-blue-500',
  }

  return (
    <div className={`card p-5 border-l-4 ${statusColor[epoch.status] || 'border-l-slate-300 dark:border-l-slate-600'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-slate-900 dark:text-white">{epoch.name}</h3>
            <StatusBadge status={epoch.status} />
          </div>
          {epoch.goals && <p className="text-slate-400 text-sm line-clamp-2">{epoch.goals}</p>}
        </div>
        <div className="ml-4 text-right shrink-0">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{epoch.progress || 0}%</div>
          <div className="text-xs text-slate-400">{epoch.completed_task_count}/{epoch.task_count} задач</div>
          <div className="mt-2">
            <Link to={`../epochs/${epoch.id}/pass`} className="btn-secondary text-xs py-1 inline-flex items-center gap-1">
              Проходить
            </Link>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${epoch.progress || 0}%` }} />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {epoch.start_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{format(new Date(epoch.start_date), 'd MMM', { locale: ru })} – {epoch.end_date ? format(new Date(epoch.end_date), 'd MMMM yyyy', { locale: ru }) : '?'}</span>}
        </div>
        {epoch.status !== 'completed' && (
          <button className="btn-secondary text-xs py-1 flex items-center gap-1" onClick={() => setShowRelease(true)}>
            <Rocket className="w-3 h-3" /> Релиз
          </button>
        )}
      </div>

      {showRelease && (
        <div className="mt-3 border-t border-slate-200 dark:border-slate-600 pt-3 space-y-2">
          <input className="input text-xs" placeholder="Название релиза" value={releaseForm.name} onChange={e => setReleaseForm(f => ({ ...f, name: e.target.value }))} />
          <input className="input text-xs" placeholder="Тег версии (например v1.0.0)" value={releaseForm.version_tag} onChange={e => setReleaseForm(f => ({ ...f, version_tag: e.target.value }))} />
          <textarea className="input text-xs resize-none" rows={2} placeholder="Заметки к релизу" value={releaseForm.description} onChange={e => setReleaseForm(f => ({ ...f, description: e.target.value }))} />
          <div className="flex gap-2">
            <button className="btn-secondary text-xs py-1" onClick={() => setShowRelease(false)}>Отмена</button>
            <button className="btn-primary text-xs py-1" onClick={() => releaseMutation.mutate()} disabled={!releaseForm.name || !releaseForm.version_tag}>Создать релиз</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function EpochsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', goals: '', start_date: '', end_date: '', status: 'planning' })

  const { data: epochs = [], isLoading } = useQuery({
    queryKey: ['epochs', projectId],
    queryFn: () => epochsApi.list(projectId!).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      epochsApi.create(projectId!, payload as any).then(r => r.data),
    onSuccess: () => {
      invalidateProjectScopedData(qc, projectId)
      setShowNew(false)
      setForm({ name: '', goals: '', start_date: '', end_date: '', status: 'planning' })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail
      const text = typeof msg === 'string' ? msg : Array.isArray(msg) ? msg.map((m: any) => m.msg).join(', ') : 'Не удалось создать спринт'
      addToast({ type: 'error', title: text })
    },
  })

  const submitNewEpoch = () => {
    if (!form.name.trim()) return
    if (form.start_date && !isValidDateInputYmd(form.start_date)) {
      addToast({ type: 'error', title: 'Проверьте дату начала' })
      return
    }
    if (form.end_date && !isValidDateInputYmd(form.end_date)) {
      addToast({ type: 'error', title: 'Проверьте дату окончания' })
      return
    }
    if (!isEndDateAfterStart(form.start_date, form.end_date)) {
      addToast({ type: 'error', title: 'Дата окончания не может быть раньше даты начала' })
      return
    }
    const payload = {
      name: form.name.trim(),
      goals: form.goals.trim() || undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      status: form.status,
    }
    createMutation.mutate(payload)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Target className="w-6 h-6 text-indigo-400" />Спринты</h1>
          <p className="text-slate-400 text-sm mt-0.5">Спринтов: {epochs.length}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>
          <Plus className="w-4 h-4" /> Новый спринт
        </button>
      </div>

      {showNew && (
        <div className="card p-5 mb-4 border-indigo-500">
          <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Новый спринт</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="label">Название</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Цели</label>
              <textarea className="input resize-none" rows={2} value={form.goals} onChange={e => setForm(f => ({ ...f, goals: e.target.value }))} />
            </div>
            <div>
              <label className="label">Дата начала</label>
              <input type="date" className="input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="label">Дата окончания</label>
              <input type="date" className="input" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="btn-secondary" onClick={() => setShowNew(false)}>Отмена</button>
            <button className="btn-primary" onClick={submitNewEpoch} disabled={!form.name.trim() || createMutation.isPending}>Создать спринт</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="card h-32 animate-pulse" />)}</div>
      ) : epochs.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><Target className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Пока нет спринтов</p></div>
      ) : (
        <div className="space-y-3">
          {(epochs as any[]).map(epoch => <EpochCard key={epoch.id} epoch={epoch} projectId={projectId!} />)}
        </div>
      )}
    </div>
  )
}
