import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

const STORAGE_ENABLED_KEY = 'cabinet_onboarding_enabled'

function getOnboardingEnabled(): boolean {
  const v = localStorage.getItem(STORAGE_ENABLED_KEY)
  if (v === null) return true
  return v !== 'false'
}

function doneKeyForUser(userId: string | number | undefined) {
  if (!userId) return 'project_onboarding_done_unknown'
  return `project_onboarding_done_${String(userId)}`
}

export default function ProjectOnboardingGuide() {
  const { projectId } = useParams<{ projectId: string }>()
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  const enabled = useMemo(() => getOnboardingEnabled(), [open])

  useEffect(() => {
    if (!user?.id) return
    if (!enabled) return
    const done = localStorage.getItem(doneKeyForUser(user.id)) === '1'
    if (done) return
    setOpen(true)
    setStep(0)
  }, [user?.id, enabled])

  const targets = useMemo(
    () => [
      { id: 'project-nav-overview', title: 'Обзор', route: 'overview' },
      { id: 'project-nav-documents', title: 'Документы', route: 'documents' },
      { id: 'project-nav-kanban', title: 'Канбан', route: 'kanban' },
      { id: 'project-nav-meetings', title: 'Встречи', route: 'meetings' },
      { id: 'project-nav-cicd', title: 'CI/CD', route: 'cicd' },
      { id: 'project-nav-epochs', title: 'Эпохи', route: 'epochs' },
      { id: 'bot-dock', title: 'Помощник', route: 'overview' },
    ],
    []
  )

  useEffect(() => {
    if (!open) return
    const t = targets[step]
    if (!t) return
    const el = document.getElementById(t.id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const prev = el.style.outline
    el.style.outline = '3px solid rgba(99, 102, 241, 0.95)'
    el.style.outlineOffset = '4px'
    el.style.borderRadius = '8px'
    return () => {
      el.style.outline = prev
      el.style.outlineOffset = '0px'
    }
  }, [open, step, targets])

  const finish = () => {
    if (user?.id) localStorage.setItem(doneKeyForUser(user.id), '1')
    setOpen(false)
  }

  if (!open) return null

  const t = targets[step] || targets[0]
  const pct = `${step + 1}/${targets.length}`

  const goToStep = () => {
    if (!projectId) return
    navigate(`/projects/${projectId}/${t.route}`)
  }

  return (
    <div className="fixed inset-0 z-[190] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={finish} />
      <div className="relative w-full sm:max-w-xl card p-4 max-h-[80vh] overflow-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-sm text-slate-500">Гид по проекту</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              Шаг {pct}: {t.title}
            </div>
            <div className="text-xs text-slate-500 mt-1">Проект #{projectId}</div>
          </div>
          <button type="button" className="btn-ghost p-2" onClick={finish} title="Закрыть">
            ✕
          </button>
        </div>

        <div className="border border-slate-700 rounded p-3 bg-slate-800/20 mb-4">
          {step === 0 && 'Посмотри прогресс и статусы. Тут же есть быстрые переходы к документам/встречам.'}
          {step === 1 && 'Клик по документу показывает краткую сводку и части. В сводке можно “Перейти” к конкретной части.'}
          {step === 2 && 'Используй Канбан для работы по задачам. Фильтры по эпохам помогут держать фокус.'}
          {step === 3 && 'Встречи поддерживают транскрипт и суммаризацию. Это удобно после созвона.'}
          {step === 4 && 'CI/CD синхронизирует PR и обрабатывает webhooks.'}
          {step === 5 && 'Эпохи можно “проходить” — для навигации по задачам/документам внутри конкретного этапа.'}
          {step === 6 &&
            'Справа внизу — иконка помощника: спроси, как что-то найти, или нажми быстрый переход. Включи «Автопереход», чтобы сразу открывать найденный раздел.'}
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            Назад
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={goToStep}>
              Перейти к разделу
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (user?.id) localStorage.setItem(doneKeyForUser(user.id), '1')
                setOpen(false)
              }}
            >
              Пропустить
            </button>
            {step < targets.length - 1 ? (
              <button type="button" className="btn-primary" onClick={() => setStep((s) => s + 1)}>
                Дальше
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={finish}>
                Понятно
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

