import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Spinner } from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'small' | 'medium' | 'large'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Shows a spinner, blocks clicks and keeps the label in the accessible name. */
  loading?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed disabled:bg-accent-disabled disabled:text-on-disabled',
  secondary:
    'bg-secondary text-fg hover:bg-secondary-hover active:bg-secondary-pressed disabled:text-fg-mute',
  ghost:
    'bg-transparent text-themed hover:bg-ghost-hover active:bg-ghost-pressed disabled:text-fg-mute',
}

const LOADING_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white',
  secondary: 'bg-secondary text-fg',
  ghost: 'bg-transparent text-themed',
}

/** MAX button sizes: xsmall h32 r8, small h40 r12, medium h52 r16. */
const SIZES: Record<ButtonSize, string> = {
  small: 'h-8 rounded-lg px-3 text-action-small',
  medium: 'h-10 rounded-xl px-4 text-action',
  large: 'h-[52px] rounded-2xl px-5 text-action',
}

export function Button({
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition-transform duration-100 select-none enabled:active:scale-[0.98] disabled:cursor-not-allowed',
        SIZES[size],
        loading ? cx(LOADING_VARIANTS[variant], 'cursor-progress') : VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <span className={cx('inline-flex items-center gap-2', loading && 'opacity-0')}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={size === 'small' ? 16 : 20} />
        </span>
      )}
    </button>
  )
}
