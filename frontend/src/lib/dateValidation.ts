import { addYears, endOfDay, startOfDay } from 'date-fns'

/** Глубина планирования встреч: не раньше сегодня и не позже чем через N лет */
export const MEETING_SCHEDULE_WINDOW_YEARS = 5

/** Границы для календаря и проверок (локальное время браузера) */
export function getMeetingScheduleBounds(): { min: Date; max: Date } {
  const today = startOfDay(new Date())
  const max = endOfDay(addYears(today, MEETING_SCHEDULE_WINDOW_YEARS))
  return { min: today, max }
}

/** Текст для подсказок и ошибок */
export function meetingScheduleRangeHint(): string {
  return `с сегодня и не более чем на ${MEETING_SCHEDULE_WINDOW_YEARS} лет вперёд`
}

/** Поля type="date" в формате YYYY-MM-DD */
export function isEndDateAfterStart(startYmd: string, endYmd: string): boolean {
  if (!startYmd || !endYmd) return true
  return endYmd >= startYmd
}

export function isValidDateInputYmd(value: string): boolean {
  if (!value) return true
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y < 1970 || y > 2100) return false
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

export function isValidMeetingDateYmd(value: string): boolean {
  if (!value) return true
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return false
  const { min, max } = getMeetingScheduleBounds()
  return dt >= min && dt <= max
}

export function isValidTimeHHmm(value: string): boolean {
  if (!value) return true
  const m = /^(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return false
  const h = Number(m[1])
  const mi = Number(m[2])
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59
}

/** Два поля (date + time) → одна строка YYYY-MM-DDTHH:mm или null при неполном/неверном вводе */
export function combinedDateTimeLocal(dateYmd: string, timeHHmm: string): string | null {
  const d = dateYmd.trim()
  const t = timeHHmm.trim()
  if (!d && !t) return null
  if (!d || !t) return null
  const combined = `${d}T${t}`
  return isValidDateTimeLocal(combined) ? combined : null
}

/** Расписание встречи: оба пустые (без даты) или оба заполнены и валидны; одно без второго — ошибка */
export function isMeetingSchedulePartsValid(dateYmd: string, timeHHmm: string): boolean {
  const d = dateYmd.trim()
  const t = timeHHmm.trim()
  if (!d && !t) return true
  if (!d || !t) return false
  return combinedDateTimeLocal(d, t) !== null
}

export function toIsoFromMeetingParts(dateYmd: string, timeHHmm: string): string | null {
  const combined = combinedDateTimeLocal(dateYmd, timeHHmm)
  if (!combined) return null
  return toIsoFromDateTimeLocal(combined)
}

/**
 * Строгая проверка значения input datetime-local:
 * формат YYYY-MM-DDTHH:mm, существующая дата, год в допустимом диапазоне, часы/минуты в пределах суток.
 * (Без этого JS new Date() принимает «левые» годы и несуществующие дни с переносом.)
 */
export function isValidDateTimeLocal(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false
  if (h > 23 || mi > 59) return false
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0)
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d ||
    dt.getHours() !== h ||
    dt.getMinutes() !== mi
  ) {
    return false
  }
  const { min, max } = getMeetingScheduleBounds()
  return dt >= min && dt <= max
}

/**
 * ISO для API: те же календарные компоненты, что в поле datetime-local.
 * Не используем Date#toISOString() — сдвиг в UTC меняет год/день и ломает проверку года на бэкенде.
 */
export function toIsoFromDateTimeLocal(value: string): string | null {
  if (!isValidDateTimeLocal(value)) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())!
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+00:00`
}
