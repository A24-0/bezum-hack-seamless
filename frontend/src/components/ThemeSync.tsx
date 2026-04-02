import { useLayoutEffect } from 'react'
import { useUIStore } from '../stores/uiStore'
import { THEME_STORAGE_KEY } from '../lib/theme'

/** Синхронизирует класс `dark` на <html> и color-scheme с zustand (единственный источник после гидрации). */
export function ThemeSync() {
  const darkMode = useUIStore((s) => s.darkMode)

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light'
    try {
      localStorage.setItem(THEME_STORAGE_KEY, darkMode ? 'dark' : 'light')
    } catch {
      /* private mode */
    }
  }, [darkMode])

  return null
}
