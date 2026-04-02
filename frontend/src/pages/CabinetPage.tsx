import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { cabinetApi } from '../api'
import { useUIStore } from '../stores/uiStore'
import type { CabinetMe, CabinetMatchResponse, CabinetUser } from '../types'

const STORAGE_ENABLED_KEY = 'cabinet_onboarding_enabled'

function getOnboardingEnabled(): boolean {
  const v = localStorage.getItem(STORAGE_ENABLED_KEY)
  if (v === null) return true
  return v !== 'false'
}

function setOnboardingEnabled(v: boolean) {
  localStorage.setItem(STORAGE_ENABLED_KEY, v ? 'true' : 'false')
}

function doneKeyForUser(userId: number | undefined) {
  if (!userId) return 'cabinet_onboarding_done_unknown'
  return `cabinet_onboarding_done_${userId}`
}

export default function CabinetPage() {
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const navigate = useNavigate()

  const { data: me, isLoading, isError } = useQuery({
    queryKey: ['cabinet', 'me'],
    queryFn: () => cabinetApi.me().then((r) => r.data as CabinetMe),
  })

  const [nameDraft, setNameDraft] = useState('')
  const [gitDraft, setGitDraft] = useState('')
  const [techDraft, setTechDraft] = useState('')

  useEffect(() => {
    if (!me) return
    setNameDraft(me.name || '')
    setGitDraft(me.git_repo_url || '')
    setTechDraft((me.techs || []).join(', '))
  }, [me])

  const updateMe = useMutation({
    mutationFn: () =>
      cabinetApi.updateMe({
        name: nameDraft.trim() || undefined,
        git_repo_url: gitDraft.trim() ? gitDraft.trim() : null,
        techs: techDraft
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cabinet', 'me'] })
      addToast({ type: 'success', title: 'Кабинет обновлён' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось обновить кабинет' }),
  })

  const { data: techsData, isLoading: techsLoading } = useQuery({
    queryKey: ['cabinet', 'techs'],
    queryFn: () => cabinetApi.techs().then((r) => r.data.techs as string[]),
  })

  // Match by tech (dropdown + search)
  const [techSearch, setTechSearch] = useState('')
  const [selectedTechs, setSelectedTechs] = useState<string[]>(['React', 'FastAPI'])
  const [pickedTech, setPickedTech] = useState<string>('')
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchRes, setMatchRes] = useState<CabinetMatchResponse | null>(null)

  const availableTechs = techsData ?? []
  const filteredTechs = availableTechs.filter((t) => t.toLowerCase().includes(techSearch.trim().toLowerCase()))

  useEffect(() => {
    if (!pickedTech && availableTechs.length) setPickedTech(availableTechs[0])
  }, [pickedTech, availableTechs])

  const runMatch = async () => {
    const techParam = selectedTechs.map((t) => t.trim()).filter(Boolean).join(',')
    if (!techParam) {
      addToast({ type: 'warning', title: 'Выбери хотя бы один тег стека' })
      return
    }
    setMatchLoading(true)
    try {
      const r = await cabinetApi.matchByTech(techParam)
      setMatchRes(r.data)
    } catch (e: any) {
      addToast({ type: 'error', title: 'Ошибка подбора', body: e?.response?.data?.detail || e?.message })
    } finally {
      setMatchLoading(false)
    }
  }

  // Onboarding guide
  const [tourOpen, setTourOpen] = useState(false)
  const [tourStep, setTourStep] = useState(0)
  const [tourEnabled, setTourEnabled] = useState(true)

  useEffect(() => {
    if (!me) return
    const enabled = getOnboardingEnabled()
    setTourEnabled(enabled)
    if (!enabled) return
    const dk = doneKeyForUser(me.id)
    const done = localStorage.getItem(dk) === '1'
    if (!done) {
      setTourOpen(true)
      setTourStep(0)
    }
  }, [me])

  const tourTargets = useMemo(() => ['cabinet-profile', 'cabinet-techs', 'cabinet-match', 'bot-dock'] as const, [])

  useEffect(() => {
    if (!tourOpen) return
    const id = tourTargets[tourStep] || tourTargets[0]
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const prevOutline = el.style.outline
    el.style.outline = '3px solid rgba(99, 102, 241, 0.9)'
    el.style.outlineOffset = '4px'
    el.style.borderRadius = '8px'
    return () => {
      el.style.outline = prevOutline
      el.style.outlineOffset = '0px'
    }
  }, [tourOpen, tourStep, tourTargets])

  const finishTour = () => {
    if (me) localStorage.setItem(doneKeyForUser(me.id), '1')
    setTourOpen(false)
  }

  if (isLoading) return <div className="p-6 text-slate-400">Загрузка…</div>
  if (isError || !me) return <div className="p-6 text-red-300">Не удалось загрузить кабинет</div>

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Личный кабинет</h1>
          <div className="text-sm text-slate-500 mt-1">Профиль, стек и подбор программистов по технологиям</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={tourEnabled}
              onChange={(e) => {
                const v = e.target.checked
                setTourEnabled(v)
                setOnboardingEnabled(v)
              }}
            />
            Показывать подсказки по кабинету
          </label>
          {tourEnabled && (
            <button
              type="button"
              className="text-xs text-indigo-400 hover:text-indigo-300"
              onClick={() => {
                setTourStep(0)
                setTourOpen(true)
              }}
            >
              Пройти гид заново
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-4 lg:col-span-1" id="cabinet-profile">
          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Профиль</div>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-500 mb-1">Имя</div>
              <input className="input w-full" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Email</div>
              <div className="text-sm text-slate-200 bg-slate-800/40 rounded p-2">{me.email}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Роль</div>
              <div className="text-sm text-slate-200 bg-slate-800/40 rounded p-2">{me.role}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Git репозиторий (ссылка)</div>
              <input
                className="input w-full"
                value={gitDraft}
                onChange={(e) => setGitDraft(e.target.value)}
                placeholder="https://github.com/username/repo"
              />
            </div>
          </div>
          <div className="mt-4">
            <button type="button" className="btn-primary w-full" onClick={() => updateMe.mutate()} disabled={updateMe.isPending}>
              {updateMe.isPending ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>

        <div className="card p-4 lg:col-span-2" id="cabinet-techs">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Стек</div>
              <div className="text-xs text-slate-500">Языки и фреймворки, с которыми ты работаешь (разделяй запятыми).</div>
            </div>
            <div className="text-xs text-indigo-300 border border-indigo-500/30 bg-indigo-500/10 rounded px-2 py-1">
              {me.techs.length} тегов
            </div>
          </div>
          <textarea
            className="input min-h-[110px] w-full font-mono text-xs"
            value={techDraft}
            onChange={(e) => setTechDraft(e.target.value)}
            placeholder="C#, .NET, React, FastAPI, PostgreSQL"
          />
          <div className="mt-3 text-xs text-slate-500">
            Пример: <span className="text-slate-300">React, TypeScript, Node.js, FastAPI</span>
          </div>
        </div>
      </div>

      <div className="card p-4" id="cabinet-match">
          <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white">Подбор программиста по стеку</div>
            <div className="text-xs text-slate-500">Выбери технологии и получи подходящих разработчиков.</div>
          </div>
            <button type="button" className="btn-secondary text-xs" onClick={() => runMatch()} disabled={matchLoading || selectedTechs.length === 0}>
            {matchLoading ? 'Подбираю…' : 'Найти'}
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              placeholder="Поиск по тегам стека…"
              disabled={techsLoading}
            />
            <select className="input sm:w-56" value={pickedTech} onChange={(e) => setPickedTech(e.target.value)} disabled={techsLoading}>
              {filteredTechs.slice(0, 60).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {!filteredTechs.length && <option value="">Нет совпадений</option>}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn-primary text-xs"
              onClick={() => {
                const t = pickedTech?.trim()
                if (!t) return
                setSelectedTechs((prev) => (prev.includes(t) ? prev : [...prev, t]))
              }}
              disabled={!pickedTech || techsLoading}
            >
              Добавить
            </button>

            {selectedTechs.map((t) => (
              <button
                key={t}
                type="button"
                className="text-xs px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 hover:border-indigo-500"
                onClick={() => setSelectedTechs((prev) => prev.filter((x) => x !== t))}
                title="Удалить тег"
              >
                {t} ✕
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            Подбор по пересечению тегов: если выбрано несколько — учитываются все.
          </div>
        </div>

        <div className="mt-4">
          {!matchRes ? (
            <div className="text-xs text-slate-500">Пока не запускали подбор. Введи стек и нажми “Подобрать”.</div>
          ) : matchRes.candidates.length === 0 ? (
            <div className="text-xs text-slate-500">Нет кандидатов с пересечением по стеку.</div>
          ) : (
            <div className="space-y-2">
              {matchRes.candidates.map((c) => (
                <ProgrammerRow key={c.id} c={c} onOpen={() => navigate(`/cabinet/users/${c.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {tourOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full sm:max-w-xl card p-4 border border-indigo-500/20 shadow-2xl">
            <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Гид по личному кабинету</div>
            <div className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
              {tourStep === 0 &&
                'Шаг 1. Профиль: имя, email, ссылка на свой GitHub/GitLab. Нажми «Сохранить», чтобы команда видела актуальные данные.'}
              {tourStep === 1 &&
                'Шаг 2. Стек: перечисли языки и фреймворки (через запятую или из списка). Это нужно для подбора тебя на задачи в проектах.'}
              {tourStep === 2 &&
                'Шаг 3. Подбор: выбери теги, нажми «Найти» — увидишь коллег с пересечением по стеку. Открой карточку, чтобы перейти в публичный кабинет человека.'}
              {tourStep === 3 &&
                'Шаг 4. Помощник (иконка робота справа внизу на любой странице): спроси, как перейти в раздел, или включи «Автопереход» — откроется нужный экран после ответа.'}
            </div>
            <div className="flex items-center justify-between gap-3 mt-4">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setTourStep((s) => Math.max(0, s - 1))}
                disabled={tourStep === 0}
              >
                Назад
              </button>
              <div className="flex items-center gap-2">
                <div className="text-xs text-slate-500">{tourStep + 1}/4</div>
                {tourStep < 3 ? (
                  <button type="button" className="btn-primary" onClick={() => setTourStep((s) => s + 1)}>
                    Дальше
                  </button>
                ) : (
                  <button type="button" className="btn-primary" onClick={finishTour}>
                    Готово
                  </button>
                )}
              </div>
            </div>
            <button type="button" className="btn-ghost mt-3 w-full text-left text-xs" onClick={finishTour}>
              Пропустить гид
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ProgrammerRow({ c, onOpen }: { c: CabinetUser; onOpen: () => void }) {
  return (
    <div className="border border-slate-700 bg-slate-800/30 rounded p-3 flex flex-col md:flex-row gap-3 md:items-center justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-slate-900 dark:text-white truncate">{c.name}</div>
          <div className="text-xs text-slate-500">{c.role}</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {c.techs.slice(0, 8).map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-200">
              {t}
            </span>
          ))}
          {c.techs.length > 8 && (
            <span className="text-xs text-slate-400 px-2 py-0.5 rounded bg-slate-800/40 border border-slate-700">
              +{c.techs.length - 8}
            </span>
          )}
        </div>
        {c.git_repo_url ? (
          <div className="mt-2 text-xs">
            Git: <a className="text-indigo-300 hover:text-indigo-200 underline" href={c.git_repo_url} target="_blank" rel="noreferrer">{c.git_repo_url}</a>
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-500">Git не задан</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={onOpen}>
          Открыть кабинет
        </button>
      </div>
    </div>
  )
}

