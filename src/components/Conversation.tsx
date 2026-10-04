import { useChat } from '@/state'
import type { Chat } from '@/types'
import { Banner } from './Banner'
import { Composer } from './Composer'
import { ConversationHeader } from './ConversationHeader'
import { MessageList } from './MessageList'

export function Conversation({ chat }: { chat: Chat }) {
  const { notice, openChat } = useChat()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader chat={chat} onBack={() => openChat(null)} />
      {notice && <Banner key={notice.kind} notice={notice} />}
      <div className="flex min-h-0 flex-1 flex-col chat-ground">
        <MessageList chat={chat} />
        <Composer chatId={chat.id} />
      </div>
    </div>
  )
}
