import { ChatsCircleIcon, NotePencilIcon } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'

interface NoConversationProps {
  hasChats: boolean
  onNewChat(): void
}

/** Desktop placeholder of the conversation pane while no chat is open. */
export function NoConversation({ hasChats, onNewChat }: NoConversationProps) {
  return (
    <div className="flex h-full items-center justify-center p-6 chat-ground">
      <div className="flex max-w-[360px] flex-col items-center rounded-modal bg-panel px-8 py-7 text-center shadow-float">
        <span className="flex size-16 items-center justify-center rounded-full bg-field text-icon-3">
          <ChatsCircleIcon size={34} aria-hidden="true" />
        </span>
        <p className="mt-4 text-detail text-fg-2">
          {hasChats ? 'Выберите чат или начните новый' : 'Начните диалог по номеру телефона'}
        </p>
        <Button className="mt-5" onClick={onNewChat}>
          <NotePencilIcon size={20} aria-hidden="true" />
          Новый чат
        </Button>
      </div>
    </div>
  )
}
