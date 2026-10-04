import { PaperPlaneRightIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useChat } from '@/state'
import { cx } from '@/ui/cx'
import { isDesktop } from '@/ui/media'

const MAX_LENGTH = 4000
const COUNTER_FROM = 3500
const LINE_HEIGHT_PX = 20
const MAX_LINES = 6
const VERTICAL_PADDING_PX = 32

export function Composer({ chatId }: { chatId: string }) {
  const { sendMessage } = useChat()
  const [text, setText] = useState('')
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const canSend = text.trim().length > 0

  useEffect(() => {
    if (isDesktop()) fieldRef.current?.focus()
  }, [chatId])

  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = 'auto'
    const limit = LINE_HEIGHT_PX * MAX_LINES + VERTICAL_PADDING_PX
    field.style.height = `${Math.min(field.scrollHeight, limit)}px`
  }, [text])

  function submit() {
    if (!canSend) return
    void sendMessage(chatId, text)
    setText('')
    fieldRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    // Enter that confirms an IME composition (keyCode 229 in Safari) must not send the message.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return
    event.preventDefault()
    submit()
  }

  return (
    <div className="relative shrink-0 px-4 pb-4">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="mx-auto flex max-w-[759px] items-end rounded-bubble bg-float shadow-float keyboard:has-[textarea:focus-visible]:outline-2 keyboard:has-[textarea:focus-visible]:outline-offset-0 keyboard:has-[textarea:focus-visible]:outline-[#007aff]"
      >
        <textarea
          ref={fieldRef}
          aria-label="Сообщение"
          placeholder="Сообщение"
          rows={1}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          className="scroll-thin block max-h-[152px] min-h-[52px] flex-1 resize-none bg-transparent py-4 pl-4 text-body text-fg caret-accent outline-none placeholder:text-fg-3"
        />
        {text.length >= COUNTER_FROM && (
          <span
            className={cx(
              'shrink-0 self-end pb-4 pl-2 text-label tabular-nums',
              text.length >= MAX_LENGTH ? 'text-negative' : 'text-fg-3',
            )}
          >
            {text.length} / {MAX_LENGTH}
          </span>
        )}
        <button
          type="submit"
          aria-label="Отправить"
          title="Отправить"
          disabled={!canSend}
          className="m-1.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-transform duration-100 hover:bg-accent-hover enabled:active:scale-[0.94] enabled:active:bg-accent-pressed disabled:cursor-not-allowed disabled:bg-control-off disabled:text-icon-mute"
        >
          <PaperPlaneRightIcon size={20} />
        </button>
      </form>
    </div>
  )
}
