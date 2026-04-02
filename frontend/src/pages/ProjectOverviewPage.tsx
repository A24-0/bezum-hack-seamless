import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle, Clock, FileText, Video, GitPullRequest, TrendingUp } from 'lucide-react'
import { projectsApi, epochsApi, tasksApi, documentsApi, meetingsApi } from '../api'
import { ProgressRing } from '../components/common/ProgressRing'
import { StatusBadge } from '../components/common/StatusBadge'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'

function StatCard({ icon: Icon, label, value, color = 'text-indigo-400' }: any) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`p-2 rounded-lg bg-slate-700 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-slate-900 dark:text-white">{value}</div>
        <div className="text-xs text-slate-400">{label}</div>
      </div>
    </div>
  )
}

export default function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>()

  const { data: project } = useQuery({ queryKey: ['project', projectId], queryFn: () => projectsApi.get(projectId!).then(r => r.data) })
  const { data: epochs = [] } = useQuery({ queryKey: ['epochs', projectId], queryFn: () => epochsApi.list(projectId!).then(r => r.data) })
  const { data: tasks = [] } = useQuery({ queryKey: ['tasks', projectId], queryFn: () => tasksApi.list(projectId!).then(r => r.data) })
  const { data: docs = [] } = useQuery({ queryKey: ['docs', projectId], queryFn: () => documentsApi.list(projectId!).then(r => r.data) })
  const { data: meetings = [] } = useQuery({ queryKey: ['meetings', projectId], queryFn: () => meetingsApi.list(projectId!).then(r => r.data) })

  const doneTasks = (tasks as any[]).filter(t => t.status === 'done').length
  const inProgressTasks = (tasks as any[]).filter(t => t.status === 'in_progress').length
  const progress = tasks.length > 0 ? Math.round(doneTasks / tasks.length * 100) : 0
  const activeEpoch = (epochs as any[]).find(e => e.status === 'active')
  const upcomingMeetings = (meetings as any[]).filter(m => m.status === 'scheduled' || m.status === 'scheduling').slice(0, 3)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{project?.name}</h1>
          <p className="text-slate-400 mt-1">{project?.description}</p>
          <div className="flex items-center gap-3 mt-3">
            <StatusBadge status={project?.status ?? 'active'} />
            {project?.gitlab_repo_url && (
              <a href={project.gitlab_repo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <GitPullRequest className="w-3 h-3" /> GitLab
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProgressRing progress={progress} size={72} />
          <div className="text-sm">
            <div className="text-slate-900 dark:text-white font-semibold">{progress}% готово</div>
            <div className="text-slate-400">{doneTasks}/{tasks.length} задач</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={CheckCircle} label="Задач выполнено" value={doneTasks} color="text-green-400" />
        <StatCard icon={TrendingUp} label="В работе" value={inProgressTasks} color="text-yellow-400" />
        <StatCard icon={FileText} label="Документов" value={docs.length} color="text-blue-400" />
        <StatCard icon={Video} label="Встреч" value={meetings.length} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Sprint */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-indigo-400" />Активный спринт</h2>
            <Link to="../epochs" className="text-xs text-indigo-400 hover:text-indigo-300">Все спринты</Link>
          </div>
          {activeEpoch ? (
            <div>
              <div className="font-medium text-slate-900 dark:text-white">{activeEpoch.name}</div>
              <p className="text-slate-400 text-xs mt-1 line-clamp-2">{activeEpoch.goals}</p>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Прогресс</span>
                  <span>{activeEpoch.progress || 0}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${activeEpoch.progress || 0}%` }} />
                </div>
              </div>
              {activeEpoch.end_date && (
                <div className="text-xs text-slate-400 mt-2">
                  Окончание: {format(new Date(activeEpoch.end_date), 'd MMMM yyyy', { locale: ru })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Нет активного спринта</p>
          )}
        </div>

        {/* Upcoming Meetings */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2"><Video className="w-4 h-4 text-purple-400" />Ближайшие встречи</h2>
            <Link to="../meetings" className="text-xs text-indigo-400 hover:text-indigo-300">Все встречи</Link>
          </div>
          {upcomingMeetings.length === 0 ? (
            <p className="text-slate-400 text-sm">Нет запланированных встреч</p>
          ) : (
            <div className="space-y-2">
              {upcomingMeetings.map((m: any) => (
                <Link key={m.id} to={`../meetings/${m.id}`} className="flex items-center justify-between hover:bg-slate-700 rounded p-2 transition-colors">
                  <div>
                    <div className="text-sm text-slate-900 dark:text-white">{m.title}</div>
                    {m.scheduled_at && (
                      <div className="text-xs text-slate-400">{format(new Date(m.scheduled_at), 'd MMM, HH:mm', { locale: ru })}</div>
                    )}
                  </div>
                  <StatusBadge status={m.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent tasks */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900 dark:text-white text-sm">Последние задачи</h2>
          <Link to="../kanban" className="text-xs text-indigo-400 hover:text-indigo-300">К доске</Link>
        </div>
        <div className="space-y-1">
          {(tasks as any[]).slice(0, 5).map((task: any) => (
            <div key={task.id} className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-700 rounded">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-slate-400 text-xs shrink-0">#{task.id}</span>
                <span className="text-sm text-slate-200 truncate">{task.title}</span>
              </div>
              <StatusBadge status={task.status} className="ml-2 shrink-0" />
            </div>
          ))}
          {tasks.length === 0 && <p className="text-slate-400 text-sm">Пока нет задач</p>}
        </div>
      </div>
    </div>
  )
}
