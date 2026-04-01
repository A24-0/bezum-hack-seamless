import { create } from 'zustand'
import type { Notification } from '../types'

interface NotificationStore {
  unreadCount: number
  notifications: Notification[]
  setUnreadCount: (n: number) => void
  setNotifications: (notifications: Notification[]) => void
  addNotification: (n: Notification) => void
  markRead: (id: string) => void
  markAllRead: () => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  notifications: [],
  setUnreadCount: (n) => set({ unreadCount: n }),
  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.is_read).length,
    }),
  addNotification: (n) =>
    set((state) => ({
      notifications: [n, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + (n.is_read ? 0 : 1),
    })),
  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(
        0,
        state.unreadCount -
          (state.notifications.find((n) => n.id === id && !n.is_read) ? 1 : 0)
      ),
    })),
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    })),
}))
