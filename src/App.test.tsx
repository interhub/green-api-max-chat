import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chat, Credentials } from '@/types'
import App from '@/App'

const fake = vi.hoisted(() => ({
  session: null as Credentials | null,
  chats: [] as Chat[],
  totalUnread: 0,
}))

vi.mock('@/state', async () => {
  const contexts = await import('@/state/contexts')
  const { createChatApi, createSessionApi } = await import('@/dev/fakes')
  return {
    ...contexts,
    SessionProvider: ({ children }: { children: ReactNode }) => (
      <contexts.SessionContext.Provider value={createSessionApi({ session: fake.session })}>
        {children}
      </contexts.SessionContext.Provider>
    ),
    ChatProvider: ({ children }: { children: ReactNode }) => (
      <contexts.ChatContext.Provider
        value={createChatApi({ chats: fake.chats, totalUnread: fake.totalUnread })}
      >
        {children}
      </contexts.ChatContext.Provider>
    ),
  }
})

describe('App', () => {
  beforeEach(() => {
    fake.session = null
    fake.chats = []
    fake.totalUnread = 0
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  afterEach(() => {
    document.title = 'Чат для MAX'
  })

  it('shows the login screen while there is no session', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Войдите в чат' })).toBeInTheDocument()
    expect(screen.getByLabelText('idInstance')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Список чатов' })).not.toBeInTheDocument()
  })

  it('shows the chats of a signed-in session and the unread count in the title', () => {
    fake.session = {
      idInstance: '3100000001',
      apiTokenInstance: 'token',
      apiUrl: 'https://3100.api.green-api.com',
    }
    fake.chats = [{ id: '1', title: 'Анна', type: 'user', unread: 3, updatedAt: Date.now() }]
    fake.totalUnread = 3
    render(<App />)

    expect(screen.getByRole('list', { name: 'Список чатов' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Анна/ })).toBeInTheDocument()
    expect(document.title).toBe('(3) Чат для MAX')
  })

  it('switches the theme and remembers the choice', async () => {
    const user = userEvent.setup()
    document.documentElement.dataset.theme = 'dark'
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Сменить тему' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('max-chat:theme')).toBe('light')
  })
})
