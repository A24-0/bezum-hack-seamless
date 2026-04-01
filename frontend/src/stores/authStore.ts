import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthStore {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  updateUser: (user: User) => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
      updateUser: (user) => set({ user }),
    }),
    {
      name: 'seamless-auth',
    }
  )
)
