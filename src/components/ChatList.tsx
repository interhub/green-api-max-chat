import { ChatsCircleIcon, MagnifyingGlassIcon, NotePencilIcon, XIcon } from '@phosphor-icons/react'
import { useMemo, useState, type Ref } from 'react'
import { useChat } from '@/state'
import type { Chat } from '@/types'
import { Button } from '@/ui/Button'
import { IconButton } from '@/ui/IconButton'
import { useNow } from '@/ui/useNow'
import { Banner } from './Banner'
import { ChatListItem } from './ChatListItem'
import { LogoutButton, ThemeToggleButton } from './ShellActions'

function matchesQuery(chat: Chat, query: string): boolean {
  const text = query.trim().toLowerCase()
  if (!text) return true
  if (chat.title.toLowerCase().includes(text)) return true
  const digits = text.replace(/\D/g, '')
  return digits.length > 0 && (chat.phone ?? '').includes(digits)
}

interface ChatListProps {
  onNewChat(): void
  searchRef?: Ref<HTMLInputElement>
}

export function ChatList({ onNewChat, searchRef }: ChatListProps) {
  const { chats, activeChat, lastMessages, notice, openChat } = useChat()
  const [query, setQuery] = useState('')
  const now = useNow()
  const visibleChats = useMemo(
    () => chats.filter((chat) => matchesQuery(chat, query)),
    [chats, query],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 pt-4 pr-3 pb-3 pl-4">
        <h1 className="min-w-0 flex-1 truncate text-header text-fg">Чаты</h1>
        <IconButton label="Новый чат" tone="themed" onClick={onNewChat}>
          <NotePencilIcon size={24} />
        </IconButton>
        <ThemeToggleButton className="desk:hidden" />
        <LogoutButton className="desk:hidden" />
      </header>

      <div className="shrink-0 px-4 pb-2">
        <div className="flex h-10 items-center rounded-field bg-field has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-0 has-[input:focus-visible]:outline-[#007aff]">
          <MagnifyingGlassIcon size={20} aria-hidden="true" className="ml-3 shrink-0 text-icon-3" />
          <input
            ref={searchRef}
            type="search"
            aria-label="Поиск"
            placeholder="Поиск"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-detail text-fg caret-accent outline-none placeholder:text-fg-3"
          />
          {query && (
            <button
              type="button"
              aria-label="Очистить поиск"
              title="Очистить поиск"
              onClick={() => setQuery('')}
              className="mr-1 inline-flex size-8 items-center justify-center rounded-lg text-icon-3 hover:bg-ghost-hover hover:text-icon-2 active:scale-[0.94]"
            >
              <XIcon size={18} />
            </button>
          )}
        </div>
      </div>

      {!activeChat && notice && <Banner key={notice.kind} notice={notice} />}

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {chats.length === 0 ? (
          <div className="flex flex-col items-center px-8 pt-16 pb-8 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-field text-icon-3">
              <ChatsCircleIcon size={40} aria-hidden="true" />
            </span>
            <p className="mt-5 text-title font-semibold text-fg">Чатов пока нет</p>
            <p className="mt-1.5 text-detail text-fg-3">Начните диалог по номеру телефона</p>
            <Button className="mt-6" onClick={onNewChat}>
              <NotePencilIcon size={20} aria-hidden="true" />
              Новый чат
            </Button>
          </div>
        ) : visibleChats.length === 0 ? (
          <p className="px-8 pt-12 text-center text-detail text-fg-3">Ничего не найдено</p>
        ) : (
          <ul role="list" aria-label="Список чатов" className="pb-2">
            {visibleChats.map((chat) => (
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
