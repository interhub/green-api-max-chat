import { ArrowLeftIcon } from '@phosphor-icons/react'
import type { Chat } from '@/types'
import { Avatar } from '@/ui/Avatar'
import { formatPhone } from '@/ui/format'
import { IconButton } from '@/ui/IconButton'

function subtitleOf(chat: Chat): string {
  if (chat.type === 'group') return 'Группа'
  const phone = chat.phone ? formatPhone(chat.phone) : null
  return phone && phone !== chat.title ? phone : 'MAX'
}

export function ConversationHeader({ chat, onBack }: { chat: Chat; onBack(): void }) {
  return (
    <header className="flex h-[65px] shrink-0 items-center border-b border-divider-soft bg-panel px-4 max-desk:pl-1.5">
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
        <h2 className="truncate text-[16px]/5 font-semibold tracking-[0.15px] text-fg">
          {chat.title}
        </h2>
        <p className="truncate text-label text-fg-3">{subtitleOf(chat)}</p>
      </div>
    </header>
  )
}
