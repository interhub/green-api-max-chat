import { ChatsCircleIcon, NotePencilIcon } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'

/** Desktop placeholder of the conversation pane while no chat is open. */
export function NoConversation({ onNewChat }: { onNewChat(): void }) {
  return (
    <div className="flex h-full items-center justify-center p-6 chat-ground">
      <div className="flex max-w-[320px] flex-col items-center rounded-modal bg-panel px-8 py-7 text-center shadow-float">
        <span className="flex size-16 items-center justify-center rounded-full bg-field text-icon-3">
          <ChatsCircleIcon size={34} aria-hidden="true" />
        </span>
        <p className="mt-4 text-detail text-fg-2">Выберите чат или начните новый</p>
        <Button className="mt-5" onClick={onNewChat}>
          <NotePencilIcon size={20} aria-hidden="true" />
          Новый чат
        </Button>
      </div>
    </div>
  )
}
