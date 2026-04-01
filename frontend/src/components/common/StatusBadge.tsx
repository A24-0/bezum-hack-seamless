import { cn, STATUS_COLORS, STATUS_LABELS } from '../../lib/utils'

interface StatusBadgeProps {
  status: string
  className?: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ status, className, size = 'md' }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30'
  const label = STATUS_LABELS[status] ?? status

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs',
        colorClass,
        className
      )}
    >
      {label}
    </span>
  )
}
