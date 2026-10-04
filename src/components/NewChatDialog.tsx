import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useChat } from '@/state'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/TextField'

/** Browsers without <dialog> support (and jsdom) get a plain open attribute instead of a modal. */
function showDialog(dialog: HTMLDialogElement): void {
  if (dialog.hasAttribute('open')) return
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else dialog.setAttribute('open', '')
}

function hideDialog(dialog: HTMLDialogElement): void {
  if (!dialog.hasAttribute('open')) return
  if (typeof dialog.close === 'function') dialog.close()
  else dialog.removeAttribute('open')
}

function NewChatForm({ onClose }: { onClose(): void }) {
  const { startChat } = useChat()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const result = await startChat(phone)
      if (result.ok) {
        onClose()
        return
      }
      setError(result.error)
    } catch {
      setError('Не удалось начать чат. Попробуйте ещё раз.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col p-6">
      <h2 className="text-subheader text-fg">Новый чат</h2>
      <TextField
        className="mt-5"
        label="Номер телефона"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+7 900 000-00-00"
        data-autofocus=""
        value={phone}
        onChange={(event) => {
          setPhone(event.target.value)
          setError(null)
        }}
        error={error}
        hint="Номера России (+7) и Беларуси (+375)"
        reserveErrorLine
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" loading={pending}>
          Начать чат
        </Button>
      </div>
    </form>
  )
}

export function NewChatDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pressedOnBackdropRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      showDialog(dialog)
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else {
      hideDialog(dialog)
    }
  }, [open])

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Новый чат"
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={handleKeyDown}
      // The form covers the whole dialog box, so the dialog itself is the target only on the backdrop.
      // A text selection that starts in the field and ends on the backdrop must not close it.
      onPointerDown={(event) => {
        pressedOnBackdropRef.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        const fromBackdrop = pressedOnBackdropRef.current && event.target === event.currentTarget
        pressedOnBackdropRef.current = false
        if (fromBackdrop) onClose()
      }}
      className="m-auto w-[min(400px,calc(100vw-32px))] max-w-none overflow-visible rounded-modal border-0 bg-modal p-0 text-fg shadow-float open:motion-safe:animate-pop-in"
    >
      {open && <NewChatForm onClose={onClose} />}
    </dialog>
  )
}
