import { ChatsCircleIcon } from '@phosphor-icons/react'
import { useChat } from '@/state'
import { Logo } from '@/ui/Logo'
import { LogoutButton, ThemeToggleButton } from './ShellActions'

/** Left navigation rail of the desktop layout (77px, as in web.max.ru). */
export function NavRail({ onChatsClick }: { onChatsClick(): void }) {
  const { totalUnread } = useChat()
  return (
    <nav
      aria-label="Разделы"
      className="hidden w-[77px] flex-col items-center border-r border-divider-soft bg-panel pb-4 desk:flex"
    >
      <div className="flex h-16 items-center justify-center">
        <Logo size={36} />
      </div>
      <div className="w-full px-1">
        <button
          type="button"
          aria-current="page"
          onClick={onChatsClick}
          className="flex w-full flex-col items-center gap-1 rounded-xl px-0.5 py-2 text-tag text-fg transition-transform duration-100 hover:bg-ghost-hover active:scale-[0.96] active:bg-ghost-pressed"
        >
          <span className="relative inline-flex">
            <ChatsCircleIcon size={28} />
            {totalUnread > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1.5 left-[18px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-panel bg-counter px-1 text-[10px]/3 font-medium text-white tabular-nums"
              >
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </span>
          Чаты
        </button>
      </div>
      <div className="mt-auto flex flex-col items-center gap-2">
        <ThemeToggleButton />
        <LogoutButton />
      </div>
    </nav>
  )
}
