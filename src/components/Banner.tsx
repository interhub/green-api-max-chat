import {
  ArrowSquareOutIcon,
  BellSlashIcon,
  InfoIcon,
  WarningCircleIcon,
  WifiSlashIcon,
} from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { useChat } from '@/state'
import type { InstanceState, Notice } from '@/types'
import { Button } from '@/ui/Button'
import { Spinner } from '@/ui/Spinner'

const CONSOLE_URL = 'https://console.green-api.com'

interface BannerContent {
  icon: ReactNode
  text: string
  hint?: string
  action?: 'enable' | 'console'
  actionLabel?: string
}

const CONSOLE_ACTION = { action: 'console', actionLabel: 'Открыть кабинет' } as const

function describeInstanceState(state: InstanceState): BannerContent {
  const icon = <WarningCircleIcon size={20} className="text-icon-attention" />
  switch (state) {
    case 'starting':
      return {
        icon: <Spinner size={20} className="text-icon-themed" />,
        text: 'Инстанс запускается, это занимает до 5 минут.',
      }
    case 'blocked':
      return {
        icon,
        text: 'Аккаунт MAX заблокирован. Подробности в личном кабинете GREEN-API.',
        ...CONSOLE_ACTION,
      }
    case 'suspended':
      return {
        icon,
        text: 'Аккаунт MAX временно ограничен: писать можно только тем, кто сохранил ваш номер.',
      }
    case 'pendingPassword':
      return {
        icon,
        text: 'MAX запрашивает пароль. Введите его в личном кабинете GREEN-API.',
        ...CONSOLE_ACTION,
      }
    case 'notAuthorized':
    case 'authorized':
      return {
        icon,
        text: 'Инстанс не авторизован в MAX. Отсканируйте QR-код в личном кабинете GREEN-API.',
        ...CONSOLE_ACTION,
      }
  }
}

function describe(notice: Notice): BannerContent {
  switch (notice.kind) {
    case 'offline':
      return {
        icon: <WifiSlashIcon size={20} className="text-icon-negative" />,
        text: 'Нет связи с GREEN-API. Пробуем подключиться снова.',
      }
    case 'webhookUrlSet':
      return {
        icon: <WarningCircleIcon size={20} className="text-icon-attention" />,
        text: 'В настройках инстанса указан webhookUrl, поэтому сообщения не приходят.',
        action: 'enable',
        actionLabel: 'Очистить и включить',
      }
    case 'notAuthorized':
      return describeInstanceState(notice.state)
    case 'settingsApplying':
      return {
        icon: <Spinner size={20} className="text-icon-themed" />,
        text: 'Настройки применяются, это занимает до 5 минут.',
      }
    case 'settingsFailed':
      return {
        icon: <WarningCircleIcon size={20} className="text-icon-negative" />,
        text: `Не удалось сохранить настройки: ${notice.message}`,
        action: 'enable',
        actionLabel: 'Повторить',
      }
    case 'notificationsOff':
      return {
        icon: <BellSlashIcon size={20} className="text-icon-attention" />,
        text: 'Приём сообщений выключен в настройках инстанса.',
        hint: 'Инстанс перезапустится, настройки применяются до 5 минут.',
        action: 'enable',
        actionLabel: 'Включить',
      }
    case 'quota':
      return {
        icon: <InfoIcon size={20} className="text-icon-attention" />,
        text: 'Тариф Developer позволяет общаться только с 3 чатами. Чтобы писать в другие чаты, нужен платный тариф.',
      }
  }
}

/** Status strip under the conversation header (or above the chat list) for the current Notice. */
export function Banner({ notice }: { notice: Notice }) {
  const { enableNotifications } = useChat()
  const [pending, setPending] = useState(false)
  const content = describe(notice)

  async function handleEnable() {
    setPending(true)
    try {
      await enableNotifications()
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      role="status"
      data-notice={notice.kind}
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-divider-soft bg-panel px-4 py-2.5 motion-safe:animate-fade-in"
    >
      <div className="flex min-w-[min(100%,240px)] flex-1 items-start gap-3">
        <span className="mt-px flex size-5 shrink-0 items-center justify-center">
          {content.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-bubble-description text-fg">{content.text}</p>
          {content.hint && <p className="mt-0.5 text-description text-fg-3">{content.hint}</p>}
        </div>
      </div>
      {content.action === 'enable' && (
        <Button size="small" loading={pending} onClick={handleEnable} className="ml-8">
          {content.actionLabel}
        </Button>
      )}
      {content.action === 'console' && (
        <a
          href={CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-8 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-action-small text-themed transition-transform duration-100 hover:bg-ghost-hover active:scale-[0.98] active:bg-ghost-pressed"
        >
          {content.actionLabel}
          <ArrowSquareOutIcon size={16} aria-hidden="true" />
        </a>
      )}
    </div>
  )
}
