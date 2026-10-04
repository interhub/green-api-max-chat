import { ArrowLeftIcon } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import { formatPhone } from '@/lib/phone'
import type { Chat } from '@/types'
import { Avatar } from '@/ui/Avatar'
import { IconButton } from '@/ui/IconButton'
import { isDesktop } from '@/ui/media'

function subtitleOf(chat: Chat): string {
  if (chat.type === 'group') return 'Группа'
  const phone = chat.phone ? formatPhone(chat.phone) : null
  return phone && phone !== chat.title ? phone : 'MAX'
}

export function ConversationHeader({ chat, onBack }: { chat: Chat; onBack(): void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  // On a phone the list item that opened the chat is hidden now: the focus moves to the chat title,
  // not to the composer, so the on-screen keyboard stays closed. The desktop composer focuses itself.
  useEffect(() => {
    if (isDesktop()) return undefined
    const frame = requestAnimationFrame(() => headingRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [chat.id])

  return (
    <header className="flex h-[calc(65px+env(safe-area-inset-top))] shrink-0 items-center border-b border-divider-soft bg-panel px-4 pt-[env(safe-area-inset-top)] max-desk:pl-1.5">
      <IconButton label="Назад к чатам" onClick={onBack} className="mr-1 desk:hidden">
        <ArrowLeftIcon size={24} />
      </IconButton>
      <Avatar
        colorKey={chat.id}
        title={chat.title}
        size={40}
        group={chat.type === 'group'}
        className="mr-3"
      />
      <div className="min-w-0 flex-1">
        <h2 ref={headingRef} tabIndex={-1} className="truncate text-chat-title text-fg">
          {chat.title}
        </h2>
        <p className="truncate text-label text-fg-3">{subtitleOf(chat)}</p>
      </div>
    </header>
  )
}
