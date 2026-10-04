import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types'
import { buildTimeline } from './timeline'

const base = new Date(2026, 9, 4, 12, 0).getTime()
const minute = 60_000

function message(
  id: string,
  offsetMinutes: number,
  direction: 'in' | 'out',
  senderName?: string,
): ChatMessage {
  return {
    id,
    chatId: '1',
    direction,
    text: id,
    kind: 'text',
    timestamp: base + offsetMinutes * minute,
    status: direction === 'out' ? 'sent' : 'read',
    senderName,
  }
}

const positions = (messages: ChatMessage[], isGroup = false) =>
  buildTimeline(messages, isGroup).flatMap((day) => day.messages.map((item) => item.position))

describe('buildTimeline', () => {
  it('splits messages by calendar day', () => {
    const days = buildTimeline(
      [message('a', -24 * 60, 'in'), message('b', -1, 'in'), message('c', 0, 'out')],
      false,
    )
    expect(days.map((day) => day.messages.map((item) => item.message.id))).toEqual([
      ['a'],
      ['b', 'c'],
    ])
  })

  it('stacks messages of the same sender within five minutes', () => {
    expect(
      positions([
        message('a', 0, 'out'),
        message('b', 1, 'out'),
        message('c', 5, 'out'),
        message('d', 11, 'out'),
        message('e', 12, 'in'),
      ]),
    ).toEqual(['first', 'middle', 'last', 'single', 'single'])
  })

  it('shows the author on the first and the avatar on the last bubble of a group run', () => {
    const days = buildTimeline(
      [
        message('a', 0, 'in', 'Иван'),
        message('b', 1, 'in', 'Иван'),
        message('c', 2, 'in', 'Мария'),
        message('d', 3, 'out'),
      ],
      true,
    )
    const items = days.flatMap((day) => day.messages)
    expect(items.map((item) => [item.position, item.showAuthor, item.showAvatar])).toEqual([
      ['first', true, false],
      ['last', false, true],
      ['single', true, true],
      ['single', false, false],
    ])
  })
})
