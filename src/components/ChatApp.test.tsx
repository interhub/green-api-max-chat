import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/dev/renderWithProviders'
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

function renderApp(chat: Partial<ChatApi> = {}) {
  return renderWithProviders(<ChatApp />, { chat: { chats: [anna, team], ...chat } })
}

describe('ChatApp', () => {
  afterEach(() => {
    document.title = 'Чат для MAX'
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
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(
      within(screen.getByRole('complementary', { name: 'Чаты' })).getByRole('status'),
    ).toBeInTheDocument()
    view.unmount()

    renderApp({ notice, activeChat: anna })
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(within(screen.getByRole('main')).getByRole('status')).toBeInTheDocument()
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
})
