import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { cabinetApi } from '../api'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import type { CabinetUser } from '../types'

export default function CabinetUserPage() {
  const { userId } = useParams<{ userId: string }>()
  const { addToast } = useUIStore()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['cabinet', 'user', userId],
    queryFn: () => cabinetApi.user(Number(userId!)).then((r) => r.data as CabinetUser),
    enabled: !!userId,
  })

  useEffect(() => {
    if (isError) addToast({ type: 'error', title: 'Не удалось загрузить профиль' })
  }, [isError, addToast])

  if (!userId) return null
  if (isLoading) return <div className="p-6 text-slate-400">Загрузка…</div>
  if (!profile || isError) return <div className="p-6 text-red-300">Профиль не найден</div>

  const isMe = user?.id === String(profile.id)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Кабинет разработчика</h1>
          <div className="text-sm text-slate-500 mt-1">{profile.role}</div>
        </div>
        {isMe && (
          <button type="button" className="btn-secondary" onClick={() => navigate('/cabinet')}>
            Редактировать свой кабинет
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Имя</div>
        <div className="text-slate-100">{profile.name}</div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Git репозиторий</div>
        {profile.git_repo_url ? (
          <a className="text-indigo-300 hover:text-indigo-200 underline" href={profile.git_repo_url} target="_blank" rel="noreferrer">
            {profile.git_repo_url}
          </a>
        ) : (
          <div className="text-xs text-slate-500">Git не задан</div>
        )}
      </div>

      <div className="card p-4">
        <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Стек</div>
        {profile.techs.length ? (
          <div className="flex flex-wrap gap-2">
            {profile.techs.map((t) => (
              <span key={t} className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-200">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Теги стека пока не указаны.</div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Подсказка: в своём кабинете можно указать стек и затем подбирать кандидатов по пересечению технологий.
        <Link to="/cabinet" className="text-indigo-300 underline ml-2">
          Перейти в кабинет
        </Link>
      </div>
    </div>
  )
}

