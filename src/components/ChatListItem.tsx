import type { Chat, ChatMessage } from '@/types'
import { Avatar } from '@/ui/Avatar'
import { cx } from '@/ui/cx'
import { formatListTime } from '@/ui/format'
import { DeliveryStatus } from './DeliveryStatus'

interface ChatListItemProps {
  chat: Chat
  lastMessage?: ChatMessage
  selected: boolean
  now: number
  onSelect(chatId: string): void
}

function Preview({ chat, message }: { chat: Chat; message?: ChatMessage }) {
  if (!message) return <span className="text-fg-mute">Нет сообщений</span>
  const author =
    message.direction === 'out'
      ? 'Вы: '
      : chat.type === 'group' && message.senderName
        ? `${message.senderName}: `
        : ''
  return (
    <>
      {author && <span className="text-fg-2">{author}</span>}
      <span className={message.kind === 'unsupported' ? 'italic' : undefined}>{message.text}</span>
    </>
  )
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span
      role="img"
      aria-label={`Непрочитанных: ${count}`}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-counter px-1.5 text-label font-medium text-white tabular-nums"
    >
      {count > 999 ? '999+' : count}
    </span>
  )
}

/** One MAX chat cell: 64px avatar, title + time, two-line preview + unread counter. */
export function ChatListItem({ chat, lastMessage, selected, now, onSelect }: ChatListItemProps) {
  const time = formatListTime(lastMessage?.timestamp ?? chat.updatedAt, now)
  const outgoing = lastMessage?.direction === 'out' ? lastMessage : undefined

  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(chat.id)}
      className={cx(
        'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[20px_auto] px-[11px] py-[9px] text-left focus-visible:outline-offset-[-2px]',
        selected ? 'bg-selected' : 'bg-panel hover:bg-hover active:bg-pressed',
      )}
    >
      <span className="col-start-2 row-start-1 self-center truncate text-detail font-medium text-fg">
        {chat.title}
      </span>
      <span className="col-start-3 row-start-1 ml-3 flex items-center justify-end gap-1 self-center text-description text-fg-3 tabular-nums">
        {outgoing && <DeliveryStatus status={outgoing.status} tone="list" decorative />}
        {time}
      </span>
      <span className="col-start-2 row-start-2 line-clamp-2 min-h-[42px] pt-0.5 text-detail break-words text-fg-3">
        <Preview chat={chat} message={lastMessage} />
      </span>
      <span className="col-start-3 row-start-2 mt-0.5 ml-3 flex h-8 items-start justify-end">
        {chat.unread > 0 && <UnreadBadge count={chat.unread} />}
      </span>
      <Avatar
        colorKey={chat.id}
        title={chat.title}
        size={64}
        group={chat.type === 'group'}
        className="col-start-1 row-span-2 row-start-1 mr-3 self-center"
      />
    </button>
  )
}
