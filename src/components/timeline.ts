import type { ChatMessage } from '@/types'
import { isSameDay, startOfDay } from '@/ui/format'

/** Place of a bubble in a run of messages from the same sender (MAX "stack"). */
export type StackPosition = 'single' | 'first' | 'middle' | 'last'

export interface TimelineMessage {
  message: ChatMessage
  position: StackPosition
  /** Group chats: sender name on the first incoming bubble of a run. */
  showAuthor: boolean
  /** Group chats: sender avatar next to the last incoming bubble of a run. */
  showAvatar: boolean
}

export interface TimelineDay {
  key: string
  timestamp: number
  messages: TimelineMessage[]
}

const STACK_WINDOW_MS = 5 * 60 * 1000

function sameSender(a: ChatMessage, b: ChatMessage): boolean {
  if (a.direction !== b.direction) return false
  return a.direction === 'out' || (a.senderName ?? '') === (b.senderName ?? '')
}

function stacks(previous: ChatMessage, next: ChatMessage): boolean {
  return (
    sameSender(previous, next) &&
    next.timestamp - previous.timestamp <= STACK_WINDOW_MS &&
    isSameDay(previous.timestamp, next.timestamp)
  )
}

function positionOf(joinsPrevious: boolean, joinsNext: boolean): StackPosition {
  if (joinsPrevious) return joinsNext ? 'middle' : 'last'
  return joinsNext ? 'first' : 'single'
}

/** Groups messages (oldest first) by day and marks how each bubble joins its neighbours. */
export function buildTimeline(messages: ChatMessage[], isGroup: boolean): TimelineDay[] {
  const days: TimelineDay[] = []
  messages.forEach((message, index) => {
    const previous = messages[index - 1]
    const next = messages[index + 1]
    let day = days.at(-1)
    if (!day || !previous || !isSameDay(previous.timestamp, message.timestamp)) {
      day = {
        key: `day-${startOfDay(message.timestamp)}`,
        timestamp: message.timestamp,
        messages: [],
      }
      days.push(day)
    }
    const joinsPrevious = previous !== undefined && stacks(previous, message)
    const joinsNext = next !== undefined && stacks(message, next)
    const incomingInGroup = isGroup && message.direction === 'in'
    day.messages.push({
      message,
      position: positionOf(joinsPrevious, joinsNext),
      showAuthor: incomingInGroup && !joinsPrevious && Boolean(message.senderName),
      showAvatar: incomingInGroup && !joinsNext,
    })
  })
  return days
}
