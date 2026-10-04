import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { Chat, ChatApi, ChatMessage } from '@/types'
import { ChatList } from './ChatList'

const NOW = new Date(2026, 9, 4, 12, 0).getTime()
const DAY = 24 * 60 * 60 * 1000

const chats: Chat[] = [
  {
    id: '1',
    title: 'Анна Смирнова',
    type: 'user',
    phone: '79165551234',
    unread: 2,
    updatedAt: NOW - 60_000,
  },
  { id: '-2', title: 'Команда проекта', type: 'group', unread: 0, updatedAt: NOW - DAY },
  {
    id: '3',
    title: '+7 999 123-45-67',
    type: 'user',
    phone: '79991234567',
    unread: 0,
    updatedAt: NOW - 3 * DAY,
  },
  { id: '4', title: 'Дмитрий', type: 'user', unread: 0, updatedAt: NOW - 30 * DAY },
]

function last(chatId: string, overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: `m-${chatId}`,
    chatId,
    direction: 'in',
    text: 'Привет',
    kind: 'text',
    timestamp: NOW,
    status: 'read',
    ...overrides,
  }
}

const lastMessages: Record<string, ChatMessage | undefined> = {
  '1': last('1', { text: 'До встречи в пятницу!', timestamp: NOW - 60_000 }),
  '-2': last('-2', {
    senderName: 'Олег',
    kind: 'unsupported',
    text: 'Стикер',
    timestamp: NOW - DAY,
  }),
  '3': last('3', {
    direction: 'out',
    status: 'read',
    text: 'Заказ отправлен?',
    timestamp: NOW - 3 * DAY,
  }),
}

function renderList(overrides: Partial<ChatApi> = {}) {
  const onNewChat = vi.fn()
  const openChat = vi.fn<ChatApi['openChat']>()
  renderWithProviders(<ChatList onNewChat={onNewChat} />, {
    chat: { chats, lastMessages, openChat, ...overrides },
  })
  return { onNewChat, openChat }
}

describe('ChatList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists chats as buttons named by the title, with last messages, times and badges', () => {
    renderList()
    const list = screen.getByRole('list', { name: 'Список чатов' })
    const items = within(list).getAllByRole('button')
    expect(items).toHaveLength(4)

    const anna = screen.getByRole('button', { name: /^Анна Смирнова/ })
    expect(anna).toHaveTextContent('11:59')
    expect(anna).toHaveTextContent('До встречи в пятницу!')
    expect(within(anna).getByLabelText('Непрочитанных: 2')).toHaveTextContent('2')

    const team = screen.getByRole('button', { name: /^Команда проекта/ })
    expect(team).toHaveTextContent('Вчера')
    expect(team).toHaveTextContent('Олег: Стикер')
    expect(within(team).getByText('Стикер')).toHaveClass('italic')

    const shop = screen.getByRole('button', { name: /^\+7 999 123-45-67/ })
    expect(shop).toHaveTextContent('Вы: Заказ отправлен?')
    expect(shop).toHaveTextContent('Чт')

    const dmitry = screen.getByRole('button', { name: /^Дмитрий/ })
    expect(dmitry).toHaveTextContent('04.09.26')
    expect(dmitry).toHaveTextContent('Нет сообщений')
  })

  it('opens a chat on click and marks the active one', async () => {
    const user = userEvent.setup()
    const { openChat } = renderList({ activeChat: chats[1] ?? null })

    expect(screen.getByRole('button', { name: /^Команда проекта/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await user.click(screen.getByRole('button', { name: /^Анна Смирнова/ }))
    expect(openChat).toHaveBeenCalledWith('1')
  })

  it('shows only a hint when there are no chats yet', () => {
    renderList({ chats: [], lastMessages: {} })

    expect(screen.getByText('Чатов пока нет')).toBeInTheDocument()
    expect(screen.getByText('Начните диалог по номеру телефона')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Список чатов' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Новый чат' })).toHaveLength(1)
  })

  it('starts a new chat from the header button', async () => {
    const user = userEvent.setup()
    const { onNewChat } = renderList()

    await user.click(screen.getByRole('button', { name: 'Новый чат' }))
    expect(onNewChat).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('shows the notice above the list while no conversation is open', () => {
    renderList({ notice: { kind: 'offline' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Нет связи с GREEN-API. Пробуем подключиться снова.',
    )
  })

  it('keeps the status region empty while the conversation shows the notice', () => {
    renderList({ notice: { kind: 'offline' }, activeChat: chats[0] ?? null })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
