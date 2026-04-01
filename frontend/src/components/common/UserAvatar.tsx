import { cn, getInitials } from '../../lib/utils'
import type { User } from '../../types'

interface UserAvatarProps {
  user: User | { name: string; avatar_url?: string }
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  showTooltip?: boolean
}

const SIZE_CLASSES = {
  xs: 'w-5 h-5 text-xs',
  sm: 'w-7 h-7 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
}

const COLORS = [
  'bg-indigo-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-rose-500',
  'bg-orange-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-cyan-500',
  'bg-blue-500',
]

function getColorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

export function UserAvatar({ user, size = 'md', className, showTooltip }: UserAvatarProps) {
  const initials = getInitials(user.name)
  const bgColor = getColorForName(user.name)

  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        title={showTooltip ? user.name : undefined}
        className={cn('rounded-full object-cover', SIZE_CLASSES[size], className)}
      />
    )
  }

  return (
    <div
      title={showTooltip ? user.name : undefined}
      className={cn(
        'rounded-full flex items-center justify-center text-white font-semibold shrink-0',
        SIZE_CLASSES[size],
        bgColor,
        className
      )}
    >
      {initials}
    </div>
  )
}
