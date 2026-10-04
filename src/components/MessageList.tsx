import { CaretDownIcon } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@/state'
import type { Chat } from '@/types'
import { formatDayLabel } from '@/ui/format'
import { prefersReducedMotion } from '@/ui/media'
import { useNow } from '@/ui/useNow'
import { MessageBubble } from './MessageBubble'
import { buildTimeline } from './timeline'

/** Closer than this to the bottom counts as "at the bottom": new messages keep the view pinned. */
const BOTTOM_THRESHOLD_PX = 80

function distanceToBottom(element: HTMLElement): number {
  return element.scrollHeight - element.scrollTop - element.clientHeight
}

export function MessageList({ chat }: { chat: Chat }) {
  const { messages, retryMessage } = useChat()
  const now = useNow()
  const scrollRef = useRef<HTMLDivElement>(null)
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

  useLayoutEffect(() => {
    const element = scrollRef.current
    const grew = messages.length > lengthRef.current
    lengthRef.current = messages.length
    if (!element || !grew) return
    const last = messages.at(-1)
    const sentHere = last?.direction === 'out' && last.status === 'sending'
    if (sentHere || pinnedRef.current) element.scrollTop = element.scrollHeight
  }, [messages])

  useEffect(() => {
    const element = scrollRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) element.scrollTop = element.scrollHeight
    })
    observer.observe(element)
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
    element.scrollTo({
      top: element.scrollHeight,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  const unseen = atBottom
    ? 0
    : messages.slice(seenCount).filter((message) => message.direction === 'in').length

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        role="log"
        aria-label="Сообщения"
        aria-live="polite"
        tabIndex={0}
        onScroll={handleScroll}
        className="scroll-thin h-full overflow-y-auto overscroll-contain focus-visible:outline-offset-[-2px]"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <p className="rounded-capsule bg-capsule px-3 py-1.5 text-bubble-description text-white">
              Напишите первое сообщение
            </p>
          </div>
        ) : (
          <div className="mx-auto flex min-h-full max-w-[860px] flex-col justify-end px-4 pt-2 pb-3">
            {days.map((day) => (
              <section key={day.key}>
                <div className="flex justify-center py-1">
                  <span className="rounded-capsule bg-capsule px-2 py-px text-bubble-description text-white">
                    {formatDayLabel(day.timestamp, now)}
                  </span>
                </div>
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
            ))}
          </div>
        )}
      </div>
      {!atBottom && (
        <button
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
