import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Mic } from 'lucide-react'
import { documentsApi } from '../../api'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { useLastProjectId } from '../../hooks/useLastProjectId'
import { pickVoiceDestination, type NavigationContext } from '../../lib/botNavigation'
import { walkProjectMenuVoice, wantsOpenChatDock } from '../../lib/projectNavWalk'
import {
  findBestDocumentByVoiceTitle,
  isLikelySectionTitle,
  parseEditorVoiceCommand,
  parseOpenDocumentTitle,
  VOICE_EDITOR_EVENT,
} from '../../lib/voiceCommands'
import type { Document } from '../../types'
import { cn } from '../../lib/utils'

function extractProjectIdFromPath(pathname: string): string | undefined {
  const m = pathname.match(/^\/projects\/(\d+)\//)
  return m ? m[1] : undefined
}

type RecState = 'idle' | 'listening' | 'unsupported'

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function VoiceControl() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const addToast = useUIStore((s) => s.addToast)
  const setChatDockOpen = useUIStore((s) => s.setChatDockOpen)
  const lastProjectId = useLastProjectId()

  const projectIdFromUrl = useMemo(() => extractProjectIdFromPath(location.pathname), [location.pathname])

  const navCtx: NavigationContext = useMemo(
    () => ({ projectIdFromUrl, lastProjectId }),
    [projectIdFromUrl, lastProjectId]
  )

  const [state, setState] = useState<RecState>('idle')
  const [interim, setInterim] = useState('')
  const [lastHeard, setLastHeard] = useState('')
  const recRef = useRef<SpeechRecognition | null>(null)
  const applyPhraseRef = useRef<(phrase: string) => void>(() => {})

  const applyPhrase = useCallback(
    async (phrase: string) => {
      const isAdmin = user?.role === 'admin'
      const path = location.pathname
      const pid = projectIdFromUrl || lastProjectId || undefined

      const mEditor = path.match(/^\/projects\/(\d+)\/documents\/(\d+)$/)
      if (mEditor) {
        const ed = parseEditorVoiceCommand(phrase)
        if (ed) {
          if (ed.kind === 'back') {
            navigate(`/projects/${mEditor[1]}/documents`)
            addToast({ type: 'success', title: 'Голос', body: 'Список документов' })
            return
          }
          if (ed.kind === 'save') {
            window.dispatchEvent(new CustomEvent(VOICE_EDITOR_EVENT, { detail: { action: 'save' } }))
            return
          }
          if (ed.kind === 'focus') {
            window.dispatchEvent(new CustomEvent(VOICE_EDITOR_EVENT, { detail: { action: 'focus' } }))
            return
          }
          if (ed.kind === 'append' && ed.text) {
            window.dispatchEvent(
              new CustomEvent(VOICE_EDITOR_EVENT, { detail: { action: 'append', text: ed.text } })
            )
            return
          }
        }
      }

      if (wantsOpenChatDock(phrase)) {
        setChatDockOpen(true)
        addToast({ type: 'success', title: 'Чат', body: 'Панель помощника открыта' })
        return
      }

      const walk = walkProjectMenuVoice(phrase, path)
      if (walk) {
        navigate(walk.path)
        addToast({ type: 'success', title: 'Голосовой переход', body: walk.label })
        return
      }

      const docTitle = parseOpenDocumentTitle(phrase)
      if (pid && docTitle) {
        if (isLikelySectionTitle(docTitle)) {
          const dest = pickVoiceDestination(phrase, navCtx, isAdmin)
          if (dest) {
            navigate(dest.path)
            addToast({ type: 'success', title: 'Голосовой переход', body: dest.label })
          } else {
            addToast({
              type: 'info',
              title: 'Не распознал',
              body: 'Повтори команду или скажи «проекты», «канбан», «документы».',
            })
          }
          return
        }
        try {
          const docs = await queryClient.fetchQuery({
            queryKey: ['docs', pid],
            queryFn: () => documentsApi.list(pid).then((r) => r.data as Document[]),
          })
          const match = findBestDocumentByVoiceTitle(docTitle, docs)
          if (match) {
            navigate(`/projects/${pid}/documents/${match.id}`)
            addToast({ type: 'success', title: 'Голос', body: `Открыт документ «${match.title}»` })
            return
          }
          if (docs.length > 0) {
            addToast({
              type: 'info',
              title: 'Документ не найден',
              body: `Нет совпадения для «${docTitle}». Скажи точнее или открой список документов.`,
            })
            return
          }
        } catch {
          addToast({ type: 'error', title: 'Сеть', body: 'Не удалось загрузить список документов.' })
          return
        }
      }

      const dest = pickVoiceDestination(phrase, navCtx, isAdmin)
      if (dest) {
        navigate(dest.path)
        addToast({ type: 'success', title: 'Голосовой переход', body: dest.label })
        return
      }
      addToast({
        type: 'info',
        title: 'Не распознал команду',
        body: 'Разделы: «канбан», «документы». «Следующий раздел» / «предыдущий раздел» — по меню проекта. «Открой чат». Документ: «открой …». В редакторе: «сохрани», «назад», «напиши …».',
      })
    },
    [
      addToast,
      lastProjectId,
      location.pathname,
      navigate,
      navCtx,
      projectIdFromUrl,
      queryClient,
      setChatDockOpen,
      user?.role,
    ]
  )

  useEffect(() => {
    applyPhraseRef.current = applyPhrase
  }, [applyPhrase])

  useEffect(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setState('unsupported')
      return
    }

    const r = new Ctor()
    r.lang = 'ru-RU'
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 3

    r.onstart = () => {
      setState('listening')
      setInterim('')
    }

    r.onresult = (ev: SpeechRecognitionEvent) => {
      let interimText = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) {
          interimText += ev.results[i][0].transcript
        }
      }
      if (interimText) setInterim(interimText.trim())

      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (!ev.results[i].isFinal) continue
        const alts: string[] = []
        for (let j = 0; j < ev.results[i].length; j++) {
          alts.push(ev.results[i][j].transcript.trim())
        }
        const combined = alts.filter(Boolean).join(' ').trim()
        if (!combined) continue
        setInterim('')
        setLastHeard(combined)
        void applyPhraseRef.current(combined)
      }
    }

    r.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === 'aborted' || ev.error === 'no-speech') return
      setState('idle')
      setInterim('')
      if (ev.error === 'not-allowed') {
        addToast({ type: 'warning', title: 'Микрофон', body: 'Разреши доступ к микрофону в настройках сайта.' })
      } else if (ev.error !== 'network') {
        addToast({ type: 'warning', title: 'Голос', body: ev.error })
      }
    }

    r.onend = () => {
      setState('idle')
      setInterim('')
    }

    recRef.current = r
    return () => {
      try {
        r.abort()
      } catch {
        /* ignore */
      }
      recRef.current = null
    }
  }, [addToast])

  const toggle = useCallback(() => {
    const r = recRef.current
    if (!r) {
      addToast({ type: 'error', title: 'Голос', body: 'Нужен Chrome или Edge с Web Speech API.' })
      return
    }
    if (state === 'listening') {
      try {
        r.stop()
      } catch {
        /* ignore */
      }
      setState('idle')
      setInterim('')
      return
    }
    try {
      r.start()
    } catch {
      addToast({ type: 'warning', title: 'Микрофон', body: 'Подожди секунду и нажми снова.' })
    }
  }, [addToast, state])

  if (state === 'unsupported') {
    return null
  }

  const listening = state === 'listening'
  const title = listening ? 'Остановить запись' : 'Голосовая навигация'

  const voiceStyle: CSSProperties = {
    position: 'fixed',
    zIndex: 2147483645,
    left: 'max(1rem, env(safe-area-inset-left, 0px))',
    bottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
    right: 'auto',
    top: 'auto',
    pointerEvents: 'none',
  }

  const panel = (
    <div
      id="voice-control"
      className="flex flex-col items-start gap-1 max-w-[min(300px,calc(100vw-40px))]"
      style={voiceStyle}
    >
      <button
        type="button"
        onClick={toggle}
        title={title}
        aria-label={title}
        aria-pressed={listening}
        style={{ pointerEvents: 'auto' }}
        className={cn(
          'h-12 w-12 rounded-full flex items-center justify-center border transition-colors',
          listening
            ? 'bg-indigo-100 dark:bg-indigo-950/90 border-indigo-400 text-indigo-600 dark:text-indigo-300 ring-2 ring-indigo-400/60 shadow-sm'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700/80'
        )}
      >
        <Mic className="w-6 h-6" strokeWidth={2} aria-hidden />
      </button>
      {(listening && interim) || lastHeard ? (
        <div className="text-[10px] text-slate-500 dark:text-slate-400 px-1 leading-snug pointer-events-auto">
          {listening && interim && <span className="text-indigo-300">«{interim}»</span>}
          {listening && interim && <br />}
          {lastHeard && <span className="text-slate-400">Распознано: «{lastHeard}»</span>}
        </div>
      ) : (
        <span className="text-[10px] text-slate-500 px-1 max-w-[240px] pointer-events-auto">
          Чат в шапке. Разделы и «следующий/предыдущий раздел», документ по названию, в редакторе — «сохрани», «напиши …».
        </span>
      )}
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(panel, document.body)
}
