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

/**
 * Desktop (926px and wider): rail | chat list | conversation inside a 1280px column.
 * Narrower screens show one pane at a time: the list, or the open conversation.
 */
export function ChatApp() {
  const { activeChat, totalUnread } = useChat()
  const [dialogOpen, setDialogOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

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

  const openDialog = () => setDialogOpen(true)

  return (
    <div className="flex h-dvh justify-center bg-surface">
      <div className="grid h-full w-full max-w-[1280px] grid-cols-1 overflow-hidden desk:grid-cols-[77px_393px_minmax(0,1fr)]">
        <NavRail onChatsClick={() => searchRef.current?.focus()} />
        <aside
          aria-label="Чаты"
          className={cx(
            'min-h-0 min-w-0 flex-col bg-panel desk:flex desk:border-r desk:border-divider-soft',
            activeChat ? 'hidden' : 'flex',
          )}
        >
          <ChatList onNewChat={openDialog} searchRef={searchRef} />
        </aside>
        <main className={cx('min-h-0 min-w-0 flex-col desk:flex', activeChat ? 'flex' : 'hidden')}>
          {activeChat ? (
            <Conversation key={activeChat.id} chat={activeChat} />
          ) : (
            <NoConversation onNewChat={openDialog} />
          )}
        </main>
      </div>
      <NewChatDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
