/**
 * Голосовые команды: открытие документа по названию, действия в редакторе.
 * Событие редактора: seamless:voice-editor — слушает DocumentEditorPage.
 */

import { normalizeForMatch } from './botNavigation'
import type { Document } from '../types'

export const VOICE_EDITOR_EVENT = 'seamless:voice-editor'

export type VoiceEditorDetail =
  | { action: 'save' }
  | { action: 'append'; text: string }
  | { action: 'focus' }

/** Нормализованные «разделы» — если после «открой» совпало с этим, идём в навигацию, а не в поиск файла */
const SECTION_TITLE_ALIASES = new Set(
  [
    'канбан',
    'kanban',
    'документы',
    'документ',
    'встречи',
    'встреча',
    'обзор',
    'дашборд',
    'спринты',
    'спринт',
    'эпохи',
    'связи',
    'участники',
    'участник',
    'cicd',
    'ci/cd',
    'проекты',
    'проект',
    'кабинет',
    'профиль',
    'уведомления',
    'админ',
    'admin',
    'главная',
    'меню',
    'назад',
  ].map((s) => normalizeForMatch(s))
)

export function isLikelySectionTitle(name: string): boolean {
  const full = normalizeForMatch(name)
  const first = normalizeForMatch(name.trim().split(/\s+/)[0] ?? '')
  if (!full && !first) return false
  if (SECTION_TITLE_ALIASES.has(full)) return true
  if (SECTION_TITLE_ALIASES.has(first)) return true
  return false
}

/**
 * Извлекает имя документа из фразы вида «открой …», «документ …».
 */
export function parseOpenDocumentTitle(phrase: string): string | null {
  const raw = phrase.trim()
  if (raw.length < 2) return null

  const re1 =
    /^(?:открой|открыть|перейди|покажи|найди)\s+(?:к\s+)?(?:документу|документ|файлу|файл)?\s*(.+)$/i
  const m1 = raw.match(re1)
  if (m1?.[1]) {
    const t = m1[1].trim()
    if (t.length >= 2) return t
  }

  const re2 = /^документ\s+(.+)$/i
  const m2 = raw.match(re2)
  if (m2?.[1]) {
    const t = m2[1].trim()
    if (t.length >= 2) return t
  }

  const re3 = /^файл\s+(.+)$/i
  const m3 = raw.match(re3)
  if (m3?.[1]) {
    const t = m3[1].trim()
    if (t.length >= 2) return t
  }

  return null
}

function tokenScore(query: string, title: string): number {
  const q = normalizeForMatch(query)
  const t = normalizeForMatch(title)
  if (!q || !t) return 0
  if (t === q) return 200
  if (t.includes(q)) return 150 + Math.min(40, q.length)
  if (q.includes(t)) return 120
  const qWords = q.split(' ').filter((w) => w.length >= 2)
  if (qWords.length === 0) return 0
  let s = 0
  for (const w of qWords) {
    if (t.includes(w)) s += 28
  }
  return s
}

export function findBestDocumentByVoiceTitle(query: string, docs: Document[]): Document | null {
  if (!docs.length || !query.trim()) return null
  let best: Document | null = null
  let bestScore = 0
  for (const d of docs) {
    const sc = tokenScore(query, d.title)
    if (sc > bestScore) {
      bestScore = sc
      best = d
    }
  }
  if (bestScore >= 28) return best
  if (bestScore >= 18 && docs.filter((d) => tokenScore(query, d.title) >= 18).length === 1) return best
  return null
}

export type EditorVoiceResult =
  | { kind: 'save' }
  | { kind: 'back' }
  | { kind: 'append'; text: string }
  | { kind: 'focus' }
  | null

/**
 * Команды на странице редактора документа (путь …/documents/:id).
 */
export function parseEditorVoiceCommand(phrase: string): EditorVoiceResult {
  const n = normalizeForMatch(phrase)
  if (!n) return null

  if (/\b(сохрани|сохранить|запиши|запомни|записать)\b/.test(n)) {
    return { kind: 'save' }
  }
  if (/\b(назад|к списку|к документам|вернись|закрой документ)\b/.test(n)) {
    return { kind: 'back' }
  }
  if (/\b(фокус|редактор|поле ввода|курсор)\b/.test(n)) {
    return { kind: 'focus' }
  }

  const appendPatterns: RegExp[] = [
    /^(?:добавь|добавить)(?:\s+текст)?\s+(.+)$/,
    /^(?:напиши|написать)\s+(.+)$/,
    /^(?:вставь|вставить)\s+(.+)$/,
    /^(?:допиши|дописать)\s+(.+)$/,
  ]
  for (const re of appendPatterns) {
    const m = phrase.trim().match(re)
    if (m?.[1]) {
      const text = m[1].trim()
      if (text.length > 0) return { kind: 'append', text }
    }
  }

  return null
}
