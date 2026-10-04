import { CheckIcon, ChecksIcon, ClockIcon } from '@phosphor-icons/react'
import type { MessageStatus } from '@/types'
import { cx } from '@/ui/cx'

const STATUS_LABELS: Record<MessageStatus, string> = {
  sending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Не отправлено',
}

const BUBBLE_TONES: Record<MessageStatus, string> = {
  sending: 'text-bubble-tick',
  sent: 'text-bubble-tick',
  delivered: 'text-bubble-tick',
  read: 'text-bubble-read',
  failed: 'text-icon-negative',
}

const LIST_TONES: Record<MessageStatus, string> = {
  sending: 'text-icon-mute',
  sent: 'text-icon-3',
  delivered: 'text-icon-3',
  read: 'text-icon-themed',
  failed: 'text-icon-negative',
}

/** Filled red circle with "!": stays readable on the violet outgoing bubble. */
function FailedIcon() {
  return (
    <svg aria-hidden="true" width={16} height={16} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 4.6v4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="1.05" fill="#fff" />
    </svg>
  )
}

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'sending':
      return <ClockIcon size={14} />
    case 'sent':
      return <CheckIcon size={16} />
    case 'delivered':
    case 'read':
      return <ChecksIcon size={16} />
    case 'failed':
      return <FailedIcon />
  }
}

interface DeliveryStatusProps {
  status: MessageStatus
  /** "bubble" uses the bubble tick colors, "list" the chat list icon colors. */
  tone: 'bubble' | 'list'
  /** The chat list repeats the status of the conversation, so it stays out of the accessibility tree. */
  decorative?: boolean
}

export function DeliveryStatus({ status, tone, decorative = false }: DeliveryStatusProps) {
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img', 'aria-label': STATUS_LABELS[status] }
  return (
    <span
      {...a11y}
      data-status={status}
      className={cx(
        'inline-flex size-4 shrink-0 items-center justify-center',
        tone === 'bubble' ? BUBBLE_TONES[status] : LIST_TONES[status],
      )}
    >
      <StatusIcon status={status} />
    </span>
  )
}
