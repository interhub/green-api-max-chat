import { ArrowClockwiseIcon } from '@phosphor-icons/react'
import type { ChatMessage } from '@/types'
import { Avatar } from '@/ui/Avatar'
import { cx } from '@/ui/cx'
import { formatClock, isValidTimestamp, pickByKey } from '@/ui/format'
import { linkify } from '@/ui/linkify'
import { DeliveryStatus } from './DeliveryStatus'
import type { StackPosition } from './timeline'

const AUTHOR_COLORS: readonly [string, ...string[]] = [
  'var(--author-malachite)',
  'var(--author-dark-sky)',
  'var(--author-lilac)',
  'var(--author-orchid)',
  'var(--author-tangerine)',
]

/** The corner that touches the neighbour bubble of the same sender becomes 6px (MAX stack corner). */
const CORNERS: Record<'in' | 'out', Record<StackPosition, string>> = {
  in: {
    single: '',
    first: 'rounded-bl-stack',
    middle: 'rounded-l-stack',
    last: 'rounded-tl-stack',
  },
  out: {
    single: '',
    first: 'rounded-br-stack',
    middle: 'rounded-r-stack',
    last: 'rounded-tr-stack',
  },
}

const ROW_SPACING: Record<StackPosition, string> = {
  single: 'py-1',
  first: 'pt-1 pb-px',
  middle: 'py-px',
  last: 'pt-px pb-1',
}

interface MessageBubbleProps {
  message: ChatMessage
  position: StackPosition
  showAuthor: boolean
  showAvatar: boolean
  isGroup: boolean
  onRetry(messageId: string): void
}

function MessageTime({ timestamp }: { timestamp: number }) {
  if (!isValidTimestamp(timestamp)) return null
  return <time dateTime={new Date(timestamp).toISOString()}>{formatClock(timestamp)}</time>
}

export function MessageBubble({
  message,
  position,
  showAuthor,
  showAvatar,
  isGroup,
  onRetry,
}: MessageBubbleProps) {
  const outgoing = message.direction === 'out'
  const side = outgoing ? 'out' : 'in'
  const senderName = message.senderName ?? ''
  const failed = outgoing && message.status === 'failed'

  return (
    <div
      data-position={position}
      className={cx(
        'flex items-end gap-1.5 motion-safe:animate-bubble-in',
        outgoing ? 'flex-row-reverse pl-16' : 'pr-12',
        ROW_SPACING[position],
      )}
    >
      {isGroup && !outgoing && (
        <span className="w-8 shrink-0">
          {showAvatar && <Avatar colorKey={senderName} title={senderName} size={32} />}
        </span>
      )}
      <div className={cx('flex min-w-0 flex-col', outgoing ? 'items-end' : 'items-start')}>
        <div
          data-side={side}
          className={cx(
            'relative max-w-[min(480px,100%)] min-w-[72px] rounded-bubble px-2.5 pt-2 pb-2.5 bubble-fill',
            outgoing ? 'bubble-outgoing' : 'bubble-incoming',
            CORNERS[side][position],
          )}
        >
          {showAuthor && (
            <p
              className="truncate pb-0.5 text-bubble-description font-medium"
              style={{ color: pickByKey(AUTHOR_COLORS, senderName) }}
            >
              {senderName}
            </p>
          )}
          <p
            className={cx(
              'text-message wrap-anywhere whitespace-pre-wrap',
              message.kind === 'unsupported' && 'text-bubble-muted italic',
            )}
          >
            {message.kind === 'text'
              ? linkify(
                  message.text,
                  'text-bubble-link underline decoration-1 underline-offset-2 hover:decoration-2',
                )
              : message.text}
            <span
              aria-hidden="true"
              className={cx('inline-block h-3.5', outgoing ? 'w-[58px]' : 'w-10')}
            />
          </p>
          <span className="absolute right-2.5 bottom-1 flex items-center gap-0.5 text-bubble-tag text-bubble-time tabular-nums">
            <MessageTime timestamp={message.timestamp} />
            {outgoing && <DeliveryStatus status={message.status} tone="bubble" />}
          </span>
        </div>
        {failed && (
          <div className="mt-1 flex max-w-full flex-wrap items-center justify-end gap-1.5">
            <span className="rounded-capsule bg-capsule px-2 py-0.5 text-label text-white backdrop-blur-[25px]">
              {message.error ?? 'Не отправлено'}
            </span>
            <button
              type="button"
              onClick={() => onRetry(message.id)}
              className="inline-flex h-8 items-center gap-1 rounded-capsule bg-accent px-2.5 text-label font-medium text-white transition-transform duration-100 hover:bg-accent-hover active:scale-[0.96] active:bg-accent-pressed"
            >
              <ArrowClockwiseIcon size={14} aria-hidden="true" />
              Повторить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
