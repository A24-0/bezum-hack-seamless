/**
 * Голос: «следующий/предыдущий раздел» — обход пунктов бокового меню проекта.
 */

import { normalizeForMatch } from './botNavigation'
import type { NavSuggestion } from './botNavigation'

const ORDER = [
  'overview',
  'epochs',
  'kanban',
  'documents',
  'meetings',
  'cicd',
  'relations',
  'members',
] as const

const LABEL: Record<(typeof ORDER)[number], string> = {
  overview: 'Обзор',
  epochs: 'Спринты',
  kanban: 'Канбан',
  documents: 'Документы',
  meetings: 'Встречи',
  cicd: 'CI/CD',
  relations: 'Связи',
  members: 'Участники',
}

function currentSegment(pathname: string): { projectId: string; seg: (typeof ORDER)[number] } | null {
  const m = pathname.match(/^\/projects\/(\d+)\/([^/?]+)/)
  if (!m) return null
  const projectId = m[1]
  const raw = m[2].split('/')[0]
  const idx = ORDER.indexOf(raw as (typeof ORDER)[number])
  const seg = idx >= 0 ? (raw as (typeof ORDER)[number]) : 'overview'
  return { projectId, seg }
}

/**
 * Если фраза про «следующий/предыдущий раздел меню» — вернуть соседний маршрут проекта.
 */
export function walkProjectMenuVoice(phrase: string, pathname: string): NavSuggestion | null {
  const n = normalizeForMatch(phrase)
  if (n.length < 4) return null

  const next =
    /\b(следующий раздел|следующий пункт|дальше по меню|дальше раздел|вперед по меню|следующий таб|вперед раздел)\b/.test(
      n
    ) || (n.includes('следующ') && (n.includes('меню') || n.includes('раздел') || n.includes('пункт')))

  const prev =
    /\b(предыдущий раздел|предыдущий пункт|назад по меню|назад раздел|предыдущий таб)\b/.test(n) ||
    (n.includes('предыдущ') && (n.includes('меню') || n.includes('раздел') || n.includes('пункт')))

  if (!next && !prev) return null

  const cur = currentSegment(pathname)
  if (!cur) return null

  const i = ORDER.indexOf(cur.seg)
  const base = i >= 0 ? i : 0
  const j = next ? (base + 1) % ORDER.length : (base - 1 + ORDER.length) % ORDER.length
  const seg = ORDER[j]
  return {
    label: LABEL[seg],
    path: `/projects/${cur.projectId}/${seg}`,
    score: 100,
  }
}

/** Открыть чат-помощника голосом */
export function wantsOpenChatDock(phrase: string): boolean {
  const n = normalizeForMatch(phrase)
  if (n.length < 3) return false
  return (
    /\b(открой чат|открыть чат|чат помощник|чат помощника|помощник|бот|чат бот|чатбот)\b/.test(n) ||
    (n.includes('чат') && (n.includes('помощ') || n.includes('бот'))) ||
    n === 'помощник'
  )
}
