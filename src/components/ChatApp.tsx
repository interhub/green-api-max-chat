import { useEffect, useRef, useState } from 'react'
import { useChat } from '@/state'
import { cx } from '@/ui/cx'
import { trackInputModality } from '@/ui/inputModality'
import { ChatList } from './ChatList'
import { Conversation } from './Conversation'
import { NavRail } from './NavRail'
import { NewChatDialog } from './NewChatDialog'
import { NoConversation } from './NoConversation'

const APP_TITLE = 'Чат для MAX'

function findChatItem(root: HTMLElement | null, chatId: string): HTMLElement | undefined {
  const items = root?.querySelectorAll<HTMLElement>('[data-chat-id]') ?? []
  return Array.from(items).find((item) => item.dataset.chatId === chatId)
}

/**
 * Desktop (926px and wider): rail | chat list | conversation inside a 1280px column.
 * Narrower screens show one pane at a time: the list, or the open conversation.
 */
export function ChatApp() {
  const { chats, activeChat, totalUnread } = useChat()
  const [dialogOpen, setDialogOpen] = useState(false)
  const asideRef = useRef<HTMLElement>(null)
  const activeChatId = activeChat?.id ?? null
  const previousChatIdRef = useRef(activeChatId)

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) ${APP_TITLE}` : APP_TITLE
  }, [totalUnread])

  useEffect(() => {
    const stopTracking = trackInputModality()
    return () => {
      stopTracking()
      document.title = APP_TITLE
    }
  }, [])

  // "Назад к чатам" removes the focused button together with the conversation: the focus goes to the
  // list item of the chat that was just closed.
  useEffect(() => {
    const previousChatId = previousChatIdRef.current
    previousChatIdRef.current = activeChatId
    if (activeChatId !== null || previousChatId === null) return
    if (document.activeElement && document.activeElement !== document.body) return
    findChatItem(asideRef.current, previousChatId)?.focus()
  }, [activeChatId])

  function focusChatList() {
    const aside = asideRef.current
    const target =
      (activeChatId && findChatItem(aside, activeChatId)) ||
      aside?.querySelector<HTMLElement>('[data-chat-id]') ||
      aside?.querySelector<HTMLElement>('button')
    target?.focus()
  }

  const openDialog = () => setDialogOpen(true)

  return (
    <div className="flex h-dvh justify-center bg-surface pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <div className="grid h-full w-full max-w-[1280px] grid-cols-1 overflow-hidden desk:grid-cols-[77px_393px_minmax(0,1fr)]">
        <NavRail onChatsClick={focusChatList} />
        <aside
          ref={asideRef}
          aria-label="Чаты"
          className={cx(
            'min-h-0 min-w-0 flex-col bg-panel desk:flex desk:border-r desk:border-divider-soft',
            activeChat ? 'hidden' : 'flex',
          )}
        >
          <ChatList onNewChat={openDialog} />
        </aside>
        <main className={cx('min-h-0 min-w-0 flex-col desk:flex', activeChat ? 'flex' : 'hidden')}>
          {activeChat ? (
            <Conversation key={activeChat.id} chat={activeChat} />
          ) : (
            <NoConversation hasChats={chats.length > 0} onNewChat={openDialog} />
          )}
        </main>
      </div>
      <NewChatDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
