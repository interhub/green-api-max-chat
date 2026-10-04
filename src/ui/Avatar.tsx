import { UserIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { cx } from './cx'
import { getInitials, pickByKey } from './format'

/** MAX avatar placeholder gradients (step-1 to step-2), identical in both themes. */
const GRADIENTS: readonly [[string, string], ...[string, string][]] = [
  ['#ff48b6', '#ff8a35'],
  ['#ffc93d', '#ff832a'],
  ['#14e1d5', '#03c722'],
  ['#08d7f3', '#5398ff'],
  ['#bf97ff', '#526eff'],
  ['#1bd6e3', '#27a5c8'],
  ['#79bcff', '#4289ed'],
  ['#9b90fe', '#6746ec'],
  ['#fa82ba', '#e74aa6'],
  ['#ffb381', '#e5782d'],
]

interface AvatarProps {
  /** Hash source for the color: the chat id or the sender name. */
  colorKey: string
  title: string
  size: number
  group?: boolean
  className?: string
}

export function Avatar({ colorKey, title, size, group = false, className }: AvatarProps) {
  const [from, to] = pickByKey(GRADIENTS, colorKey)
  const initials = getInitials(title)
  const FallbackIcon = group ? UsersThreeIcon : UserIcon
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-normal text-white select-none',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        lineHeight: 1,
        backgroundImage: `linear-gradient(180deg, ${from} 0%, ${to} 100%)`,
      }}
    >
      {initials || <FallbackIcon size={Math.round(size * 0.48)} />}
    </span>
  )
}
