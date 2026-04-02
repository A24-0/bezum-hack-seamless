import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, CalendarClock } from 'lucide-react'
import { meetingsApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useAuthStore } from '../stores/authStore'
import type { Meeting } from '../types'
import { MeetingSchedulePicker } from '../components/meeting/MeetingSchedulePicker'
import {
  combinedDateTimeLocal,
  meetingScheduleRangeHint,
  toIsoFromMeetingParts,
} from '../lib/dateValidation'

export default function MeetingDetailPage() {
  const { projectId, meetingId } = useParams<{ projectId: string; meetingId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const { user } = useAuthStore()
  const [slotDate, setSlotDate] = useState('')
  const [slotTime, setSlotTime] = useState('')
  const [transcript, setTranscript] = useState('')
  const { data: meeting, isLoading, isError } = useQuery({
    queryKey: ['meeting', projectId, meetingId],
    queryFn: () => meetingsApi.get(projectId!, meetingId!).then((r) => r.data as Meeting),
    enabled: !!projectId && !!meetingId,
  })

  const m = meeting
  const refetchMeeting = () => {
    qc.invalidateQueries({ queryKey: ['meeting', projectId, meetingId] })
    qc.invalidateQueries({ queryKey: ['meetings', projectId] })
  }
  const slotCombined = combinedDateTimeLocal(slotDate, slotTime)

  const proposeMutation = useMutation({
    mutationFn: () => {
      const iso = toIsoFromMeetingParts(slotDate.trim(), slotTime.trim())
      if (!iso) throw new Error('bad-slot')
      return meetingsApi.proposeTimes(projectId!, meetingId!, [iso])
    },
    onSuccess: () => {
      setSlotDate('')
      setSlotTime('')
      refetchMeeting()
      addToast({ type: 'success', title: 'Слот времени предложен' })
    },
    onError: (e: any) => {
      if (e?.message === 'bad-slot') {
        addToast({
          type: 'error',
          title: `Укажите корректную дату и время слота (${meetingScheduleRangeHint()})`,
        })
        return
      }
      addToast({ type: 'error', title: 'Не удалось предложить слот' })
    },
  })
  const voteMutation = useMutation({
    mutationFn: (proposalId: number) => meetingsApi.voteSlot(projectId!, meetingId!, String(proposalId), true),
    onSuccess: () => {
      refetchMeeting()
      addToast({ type: 'success', title: 'Голос учтен' })
    },
    onError: () => addToast({ type: 'error', title: 'Ошибка голосования' }),
  })
  const finalizeMutation = useMutation({
    mutationFn: (proposalId?: number) =>
      meetingsApi.finalizeTime(projectId!, meetingId!, proposalId ? String(proposalId) : undefined),
    onSuccess: () => {
      refetchMeeting()
      addToast({ type: 'success', title: 'Время встречи согласовано' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось зафиксировать время' }),
  })
  const rsvpMutation = useMutation({
    mutationFn: (rsvp: string) => meetingsApi.updateRsvp(projectId!, meetingId!, rsvp),
    onSuccess: () => {
      refetchMeeting()
      addToast({ type: 'success', title: 'Ваш ответ обновлен' })
    },
  })
  const transcriptMutation = useMutation({
    mutationFn: () => meetingsApi.uploadTranscript(projectId!, meetingId!, transcript),
    onSuccess: () => {
      refetchMeeting()
      addToast({ type: 'success', title: 'Транскрипт сохранен' })
    },
    onError: () => addToast({ type: 'error', title: 'Не удалось сохранить транскрипт' }),
  })
  const summarizeMutation = useMutation({
    mutationFn: () => meetingsApi.summarize(projectId!, meetingId!),
    onSuccess: () => {
      refetchMeeting()
      addToast({ type: 'success', title: 'Саммари встречи готово' })
    },
    onError: () => addToast({ type: 'error', title: 'Суммаризация не удалась' }),
  })
  const myVote = (proposalId: number) => {
    const p = m?.time_proposals?.find((tp) => Number(tp.id) === Number(proposalId))
    if (!p || !user) return false
    return Boolean(p.votes?.[String(user.id)])
  }

  if (!projectId || !meetingId) return null

  return (
    <div className="p-6 max-w-3xl">
      <Link
        to={`/projects/${projectId}/meetings`}
        className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Назад к встречам
      </Link>
      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить детали встречи.</div>
      ) : m ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{m.title ?? 'Встреча'}</h1>
            <StatusBadge status={m.status ?? 'scheduled'} />
          </div>
          {m.scheduled_at && (
            <p className="text-sm text-slate-400 mb-4">{format(new Date(m.scheduled_at), 'PPp', { locale: ru })}</p>
          )}
          {m.description && <p className="text-slate-300">{m.description}</p>}
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Участники и ответы</h2>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button className="btn-secondary text-xs" onClick={() => rsvpMutation.mutate('accepted')}>Принять</button>
              <button className="btn-secondary text-xs" onClick={() => rsvpMutation.mutate('tentative')}>Под вопросом</button>
              <button className="btn-secondary text-xs" onClick={() => rsvpMutation.mutate('declined')}>Отклонить</button>
            </div>
            <div className="space-y-1">
              {(m.participants || []).map((p) => (
                <div key={`${p.user_id}`} className="text-xs text-slate-300 flex items-center justify-between">
                  <span>{p.user?.name || `Пользователь #${p.user_id}`}</span>
                  <StatusBadge status={p.status || 'pending'} size="sm" />
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-indigo-400" /> Предложенные слоты
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end mb-3">
              <div className="grid gap-1 flex-1 min-w-0">
                <span className="text-xs text-slate-500 dark:text-slate-400">Дата и время слота</span>
                <MeetingSchedulePicker
                  dateYmd={slotDate}
                  timeHHmm={slotTime}
                  onChange={(d, t) => {
                    setSlotDate(d)
                    setSlotTime(t)
                  }}
                />
              </div>
              <button
                className="btn-primary shrink-0 self-start sm:self-center"
                onClick={() => proposeMutation.mutate()}
                disabled={!slotCombined || proposeMutation.isPending}
              >
                Добавить
              </button>
            </div>
            <div className="space-y-2">
              {(m.time_proposals || []).map((tp) => (
                <div key={tp.id} className="border border-slate-700 rounded p-2 flex items-center justify-between gap-2">
                  <div className="text-sm text-slate-200">{format(new Date(tp.proposed_at), 'PPp', { locale: ru })}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">голосов: {tp.vote_count}</span>
                    <button className="btn-secondary text-xs" onClick={() => voteMutation.mutate(tp.id)}>
                      {myVote(tp.id) ? <Check className="w-3 h-3" /> : null} Голосовать
                    </button>
                    <button className="btn-primary text-xs" onClick={() => finalizeMutation.mutate(tp.id)}>Зафиксировать</button>
                  </div>
                </div>
              ))}
            </div>
            {(m.time_proposals || []).length > 0 && (
              <button className="btn-secondary text-xs mt-3" onClick={() => finalizeMutation.mutate(undefined)}>
                Автовыбор лучшего слота
              </button>
            )}
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Транскрипт и саммари</h2>
            <textarea
              className="input resize-none text-sm mb-3"
              rows={6}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Вставьте транскрипт…"
            />
            <div className="flex gap-2 mb-3">
              <button className="btn-secondary" onClick={() => transcriptMutation.mutate()} disabled={!transcript.trim()}>
                Сохранить транскрипт
              </button>
              <button className="btn-primary" onClick={() => summarizeMutation.mutate()} disabled={!m.transcript}>
                Суммаризировать встречу
              </button>
            </div>
            {m.summary && <div className="text-sm text-slate-300 whitespace-pre-wrap">{m.summary}</div>}
          </div>
        </div>
      ) : (
        <p className="text-slate-400">Встреча не найдена.</p>
      )}
    </div>
  )
}
