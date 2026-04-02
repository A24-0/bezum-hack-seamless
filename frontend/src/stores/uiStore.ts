import { create } from 'zustand'
import { readStoredDark } from '../lib/theme'

interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  body?: string
}

interface UIStore {
  darkMode: boolean
  toasts: Toast[]
  toggleDarkMode: () => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIStore>((set) => ({
  darkMode: readStoredDark(),
  toasts: [],
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  addToast: (toast) => {
    const id = Math.random().toString(36).slice(2)
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
