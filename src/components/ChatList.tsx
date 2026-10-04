import { NotePencilIcon } from '@phosphor-icons/react'
import { useChat } from '@/state'
import { IconButton } from '@/ui/IconButton'
import { useNow } from '@/ui/useNow'
import { Banner } from './Banner'
import { ChatListItem } from './ChatListItem'
import { LogoutButton, ThemeToggleButton } from './ShellActions'

export function ChatList({ onNewChat }: { onNewChat(): void }) {
  const { chats, activeChat, lastMessages, notice, openChat } = useChat()
  const now = useNow()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-[calc(64px+env(safe-area-inset-top))] shrink-0 items-center gap-2 pt-[calc(16px+env(safe-area-inset-top))] pr-3 pb-3 pl-4">
        <h1 className="min-w-0 flex-1 truncate text-header text-fg">Чаты</h1>
        <IconButton label="Новый чат" tone="themed" onClick={onNewChat}>
          <NotePencilIcon size={24} />
        </IconButton>
        <ThemeToggleButton className="desk:hidden" />
        <LogoutButton className="desk:hidden" />
      </header>

      <Banner notice={activeChat ? null : notice} />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {chats.length === 0 ? (
          <div className="px-8 pt-16 pb-8 text-center">
            <p className="text-title font-semibold text-fg">Чатов пока нет</p>
            <p className="mt-1.5 text-detail text-fg-3">Начните диалог по номеру телефона</p>
          </div>
        ) : (
          <ul
            role="list"
            aria-label="Список чатов"
            className="pb-[max(8px,env(safe-area-inset-bottom))]"
          >
            {chats.map((chat) => (
              <li key={chat.id}>
                <ChatListItem
                  chat={chat}
                  lastMessage={lastMessages[chat.id]}
                  selected={chat.id === activeChat?.id}
                  now={now}
                  onSelect={openChat}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
