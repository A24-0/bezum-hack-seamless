import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const KEY = 'seamless_last_project_id'

/** Запоминает последний открытый /projects/:id для голоса/бота вне страницы проекта */
export function useLastProjectId(): string | null {
  const { pathname } = useLocation()
  const [id, setId] = useState<string | null>(() =>
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null
  )

  useEffect(() => {
    const m = pathname.match(/^\/projects\/(\d+)/)
    if (m) {
      sessionStorage.setItem(KEY, m[1])
      setId(m[1])
    }
  }, [pathname])

  return id
}
