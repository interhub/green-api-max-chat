import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cx } from './cx'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string | null
  /** Helper text under the input; the error is shown below it. */
  hint?: ReactNode
  /** Keeps one line free for the error, so showing it does not move the content below. */
  reserveErrorLine?: boolean
  /** Control inside the field on the right, for example the show/hide token button. */
  trailing?: ReactNode
  inputRef?: Ref<HTMLInputElement>
}

export function TextField({
  label,
  error,
  hint,
  reserveErrorLine = false,
  trailing,
  inputRef,
  className,
  ...inputProps
}: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ')

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-description text-fg-2">
        {label}
      </label>
      <div
        className={cx(
          'flex h-12 items-center rounded-field bg-field has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-0 has-[input:focus-visible]:outline-focus',
          error && 'shadow-[inset_0_0_0_1px_var(--text-negative)]',
        )}
      >
        <input
          id={id}
          ref={inputRef}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-body text-fg caret-accent outline-none placeholder:text-fg-3 disabled:text-fg-mute"
          {...inputProps}
        />
        {trailing}
      </div>
      {hint && (
        <p id={hintId} className="text-description text-fg-3">
          {hint}
        </p>
      )}
      {(error || reserveErrorLine) && (
        <p id={errorId} className="min-h-4 text-description text-negative">
          {error && <span role="alert">{error}</span>}
        </p>
      )}
    </div>
  )
}
