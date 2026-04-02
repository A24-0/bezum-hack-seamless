import type { User, ProjectMember } from '../types'

/** Можно ли менять задачи в проекте (статус, порядок, исполнитель): менеджер/разработчик в проекте или глобально admin/manager. */
export function canEditProjectTasks(user: User | null, members: ProjectMember[] | undefined): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'manager') return true
  const m = members?.find((x) => String(x.user.id) === String(user.id))
  return m?.role === 'manager' || m?.role === 'developer'
}

/** Роль в проекте для подсказок UI (например, режим разработчика). */
export function projectMemberRole(user: User | null, members: ProjectMember[] | undefined): ProjectMember['role'] | null {
  if (!user) return null
  const m = members?.find((x) => String(x.user.id) === String(user.id))
  return m?.role ?? null
}

/** Смена настроек проекта (статус и т.п.): менеджер проекта или глобально admin/manager. */
export function canEditProjectSettings(user: User | null, members: ProjectMember[] | undefined): boolean {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'manager') return true
  return projectMemberRole(user, members) === 'manager'
}
