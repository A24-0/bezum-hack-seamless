/** Ключ localStorage для темы (синхронизируется с ThemeSync и inline-скриптом в index.html) */
export const THEME_STORAGE_KEY = 'seamless-theme'

export function readStoredDark(): boolean {
  if (typeof window === 'undefined') return true
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light') return false
  if (stored === 'dark') return true
  return true
}
