import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatContext } from '@/state/contexts'
import { createChatApi } from '@/test/fakes'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { Chat, ChatApi } from '@/types'
import { ChatApp } from './ChatApp'

const anna: Chat = {
  id: '10000001',
  title: 'Анна Смирнова',
  type: 'user',
  phone: '79165551234',
  unread: 0,
  updatedAt: Date.now(),
}
const team: Chat = { id: '-100200', title: 'Команда', type: 'group', unread: 3, updatedAt: 1 }
const QUOTA_TEXT = 'Тариф Developer позволяет общаться только с 3 чатами.'

function renderApp(chat: Partial<ChatApi> = {}) {
  return renderWithProviders(<ChatApp />, { chat: { chats: [anna, team], ...chat } })
}

/** Desktop is 926px and wider; jsdom has no matchMedia at all. */
function stubViewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: desktop && query.includes('min-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }))
}

/** ChatApi with real open/start behaviour, so focus can be followed across screens. */
function StatefulChatApp({ initialChats, created }: { initialChats: Chat[]; created?: Chat }) {
  const [chats, setChats] = useState(initialChats)
  const [activeId, setActiveId] = useState<string | null>(null)
  const value = createChatApi({
    chats,
    activeChat: chats.find((chat) => chat.id === activeId) ?? null,
    openChat: setActiveId,
    startChat: async () => {
      if (!created) return { ok: false, error: 'Этот номер не найден в MAX.' }
      setChats((list) => [created, ...list])
      setActiveId(created.id)
      return { ok: true, chatId: created.id }
    },
  })
  return (
    <ChatContext.Provider value={value}>
      <ChatApp />
    </ChatContext.Provider>
  )
}

describe('ChatApp', () => {
  afterEach(() => {
    document.title = 'Чат для MAX'
    vi.unstubAllGlobals()
  })

  it('puts the unread count into the document title', () => {
    const view = renderApp({ totalUnread: 3 })
    expect(document.title).toBe('(3) Чат для MAX')
    view.unmount()
    expect(document.title).toBe('Чат для MAX')
  })

  it('shows the placeholder and opens the new chat dialog', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(screen.getByText('Выберите чат или начните новый')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Новый чат' })).not.toBeInTheDocument()

    const aside = screen.getByRole('complementary', { name: 'Чаты' })
    await user.click(within(aside).getByRole('button', { name: 'Новый чат' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый чат' })
    expect(within(dialog).getByRole('heading', { name: 'Новый чат' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Номер телефона')).toHaveFocus()
  })

  it('offers one "Новый чат" button in the conversation pane while there are no chats', () => {
    renderApp({ chats: [] })
    const main = screen.getByRole('main')
    expect(within(main).getByText('Начните диалог по номеру телефона')).toBeInTheDocument()
    expect(within(main).getAllByRole('button', { name: 'Новый чат' })).toHaveLength(1)
    expect(screen.queryByText('Выберите чат или начните новый')).not.toBeInTheDocument()
  })

  it('shows the open conversation with its header, log and composer', async () => {
    const user = userEvent.setup()
    const openChat = vi.fn<ChatApi['openChat']>()
    renderApp({ activeChat: anna, openChat })

    expect(screen.getByRole('heading', { level: 2, name: 'Анна Смирнова' })).toBeInTheDocument()
    expect(screen.getByText('+7 916 555-12-34')).toBeInTheDocument()
    expect(screen.getByRole('log', { name: 'Сообщения' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Сообщение' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Назад к чатам' }))
    expect(openChat).toHaveBeenCalledWith(null)
  })

  it('shows one banner: above the list without a chat, under the header with a chat', () => {
    const notice = { kind: 'quota', description: 'quota' } as const
    const view = renderApp({ notice })
    expect(screen.getAllByText(QUOTA_TEXT, { exact: false })).toHaveLength(1)
    expect(
      within(screen.getByRole('complementary', { name: 'Чаты' })).getByRole('status'),
    ).toHaveTextContent(QUOTA_TEXT)
    view.unmount()

    renderApp({ notice, activeChat: anna })
    expect(screen.getAllByText(QUOTA_TEXT, { exact: false })).toHaveLength(1)
    expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(QUOTA_TEXT)
  })

  it('has the rail actions to switch the theme and to log out', async () => {
    const user = userEvent.setup()
    const logout = vi.fn()
    renderWithProviders(<ChatApp />, { chat: { chats: [anna] }, session: { logout } })
    const rail = screen.getByRole('navigation', { name: 'Разделы' })

    expect(within(rail).getByRole('button', { name: 'Чаты' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await user.click(within(rail).getByRole('button', { name: 'Выйти' }))
    expect(logout).toHaveBeenCalledTimes(1)
    expect(within(rail).getByRole('button', { name: 'Сменить тему' })).toBeInTheDocument()
  })

  it('moves the focus to the chat list from the rail', async () => {
    const user = userEvent.setup()
    renderApp()
    const rail = screen.getByRole('navigation', { name: 'Разделы' })

    await user.click(within(rail).getByRole('button', { name: 'Чаты' }))
    expect(screen.getByRole('button', { name: /^Анна Смирнова/ })).toHaveFocus()
  })

  it('focuses the message field on desktop once "Начать чат" succeeds', async () => {
    stubViewport(true)
    const user = userEvent.setup()
    renderWithProviders(<StatefulChatApp initialChats={[]} created={anna} />)

    const aside = screen.getByRole('complementary', { name: 'Чаты' })
    await user.click(within(aside).getByRole('button', { name: 'Новый чат' }))
    await user.type(screen.getByLabelText('Номер телефона'), '+7 916 555-12-34')
    await user.click(screen.getByRole('button', { name: 'Начать чат' }))

    expect(screen.queryByLabelText('Номер телефона')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Сообщение' })).toHaveFocus())
  })

  it('on a phone focuses the chat title on open and the chat item after "Назад к чатам"', async () => {
    stubViewport(false)
    const user = userEvent.setup()
    renderWithProviders(<StatefulChatApp initialChats={[anna, team]} />)

    await user.click(screen.getByRole('button', { name: /^Команда/ }))
    const heading = screen.getByRole('heading', { level: 2, name: 'Команда' })
    await waitFor(() => expect(heading).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'Назад к чатам' }))
    expect(screen.getByRole('button', { name: /^Команда/ })).toHaveFocus()
  })
})
