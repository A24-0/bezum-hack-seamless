/**
 * Локальное сопоставление фраз с маршрутами Seamless (без id в ответе AI).
 * Голос: более мягкие пороги + нормализация + «последний проект» из сессии.
 */

export type NavSuggestion = { label: string; path: string; score: number }

/** Нормализация: ё→е, регистр, лишние пробелы */
export function normalizeForMatch(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

function scoreKeywords(q: string, keywords: string[]): number {
  let s = 0
  const lower = normalizeForMatch(q)
  const words = lower.split(' ').filter((w) => w.length >= 2)

  for (const k of keywords) {
    const kk = normalizeForMatch(k)
    if (lower.includes(kk)) {
      s += Math.min(45, kk.length * 3)
      continue
    }
    // короткое совпадение по началу слова (для кривого ASR)
    for (const w of words) {
      if (w.length >= 3 && (kk.startsWith(w.slice(0, 4)) || w.startsWith(kk.slice(0, Math.min(4, kk.length))))) {
        s += 8
        break
      }
    }
  }
  return s
}

export type NavigationContext = {
  /** id проекта из URL /projects/:id/... */
  projectIdFromUrl?: string
  /** последний открытый проект (sessionStorage), чтобы голосом открыть канбан не будучи в проекте */
  lastProjectId?: string | null
}

function effectiveProjectId(ctx: NavigationContext): string | undefined {
  return ctx.projectIdFromUrl || ctx.lastProjectId || undefined
}

/**
 * Подсказки переходов по запросу пользователя.
 */
export function getNavigationSuggestions(text: string, projectId?: string): NavSuggestion[] {
  return getNavigationSuggestionsCtx(text, {
    projectIdFromUrl: projectId,
    lastProjectId: null,
  })
}

export function getNavigationSuggestionsCtx(text: string, ctx: NavigationContext): NavSuggestion[] {
  const q = normalizeForMatch(text)
  if (!q) return []

  const out: NavSuggestion[] = []
  const pid = effectiveProjectId(ctx)

  const push = (label: string, path: string, keywords: string[]) => {
    const sc = scoreKeywords(q, keywords)
    if (sc > 0) out.push({ label, path, score: sc })
  }

  if (pid) {
    const base = `/projects/${pid}`
    push('Обзор проекта', `${base}/overview`, [
      'обзор',
      'дашборд',
      'dashboard',
      'прогресс',
      'статистик',
      'главная проекта',
      'общее',
      'sidebar',
      'сайдбар',
      'боковое меню',
      'пункт меню',
    ])
    push('Спринты', `${base}/epochs`, [
      'спринт',
      'эпох',
      'epoch',
      'срок',
      'итерац',
      'спринты',
      'эпохи',
      'итерация',
    ])
    push('Канбан', `${base}/kanban`, [
      'канбан',
      'kanban',
      'задач',
      'таск',
      'доск',
      'карточк',
      'todo',
      'бэклог',
      'работа',
    ])
    push('Документы', `${base}/documents`, [
      'документ',
      'файл',
      'текст',
      'редактор',
      'загруз',
      'страниц',
      'письм',
      'список документов',
      'мои документы',
      'заполнить документ',
      'редактировать документ',
    ])
    push('Встречи', `${base}/meetings`, [
      'встреч',
      'созвон',
      'meet',
      'календар',
      'видео',
      'звонок',
      'колл',
      'список встреч',
      'календарь встреч',
    ])
    push('CI/CD', `${base}/cicd`, [
      'ci/cd',
      'cicd',
      'github',
      'гитхаб',
      'gitlab',
      'гитлаб',
      'git',
      'pull',
      'пул',
      'репозитор',
      'webhook',
      'синхрон',
      'пайплайн',
      'деплой',
      'вкладка ci',
    ])
    push('Связи', `${base}/relations`, ['связ', 'матриц', 'теплов', 'интеграц', 'карта'])
    push('Участники', `${base}/members`, ['участник', 'команд', 'members', 'роль', 'люди', 'менеджер'])
  }

  push('Личный кабинет', '/cabinet', ['кабинет', 'профиль', 'стек', 'сво', 'git', 'личн'])
  push('Список проектов', '/projects', [
    'проект',
    'список',
    'все проект',
    'главная',
    'домой',
    'назад',
    'меню',
    'проекты',
    'список проектов',
  ])
  push('Уведомления', '/notifications', ['уведомлен', 'колокол', 'алерт', 'bell'])
  push('Админ-панель', '/admin', ['админ', 'admin', 'пользовател', 'актив', 'модерац'])

  return out.sort((a, b) => b.score - a.score)
}

/**
 * Лучший кандидат для автоперехода (строго).
 */
export function getBestAutoNavigate(suggestions: NavSuggestion[]): NavSuggestion | null {
  if (suggestions.length === 0) return null
  const [first, second] = suggestions
  if (first.score >= 18 && (!second || first.score >= second.score * 1.35)) return first
  return null
}

/**
 * Мягче — для автоперехода в чате после ответа.
 */
export function getBestAutoNavigateLoose(suggestions: NavSuggestion[]): NavSuggestion | null {
  if (suggestions.length === 0) return null
  const [first, second] = suggestions
  if (first.score >= 12 && (!second || first.score >= second.score * 1.2)) return first
  return null
}

/**
 * Максимально мягко для голоса (много ложных срабатываний снижаем порогом только при явном лидере).
 */
export function getBestVoiceNavigate(suggestions: NavSuggestion[]): NavSuggestion | null {
  if (suggestions.length === 0) return null
  const [first, second] = suggestions
  if (first.score >= 8 && (!second || first.score >= second.score * 1.15)) return first
  if (first.score >= 5 && (!second || first.score >= second.score * 1.4)) return first
  return null
}

/**
 * Один маршрут для голоса: учитывает права и несколько вариантов строк (альтернативы ASR).
 */
export function pickVoiceDestination(
  phrase: string,
  ctx: NavigationContext,
  isAdmin: boolean
): NavSuggestion | null {
  const chunks = [phrase, normalizeForMatch(phrase)]
    .filter(Boolean)
    .flatMap((p) => p.split(/[,.;]/).map((x) => x.trim()))
    .filter((x) => x.length >= 2)

  const seen = new Set<string>()
  let best: NavSuggestion | null = null

  for (const chunk of chunks) {
    if (seen.has(chunk)) continue
    seen.add(chunk)
    const raw = getNavigationSuggestionsCtx(chunk, ctx).filter((s) => (s.path === '/admin' ? isAdmin : true))
    const pick =
      getBestVoiceNavigate(raw) ??
      (raw[0] && raw[0].score >= 4 ? raw[0] : null) ??
      (raw.length === 1 && raw[0].score >= 3 ? raw[0] : null)

    if (pick && (!best || pick.score > best.score)) best = pick
  }

  return best
}
