import type { QueryClient } from '@tanstack/react-query'

/** Сбрасывает кэш данных проекта, чтобы обзор, спринты и канбан совпадали после мутаций. */
export function invalidateProjectScopedData(qc: QueryClient, projectId: string | undefined) {
  if (!projectId) return
  // Main menu / sidebar list of projects uses `['projects']`
  qc.invalidateQueries({ queryKey: ['projects'] })
  qc.invalidateQueries({ queryKey: ['tasks', projectId] })
  qc.invalidateQueries({ queryKey: ['epochs', projectId] })
  qc.invalidateQueries({ queryKey: ['project', projectId] })
  qc.invalidateQueries({ queryKey: ['meetings', projectId] })
  // Везде в UI список документов запрашивается под ключом `['docs', projectId]`
  qc.invalidateQueries({ queryKey: ['docs', projectId] })
}
