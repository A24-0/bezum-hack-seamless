import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'
import { useUIStore } from '../stores/uiStore'
import type { Notification } from '../types'

export function useNotifications() {
  const { token } = useAuthStore()
  const { addNotification, setNotifications, setUnreadCount } = useNotificationStore()
  const { addToast } = useUIStore()
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!token) return

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const host = window.location.host
      const url = `${protocol}://${host}/ws/notifications?token=${token}`

      try {
        const ws = new WebSocket(url)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('[WS] Connected to notifications')
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            if (data.type === 'init') {
              setNotifications(data.notifications || [])
              setUnreadCount(data.unread_count || 0)
              return
            }

            if (data.type === 'notification') {
              const notification: Notification = data.notification
              addNotification(notification)
              addToast({
                type: 'info',
                title: notification.title,
                body: notification.body,
              })
            }
          } catch (e) {
            console.error('[WS] Failed to parse message', e)
          }
        }

        ws.onclose = () => {
          console.log('[WS] Disconnected, reconnecting in 3s...')
          reconnectTimeout.current = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws.close()
        }
      } catch (e) {
        console.error('[WS] Failed to connect', e)
        reconnectTimeout.current = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [token, addNotification, setNotifications, setUnreadCount, addToast])
}
