import { Moon, Sun } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'

export function ThemeToggleButton({ className = '' }: { className?: string }) {
  const darkMode = useUIStore((s) => s.darkMode)
  const toggleDarkMode = useUIStore((s) => s.toggleDarkMode)

  return (
    <button
      type="button"
      onClick={() => toggleDarkMode()}
      className={`btn-ghost p-2 rounded-md ${className}`}
      aria-label="Переключить тему"
    >
      {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
