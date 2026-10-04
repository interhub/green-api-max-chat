import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatApi } from '@/dev/fakes'
import { renderWithProviders } from '@/dev/renderWithProviders'
import { ChatContext } from '@/state/contexts'
import type { Chat, ChatApi, ChatMessage } from '@/types'
import { MessageList } from './MessageList'

const NOW = new Date(2026, 9, 4, 12, 0).getTime()
const minute = 60_000

const chat: Chat = { id: '10000001', title: 'Анна', type: 'user', unread: 0, updatedAt: NOW }
const group: Chat = { id: '-1001', title: 'Команда', type: 'group', unread: 0, updatedAt: NOW }

function message(id: string, overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id,
    chatId: chat.id,
    direction: 'in',
    text: `текст ${id}`,
    kind: 'text',
    timestamp: NOW,
    status: 'read',
    ...overrides,
  }
}

/** jsdom has no layout: give the log a fixed scroll geometry and a writable scrollTop. */
function fakeScrollGeometry(element: HTMLElement, scrollTop: number) {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: 2000 })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: 500 })
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  })
}

function renderList(messages: ChatMessage[], target: Chat = chat) {
  const retryMessage = vi.fn<ChatApi['retryMessage']>().mockResolvedValue(undefined)
  const view = renderWithProviders(<MessageList chat={target} />, {
    chat: { messages, retryMessage, activeChat: target },
  })
  return { ...view, retryMessage }
}

describe('MessageList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a polite log with date separators', () => {
    renderList([
      message('a', { timestamp: NOW - 3 * 24 * 60 * minute }),
      message('b', { timestamp: NOW - 24 * 60 * minute }),
      message('c', { timestamp: NOW - minute }),
    ])
    const log = screen.getByRole('log', { name: 'Сообщения' })
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(within(log).getByText('1 октября')).toBeInTheDocument()
    expect(within(log).getByText('Вчера')).toBeInTheDocument()
    expect(within(log).getByText('Сегодня')).toBeInTheDocument()
  })

  it('rounds the touching corners of bubbles sent within five minutes', () => {
    const { container } = renderList([
      message('a', { direction: 'out', status: 'read', timestamp: NOW - 10 * minute }),
      message('b', { direction: 'out', status: 'read', timestamp: NOW - 9 * minute }),
      message('c', { direction: 'out', status: 'read', timestamp: NOW - 8 * minute }),
      message('d', { direction: 'in', timestamp: NOW - 7 * minute }),
    ])
    const rows = container.querySelectorAll('[data-position]')
    expect(Array.from(rows, (row) => row.getAttribute('data-position'))).toEqual([
      'first',
      'middle',
      'last',
      'single',
    ])
    const bubble = (index: number) => rows[index]?.querySelector('[data-side]')
    expect(bubble(0)).toHaveClass('rounded-br-stack')
    expect(bubble(1)).toHaveClass('rounded-r-stack')
    expect(bubble(2)).toHaveClass('rounded-tr-stack')
    expect(bubble(3)).not.toHaveClass('rounded-bl-stack')
  })

  it('labels the delivery status of outgoing messages', () => {
    renderList([
      message('a', { direction: 'out', status: 'sending', timestamp: NOW - 50 * minute }),
      message('b', { direction: 'out', status: 'sent', timestamp: NOW - 40 * minute }),
      message('c', { direction: 'out', status: 'delivered', timestamp: NOW - 30 * minute }),
      message('d', { direction: 'out', status: 'read', timestamp: NOW - 20 * minute }),
      message('e', { direction: 'in', timestamp: NOW - 10 * minute }),
    ])
    for (const label of ['Отправляется', 'Отправлено', 'Доставлено', 'Прочитано']) {
      expect(screen.getByRole('img', { name: label })).toBeInTheDocument()
    }
    expect(screen.getAllByRole('img')).toHaveLength(4)
  })

  it('renders links safely and never renders markup from the text', () => {
    const { container } = renderList([
      message('a', { text: 'Макет: https://example.com/designs <b>важно</b>' }),
    ])
    const link = screen.getByRole('link', { name: 'https://example.com/designs' })
    expect(link).toHaveAttribute('href', 'https://example.com/designs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByText(/<b>важно<\/b>/)).toBeInTheDocument()
  })

  it('shows the error of a failed message and retries it', async () => {
    const user = userEvent.setup()
    const { retryMessage } = renderList([
      message('a', {
        direction: 'out',
        status: 'failed',
        error: 'Тариф Developer позволяет общаться только с 3 чатами.',
      }),
    ])
    expect(screen.getByRole('img', { name: 'Не отправлено' })).toBeInTheDocument()
    expect(
      screen.getByText('Тариф Developer позволяет общаться только с 3 чатами.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(retryMessage).toHaveBeenCalledWith(chat.id, 'a')
  })

  it('shows sender names in group chats and mutes unsupported messages', () => {
    renderList(
      [
        message('a', { chatId: group.id, senderName: 'Иван Петров', timestamp: NOW - 3 * minute }),
        message('b', { chatId: group.id, senderName: 'Иван Петров', timestamp: NOW - 2 * minute }),
        message('c', {
          chatId: group.id,
          senderName: 'Мария',
          kind: 'unsupported',
          text: 'Фото',
          timestamp: NOW - minute,
        }),
      ],
      group,
    )
    expect(screen.getAllByText('Иван Петров')).toHaveLength(1)
    expect(screen.getByText('Мария')).toBeInTheDocument()
    expect(screen.getByText('Фото')).toHaveClass('italic')
  })

  it('invites to write the first message in an empty chat', () => {
    renderList([])
    expect(screen.getByText('Напишите первое сообщение')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Вниз' })).not.toBeInTheDocument()
  })

  it('offers "Вниз" with the count of new incoming messages after the user scrolls up', () => {
    const first = [message('a', { timestamp: NOW - 5 * minute })]
    const tree = (messages: ChatMessage[]) => (
      <ChatContext.Provider value={createChatApi({ messages, activeChat: chat })}>
        <MessageList chat={chat} />
      </ChatContext.Provider>
    )
    const { rerender } = render(tree(first))
    const log = screen.getByRole('log', { name: 'Сообщения' })
    expect(screen.queryByRole('button', { name: 'Вниз' })).not.toBeInTheDocument()

    fakeScrollGeometry(log, 300)
    fireEvent.scroll(log)
    expect(screen.getByRole('button', { name: 'Вниз' })).toBeInTheDocument()

    rerender(tree([...first, message('b', {}), message('c', {})]))
    expect(log.scrollTop).toBe(300)
    expect(within(screen.getByRole('button', { name: 'Вниз' })).getByText('2')).toBeInTheDocument()

    rerender(
      tree([
        ...first,
        message('b', {}),
        message('c', {}),
        message('d', { direction: 'out', status: 'sending' }),
      ]),
    )
    expect(log.scrollTop).toBe(2000)
  })
})
