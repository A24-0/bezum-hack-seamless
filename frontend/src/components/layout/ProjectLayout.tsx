import { Outlet, NavLink, useParams } from 'react-router-dom'
import { LayoutDashboard, Clock, Trello, FileText, Video, GitPullRequest, Users, Layers, Link2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '../../api'
import { cn, STATUS_LABELS } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { projectMemberRole } from '../../lib/projectPermissions'
import ProjectOnboardingGuide from '../common/ProjectOnboardingGuide'

const navItems = [
  { to: 'overview', icon: LayoutDashboard, label: 'Обзор' },
  { to: 'epochs', icon: Clock, label: 'Спринты' },
  { to: 'kanban', icon: Trello, label: 'Канбан' },
  { to: 'documents', icon: FileText, label: 'Документы' },
  { to: 'meetings', icon: Video, label: 'Встречи' },
  { to: 'cicd', icon: GitPullRequest, label: 'CI/CD' },
  { to: 'relations', icon: Link2, label: 'Связи' },
  { to: 'members', icon: Users, label: 'Участники' },
]

export default function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user } = useAuthStore()
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId!).then(r => r.data),
    enabled: !!projectId,
  })
  const { data: members = [] } = useQuery({
    queryKey: ['projectMembers', projectId],
    queryFn: () => projectsApi.members(projectId!).then((r) => r.data),
    enabled: !!projectId,
  })
  const devInProject = projectMemberRole(user, members) === 'developer'

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-slate-200 dark:bg-slate-800 dark:border-slate-700 flex flex-col sticky top-14 h-[calc(100vh-56px)]">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm truncate">{project?.name || '...'}</span>
          </div>
          {project && (
            <div
              className={cn(
                'mt-1 text-xs font-medium',
                project.status === 'active'
                  ? 'text-green-400'
                  : project.status === 'completed'
                    ? 'text-blue-400'
                    : project.status === 'draft'
                      ? 'text-amber-400/90'
                      : 'text-slate-400'
              )}
            >
              {STATUS_LABELS[project.status] ?? project.status}
            </div>
          )}
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`project-nav-${to}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors w-full',
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {to === 'kanban' && devInProject && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 shrink-0">
                  Dev
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900">
        <Outlet />
      </main>

      <ProjectOnboardingGuide />
    </div>
  )
}
