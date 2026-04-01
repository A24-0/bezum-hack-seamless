import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

export const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  todo: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  needs_info: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  review: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  done: 'bg-green-500/20 text-green-300 border-green-500/30',
  // Epoch statuses
  planning: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  active: 'bg-green-500/20 text-green-300 border-green-500/30',
  completed: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  cancelled: 'bg-red-500/20 text-red-300 border-red-500/30',
  // Document statuses
  draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  review: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-300 border-green-500/30',
  archived: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
  // PR statuses
  open: 'bg-green-500/20 text-green-300 border-green-500/30',
  merged: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  closed: 'bg-red-500/20 text-red-300 border-red-500/30',
  draft: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  // Meeting statuses
  scheduling: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  scheduled: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  in_progress: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  // Project statuses
  archived: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
}

export const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  needs_info: 'Needs Info',
  review: 'Review',
  done: 'Done',
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  draft: 'Draft',
  approved: 'Approved',
  archived: 'Archived',
  open: 'Open',
  merged: 'Merged',
  closed: 'Closed',
  scheduling: 'Scheduling',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
}
