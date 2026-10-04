import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name; also shown as the tooltip. */
  label: string
  children: ReactNode
  tone?: 'default' | 'themed'
}

export function IconButton({
  label,
  tone = 'default',
  type = 'button',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-100 hover:bg-ghost-hover enabled:active:scale-[0.94] enabled:active:bg-ghost-pressed disabled:cursor-not-allowed disabled:text-icon-mute',
        tone === 'themed' ? 'text-icon-themed' : 'text-icon-2 hover:text-icon',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
