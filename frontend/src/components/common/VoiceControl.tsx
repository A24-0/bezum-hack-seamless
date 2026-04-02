import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Mic, MicOff } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

/** Голосовая навигация (Web Speech API, Chrome/Edge; в Safari может быть недоступно). */
export function VoiceControl() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId?: string }>()
  const { user } = useAuthStore()
  const [on, setOn] = useState(false)
  const [supported, setSupported] = useState(true)
  const recRef = useRef<{ start: () => void; stop: () => void } | null>(null)

  const handlePhrase = useCallback(
    (raw: string) => {
      const t = raw.trim().toLowerCase()
      if (t.includes('проект') && (t.includes('список') || t.includes('все'))) {
        navigate('/projects')
        return
      }
      if (t.includes('проект')) {
        navigate('/projects')
        return
      }
      if (t.includes('кабинет') || (t.includes('личн') && t.includes('кабинет'))) {
        navigate('/cabinet')
        return
      }
      if ((t.includes('документ') || t.includes('документы')) && projectId) {
        navigate(`/projects/${projectId}/documents`)
        return
      }
      if ((t.includes('встреч') || t.includes('созвон')) && projectId) {
        navigate(`/projects/${projectId}/meetings`)
        return
      }
      if (t.includes('канбан') && projectId) {
        navigate(`/projects/${projectId}/kanban`)
        return
      }
      if ((t.includes('спринт') || t.includes('эпох') || t.includes('эпохи')) && projectId) {
        navigate(`/projects/${projectId}/epochs`)
        return
      }
      if ((t.includes('ci') || t.includes('цд') || t.includes('cicd') || t.includes('ци/сд')) && projectId) {
        navigate(`/projects/${projectId}/cicd`)
        return
      }
      if (t.includes('уведомлен')) {
        navigate('/notifications')
        return
      }
      if (t.includes('админ') && user?.role === 'admin') {
        navigate('/admin')
        return
      }
    },
    [navigate, projectId, user?.role]
  )

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string
        continuous: boolean
        interimResults: boolean
        start: () => void
        stop: () => void
        onresult: ((ev: { results: { transcript: string }[][] }) => void) | null
        onend: (() => void) | null
        onerror: (() => void) | null
      }
      webkitSpeechRecognition?: new () => {
        lang: string
        continuous: boolean
        interimResults: boolean
        start: () => void
        stop: () => void
        onresult: ((ev: { results: { transcript: string }[][] }) => void) | null
        onend: (() => void) | null
        onerror: (() => void) | null
      }
    }
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      return
    }
    const rec = new SR()
    rec.lang = 'ru-RU'
    rec.continuous = false
    rec.interimResults = false
    rec.onresult = (ev) => {
      const text = ev.results[0]?.[0]?.transcript
      if (text) handlePhrase(text)
    }
    rec.onend = () => setOn(false)
    rec.onerror = () => setOn(false)
    recRef.current = rec
    return () => {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
  }, [handlePhrase])

  const toggle = () => {
    const rec = recRef.current
    if (!rec) return
    if (on) {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
      setOn(false)
      return
    }
    try {
      rec.start()
      setOn(true)
    } catch {
      setOn(false)
    }
  }

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={toggle}
      className={`fixed bottom-4 left-4 z-50 rounded-full p-3 shadow-lg border transition-colors ${
        on
          ? 'bg-red-600 border-red-500 text-white'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200'
      }`}
      title="Голос: проекты/уведомления/кабинет (+ по проекту: документы/встречи/канбан/спринты)"
    >
      {on ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
    </button>
  )
}
