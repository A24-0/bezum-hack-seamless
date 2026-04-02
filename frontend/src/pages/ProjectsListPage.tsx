import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Layers, Users, Clock, GitBranch } from 'lucide-react'
import { projectsApi } from '../api'
import type { ProjectLifecycleStatus } from '../types'
import { useAuthStore } from '../stores/authStore'
import { ProgressRing } from '../components/common/ProgressRing'
import { StatusBadge } from '../components/common/StatusBadge'
import { cn } from '../lib/utils'

function NewProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<{
    name: string
    description: string
    gitlab_repo_url: string
    status: ProjectLifecycleStatus
  }>({ name: '', description: '', gitlab_repo_url: '', status: 'draft' })
  const mutation = useMutation({
    mutationFn: () => projectsApi.create(form as any).then(r => r.data),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      onClose()
      navigate(`/projects/${project.id}`)
    },
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Новый проект</h2>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
          <div>
            <label className="label">Название проекта *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Описание</label>
            <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className="label">Ссылка на GitHub</label>
            <input className="input" placeholder="https://github.com/org/repo (или owner/repo)" value={form.gitlab_repo_url} onChange={e => setForm(f => ({ ...f, gitlab_repo_url: e.target.value }))} />
          </div>
          <div>
            <label className="label">Статус проекта</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ProjectLifecycleStatus }))}
            >
              <option value="draft">Черновик</option>
              <option value="active">Активный</option>
              <option value="completed">Завершён</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button type="button" className="btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Создание...' : 'Создать проект'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ProjectsListPage() {
  const { user } = useAuthStore()
  const [showNew, setShowNew] = useState(false)
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then(r => r.data),
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Проекты</h1>
          <p className="text-slate-400 text-sm mt-0.5">{projects.length} проект(ов)</p>
        </div>
        {user?.role !== 'customer' && (
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" /> Новый проект
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse h-36" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Пока нет проектов</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project: any) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="card p-5 hover:border-indigo-500 transition-colors group block"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate group-hover:text-indigo-300 transition-colors">{project.name}</h3>
                  <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{project.description || 'Нет описания'}</p>
                </div>
                <ProgressRing progress={project.progress || 0} size={40} className="ml-3 shrink-0" />
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400">
                <StatusBadge status={project.status} />
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{project.member_count || 0}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{project.epoch_count || 0} спринтов</span>
                {project.gitlab_repo_url && <GitBranch className="w-3 h-3 text-indigo-400" />}
              </div>
            </Link>
          ))}
        </div>
      )}

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
