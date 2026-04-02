import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { MessageCircle, Navigation } from 'lucide-react'
import { aiApi } from '../../api'
import { useUIStore } from '../../stores/uiStore'
import { useLastProjectId } from '../../hooks/useLastProjectId'
import {
  getBestAutoNavigateLoose,
  getNavigationSuggestionsCtx,
  type NavSuggestion,
} from '../../lib/botNavigation'
import { cn } from '../../lib/utils'

type ChatMsg = { id: string; role: 'user' | 'assistant'; content: string }

function extractProjectIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/^\/projects\/(\d+)\//)
  return m ? m[1] : undefined
}

const STORAGE_AUTO_NAV = 'bot_auto_navigate'

function loadAutoNav(): boolean {
  return localStorage.getItem(STORAGE_AUTO_NAV) === '1'
}

function saveAutoNav(v: boolean) {
  localStorage.setItem(STORAGE_AUTO_NAV, v ? '1' : '0')
}

export default function ChatBotDock() {
  const location = useLocation()
  const navigate = useNavigate()
  const addToast = useUIStore((s) => s.addToast)
  const chatDockOpen = useUIStore((s) => s.chatDockOpen)
  const setChatDockOpen = useUIStore((s) => s.setChatDockOpen)
  const lastProjectId = useLastProjectId()

  const projectIdStr = useMemo(() => extractProjectIdFromPath(location.pathname), [location.pathname])
  const projectIdNum = useMemo(() => {
    if (!projectIdStr) return undefined
    const n = Number(projectIdStr)
    return Number.isFinite(n) ? n : undefined
  }, [projectIdStr])

  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [autoNavigate, setAutoNavigate] = useState(loadAutoNav)
  const [lastNavHints, setLastNavHints] = useState<NavSuggestion[]>([])

  const welcome = useMemo(() => {
    if (projectIdStr) {
      return `Открыт проект. Спроси про задачи, документы, встречи — дам шаги. Ниже быстрые переходы. Кнопка «Чат» в шапке открывает это же окно. «Автопереход» — сразу открыть раздел после ответа.`
    }
    return `Спроси про Seamless или нажми быстрый переход. Чат также в шапке (иконка бота). В проекте доступны канбан, документы, CI/CD.`
  }, [projectIdStr])

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'm1',
      role: 'assistant',
      content: welcome,
    },
  ])

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].id === 'm1') {
        return [{ ...prev[0], content: welcome }]
      }
      return prev
    })
  }, [welcome])

  const quickLinks = useMemo((): NavSuggestion[] => {
    if (!projectIdStr) {
      return [
        { label: 'Проекты', path: '/projects', score: 1 },
        { label: 'Кабинет', path: '/cabinet', score: 1 },
        { label: 'Уведомления', path: '/notifications', score: 1 },
      ]
    }
    const base = `/projects/${projectIdStr}`
    return [
      { label: 'Обзор', path: `${base}/overview`, score: 1 },
      { label: 'Канбан', path: `${base}/kanban`, score: 1 },
      { label: 'Документы', path: `${base}/documents`, score: 1 },
      { label: 'Встречи', path: `${base}/meetings`, score: 1 },
      { label: 'CI/CD', path: `${base}/cicd`, score: 1 },
      { label: 'Связи', path: `${base}/relations`, score: 1 },
      { label: 'Спринты', path: `${base}/epochs`, score: 1 },
      { label: 'Участники', path: `${base}/members`, score: 1 },
      { label: 'Кабинет', path: '/cabinet', score: 1 },
      { label: 'Все проекты', path: '/projects', score: 1 },
    ]
  }, [projectIdStr])

  const send = async () => {
    const text = draft.trim()
    if (!text) return

    const hints = getNavigationSuggestionsCtx(text, {
      projectIdFromUrl: projectIdStr,
      lastProjectId,
    })
    setLastNavHints(hints.slice(0, 8).filter((h) => h.score > 0))

    const userMsg: ChatMsg = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: text,
    }
    setMessages((prev) => [...prev, userMsg])
    setDraft('')
    setLoading(true)

    const autoTarget = autoNavigate ? getBestAutoNavigateLoose(hints) : null

    try {
      const res = await aiApi.chat(text, projectIdNum)
      const answer = res.data.answer
      const botMsg: ChatMsg = {
        id: Math.random().toString(36).slice(2),
        role: 'assistant',
        content: answer,
      }
      setMessages((prev) => [...prev, botMsg])

      if (autoTarget && autoNavigate) {
        navigate(autoTarget.path)
        addToast({ type: 'info', title: 'Переход', body: autoTarget.label })
      }
    } catch (e: any) {
      addToast({ type: 'error', title: 'Ошибка чата', body: e?.response?.data?.detail || e?.message || 'Unknown' })
    } finally {
      setLoading(false)
    }
  }

  const go = (path: string) => {
    navigate(path)
  }

  /** Портал в body + max z-index: поверх DnD, модалок и гидов */
  const dockStyle: CSSProperties = {
    position: 'fixed',
    zIndex: 2147483646,
    right: 'max(1rem, env(safe-area-inset-right, 0px))',
    bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
    left: 'auto',
    top: 'auto',
    pointerEvents: 'none',
  }

  const dock = (
    <div id="bot-dock" className="flex flex-col items-end gap-2" style={dockStyle} data-seamless-chat-dock>
      {!chatDockOpen ? (
        <button
          type="button"
          data-chat-fab
          className={cn(
            'group relative flex flex-col items-center gap-1 pointer-events-auto',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-full'
          )}
          title="Чат-помощник"
          onClick={() => setChatDockOpen(true)}
          aria-label="Открыть чат-помощник"
        >
          <span
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full',
              'bg-indigo-600 text-white border border-indigo-500/80',
              'shadow-md hover:bg-indigo-500 active:scale-[0.98] transition-colors'
            )}
          >
            <MessageCircle className="w-7 h-7" strokeWidth={1.75} aria-hidden />
          </span>
          <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">Чат</span>
        </button>
      ) : (
        <div className="card p-3 shadow-2xl w-[min(420px,calc(100vw-32px))] border-2 border-indigo-500/35 bg-slate-900/95 backdrop-blur-sm pointer-events-auto">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-full bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <MessageCircle className="w-5 h-5" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">Помощник</div>
                <div className="text-[11px] text-slate-500">ответы и переходы</div>
              </div>
            </div>
            <button type="button" className="btn-ghost p-2 shrink-0" onClick={() => setChatDockOpen(false)} title="Свернуть">
              ✕
            </button>
          </div>

          <label className="flex items-start gap-2 text-[11px] text-slate-400 mb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-slate-600"
              checked={autoNavigate}
              onChange={(e) => {
                const v = e.target.checked
                setAutoNavigate(v)
                saveAutoNav(v)
              }}
            />
            <span>
              <span className="text-slate-300 font-medium">Автопереход</span> — после ответа открыть найденный раздел
              (порог мягче, чем раньше).
            </span>
          </label>

          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className="text-[10px] text-slate-500 w-full flex items-center gap-1">
              <Navigation className="w-3 h-3" /> Быстрые переходы
            </span>
            {quickLinks.map((l) => (
              <button
                key={l.path}
                type="button"
                className="text-[11px] px-2 py-1 rounded-md bg-slate-800/80 border border-slate-600 text-indigo-200 hover:border-indigo-500/60"
                onClick={() => go(l.path)}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="max-h-[240px] overflow-auto pr-1 space-y-2 mb-2">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'text-right' : 'text-left'}>
                <div
                  className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/60 text-slate-100 border border-slate-700'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-slate-500">Пишу ответ…</div>}
          </div>

          {lastNavHints.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              <span className="text-[10px] text-slate-500 w-full">По запросу — перейти:</span>
              {lastNavHints.map((h) => (
                <button
                  key={h.path}
                  type="button"
                  className="text-[11px] px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25"
                  onClick={() => go(h.path)}
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              className="input resize-none min-h-[44px] max-h-[100px] flex-1 text-sm"
              value={draft}
              placeholder="«открой канбан», «следующий раздел», «где документы?»"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!loading) void send()
                }
              }}
            />
            <button type="button" className="btn-primary shrink-0 px-3" onClick={() => void send()} disabled={loading || !draft.trim()}>
              {loading ? '…' : 'Отправить'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(dock, document.body)
}
