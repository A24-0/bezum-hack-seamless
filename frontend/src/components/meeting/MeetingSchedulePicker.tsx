import * as Popover from '@radix-ui/react-popover'
import { DayPicker } from 'react-day-picker'
import { ru } from 'react-day-picker/locale'
import { addDays, addYears, format, isValid, parse, startOfDay } from 'date-fns'
import { ru as ruFns } from 'date-fns/locale'
import { Calendar } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getMeetingScheduleBounds, MEETING_SCHEDULE_WINDOW_YEARS } from '../../lib/dateValidation'

type Props = {
  dateYmd: string
  timeHHmm: string
  onChange: (dateYmd: string, timeHHmm: string) => void
  /** Можно сбросить дату/время (форма создания встречи) */
  optional?: boolean
}

function parseYmd(s: string): Date | undefined {
  if (!s) return undefined
  const d = parse(s, 'yyyy-MM-dd', new Date())
  return isValid(d) ? d : undefined
}

export function MeetingSchedulePicker({ dateYmd, timeHHmm, onChange, optional }: Props) {
  const { min, max } = getMeetingScheduleBounds()
  const lastDayInclusive = startOfDay(addYears(startOfDay(new Date()), MEETING_SCHEDULE_WINDOW_YEARS))
  const selected = parseYmd(dateYmd)
  const defaultTime = '10:00'

  const summary = () => {
    if (!dateYmd || !timeHHmm) {
      return optional ? 'Дата не выбрана' : 'Выберите дату и время'
    }
    const base = parseYmd(dateYmd)
    if (!base) return 'Выберите дату и время'
    const [h, m] = timeHHmm.split(':').map(Number)
    const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0)
    return format(dt, 'd MMMM yyyy, HH:mm', { locale: ruFns })
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'input inline-flex w-full items-center gap-2 text-left font-normal',
            !dateYmd && 'text-slate-500 dark:text-slate-400'
          )}
        >
          <Calendar className="h-4 w-4 shrink-0 opacity-70" />
          <span className="truncate">{summary()}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="z-[100] w-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-600 dark:bg-slate-800"
          sideOffset={8}
          align="start"
          collisionPadding={16}
        >
          <DayPicker
            mode="single"
            locale={ru}
            captionLayout="dropdown"
            startMonth={min}
            endMonth={max}
            defaultMonth={selected ?? min}
            disabled={[{ before: min }, { after: addDays(lastDayInclusive, 1) }]}
            selected={selected}
            onSelect={(d) => {
              if (!d) {
                onChange('', '')
                return
              }
              onChange(format(d, 'yyyy-MM-dd'), timeHHmm || defaultTime)
            }}
            className="meeting-day-picker"
          />
          <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-600">
            <label className="text-xs text-slate-500 dark:text-slate-400">Время</label>
            <input
              type="time"
              step={60}
              className="input"
              value={timeHHmm}
              onChange={(e) => {
                const t = e.target.value
                if (!dateYmd) {
                  onChange(format(new Date(), 'yyyy-MM-dd'), t)
                } else {
                  onChange(dateYmd, t)
                }
              }}
            />
            {optional && (dateYmd || timeHHmm) ? (
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => onChange('', '')}
              >
                Без даты и времени
              </button>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
