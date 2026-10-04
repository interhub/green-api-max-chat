import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cx } from './cx'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  error?: string | null
  /** Helper text under the input; the error replaces it while shown. */
  hint?: ReactNode
  /** Control inside the field on the right, for example the show/hide token button. */
  trailing?: ReactNode
  inputRef?: Ref<HTMLInputElement>
}

export function TextField({
  label,
  error,
  hint,
  trailing,
  inputRef,
  className,
  ...inputProps
}: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = error ? errorId : hint ? hintId : undefined

  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <label htmlFor={id} className="text-description text-fg-2">
        {label}
      </label>
      <div
        className={cx(
          'flex h-12 items-center rounded-field bg-field has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-0 has-[input:focus-visible]:outline-[#007aff]',
          error && 'shadow-[inset_0_0_0_1px_var(--text-negative)]',
        )}
      >
        <input
          id={id}
          ref={inputRef}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-body text-fg caret-accent outline-none placeholder:text-fg-3 disabled:text-fg-mute"
          {...inputProps}
        />
        {trailing}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-description text-negative">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-description text-fg-3">
            {hint}
          </p>
        )
      )}
    </div>
  )
}
