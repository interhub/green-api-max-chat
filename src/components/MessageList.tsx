import { CaretDownIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@/state'
import type { Chat } from '@/types'
import { cx } from '@/ui/cx'
import { formatDayLabel, isValidTimestamp } from '@/ui/format'
import { prefersReducedMotion } from '@/ui/media'
import { useNow } from '@/ui/useNow'
import { MessageBubble } from './MessageBubble'
import { buildTimeline } from './timeline'

/** Closer than this to the bottom counts as "at the bottom": new messages keep the view pinned. */
const BOTTOM_THRESHOLD_PX = 80

const CAPSULE = 'rounded-capsule bg-capsule text-bubble-description text-white backdrop-blur-[25px]'

function distanceToBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

export function MessageList({ chat }: { chat: Chat }) {
  const { messages, retryMessage } = useChat()
  const now = useNow()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const bottomButtonRef = useRef<HTMLButtonElement>(null)
  const pinnedRef = useRef(true)
  const lengthRef = useRef(messages.length)
  const [atBottom, setAtBottom] = useState(true)
  const [seenCount, setSeenCount] = useState(messages.length)
  const isGroup = chat.type === 'group'
  const days = useMemo(() => buildTimeline(messages, isGroup), [messages, isGroup])

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [])

  // Any change of the messages (a new one, a status, the error row of a failed one) keeps a pinned view
  // at the bottom; sending a message jumps to the bottom from anywhere.
  useLayoutEffect(() => {
    const element = scrollRef.current
    const grew = messages.length > lengthRef.current
    lengthRef.current = messages.length
    if (!element) return
    const last = messages.at(-1)
    const sentHere = grew && last?.direction === 'out' && last.status === 'sending'
    if (sentHere) pinnedRef.current = true
    if (pinnedRef.current) element.scrollTop = element.scrollHeight
  }, [messages])

  // Height changes that do not come from new data (window resize, font loading, wrapping) as well.
  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) scroller.scrollTop = scroller.scrollHeight
    })
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  function handleScroll() {
    const element = scrollRef.current
    if (!element) return
    const bottom = distanceToBottom(element) <= BOTTOM_THRESHOLD_PX
    if (pinnedRef.current && !bottom) setSeenCount(messages.length)
    pinnedRef.current = bottom
    setAtBottom(bottom)
  }

  function scrollToBottom() {
    const element = scrollRef.current
    if (!element) return
    // The button disappears at the bottom: keep the keyboard focus on the log it scrolled.
    if (document.activeElement === bottomButtonRef.current) element.focus({ preventScroll: true })
    element.scrollTo({
      top: element.scrollHeight,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  const unseen = atBottom
    ? 0
    : messages.slice(seenCount).filter((message) => message.direction === 'in').length
  const empty = messages.length === 0

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        role="log"
        aria-label="Сообщения"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        onScroll={handleScroll}
        className="scroll-thin h-full overflow-x-hidden overflow-y-auto overscroll-contain focus-visible:outline-offset-[-2px]"
      >
        <div
          ref={contentRef}
          className={cx(
            'mx-auto flex min-h-full max-w-[860px] flex-col px-4 pt-2 pb-3',
            empty ? 'items-center justify-center' : 'justify-end',
          )}
        >
          {empty ? (
            <p className={cx(CAPSULE, 'px-3 py-1.5')}>Напишите первое сообщение</p>
          ) : (
            days.map((day) => (
              <section key={day.key}>
                {isValidTimestamp(day.timestamp) && (
                  <div className="flex justify-center py-1">
                    <span className={cx(CAPSULE, 'px-1.5 py-px')}>
                      {formatDayLabel(day.timestamp, now)}
                    </span>
                  </div>
                )}
                {day.messages.map((item) => (
                  <MessageBubble
                    key={item.message.id}
                    message={item.message}
                    position={item.position}
                    showAuthor={item.showAuthor}
                    showAvatar={item.showAvatar}
                    isGroup={isGroup}
                    onRetry={(messageId) => void retryMessage(chat.id, messageId)}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>
      {!atBottom && (
        <button
          ref={bottomButtonRef}
          type="button"
          aria-label="Вниз"
          title="Вниз"
          onClick={scrollToBottom}
          className="absolute right-4 bottom-4 z-20 flex size-10 items-center justify-center rounded-full border border-divider-soft bg-float text-icon-3 shadow-float transition-transform duration-100 hover:text-icon-2 active:scale-[0.94] motion-safe:animate-pop-in"
        >
          <CaretDownIcon size={22} />
          {unseen > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-2 left-1/2 flex h-[22px] min-w-[22px] -translate-x-1/2 items-center justify-center rounded-full bg-accent px-1.5 text-label font-medium text-white tabular-nums"
            >
              {unseen}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
