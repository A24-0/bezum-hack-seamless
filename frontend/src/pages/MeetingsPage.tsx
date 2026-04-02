import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Video } from 'lucide-react'
import { meetingsApi } from '../api'
import { StatusBadge } from '../components/common/StatusBadge'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useState } from 'react'
import { useUIStore } from '../stores/uiStore'
import { MeetingSchedulePicker } from '../components/meeting/MeetingSchedulePicker'
import {
  isMeetingSchedulePartsValid,
  meetingScheduleRangeHint,
  toIsoFromMeetingParts,
} from '../lib/dateValidation'
import type { Meeting } from '../types'

export default function MeetingsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const qc = useQueryClient()
  const { addToast } = useUIStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [meetingTime, setMeetingTime] = useState('')
  const { data: meetings = [], isLoading, isError } = useQuery({
    queryKey: ['meetings', projectId],
    queryFn: () => meetingsApi.list(projectId!).then((r) => r.data as Meeting[]),
    enabled: !!projectId,
  })
  const createMeeting = useMutation({
    mutationFn: () => {
      let scheduled_at: string | undefined
      if (meetingDate.trim() && meetingTime.trim()) {
        const iso = toIsoFromMeetingParts(meetingDate.trim(), meetingTime.trim())
        if (!iso) throw new Error('bad-datetime')
        scheduled_at = iso
      }
      return meetingsApi
        .create(projectId!, {
          title,
          description,
          scheduled_at,
        })
        .then((r) => r.data)
    },
    onSuccess: () => {
      setTitle('')
      setDescription('')
      setMeetingDate('')
      setMeetingTime('')
      qc.invalidateQueries({ queryKey: ['meetings', projectId] })
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      addToast({ type: 'success', title: 'Встреча создана' })
    },
    onError: (err: any) => {
      if (err?.message === 'bad-datetime') {
        addToast({
          type: 'error',
          title: `Укажите корректную дату и время (${meetingScheduleRangeHint()})`,
        })
        return
      }
      addToast({ type: 'error', title: 'Не удалось создать встречу' })
    },
  })

  if (!projectId) return null

  const scheduleOk = isMeetingSchedulePartsValid(meetingDate, meetingTime)

  const submitMeeting = () => {
    if (!title.trim()) return
    if (!scheduleOk) {
      const d = meetingDate.trim()
      const t = meetingTime.trim()
      addToast({
        type: 'error',
        title:
          (d && !t) || (!d && t)
            ? 'Укажите и дату, и время, или оставьте оба поля пустыми'
            : `Некорректная дата или время (${meetingScheduleRangeHint()})`,
      })
      return
    }
    createMeeting.mutate()
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Встречи</h1>
      <div className="card p-4 mb-4 grid gap-2">
        <input className="input" placeholder="Название встречи" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input resize-none" rows={2} placeholder="Описание" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid gap-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">Когда</span>
          <MeetingSchedulePicker
            dateYmd={meetingDate}
            timeHHmm={meetingTime}
            onChange={(d, t) => {
              setMeetingDate(d)
              setMeetingTime(t)
            }}
            optional
          />
        </div>
        <div>
          <button
            className="btn-primary"
            disabled={!title.trim() || createMeeting.isPending || !scheduleOk}
            onClick={submitMeeting}
          >
            {createMeeting.isPending ? 'Создание…' : 'Создать встречу'}
          </button>
        </div>
      </div>
      {isLoading ? (
        <p className="text-slate-400">Загрузка…</p>
      ) : isError ? (
        <div className="card p-4 text-red-300">Не удалось загрузить встречи. Обновите страницу.</div>
      ) : meetings.length === 0 ? (
        <div className="card p-6 text-center text-slate-400">
          <CalendarClock className="w-10 h-10 mx-auto mb-2 opacity-50" />
          Пока нет встреч. Создайте первую для команды.
        </div>
      ) : (
        <ul className="space-y-2">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link
                to={`/projects/${projectId}/meetings/${m.id}`}
                className="card p-4 flex items-center gap-3 hover:border-slate-600 transition-colors"
              >
                <Video className="w-5 h-5 text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-slate-900 dark:text-white font-medium truncate">{m.title}</div>
                  {m.scheduled_at && (
                    <div className="text-xs text-slate-500">{format(new Date(m.scheduled_at), 'PPp', { locale: ru })}</div>
                  )}
                </div>
                <StatusBadge status={m.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
