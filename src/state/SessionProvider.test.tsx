import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { connect, type Connection } from '@/api'
import { GreenApiError } from '@/api/errors'
import { loadData, loadSession, saveData, saveSession } from '@/lib/storage'
import type { LoginInput, LoginResult, SessionApi } from '@/types'
import { useSession } from './contexts'
import { SessionProvider } from './SessionProvider'
import { createFakeClient, testCredentials } from './testing/fakeClient'

vi.mock('@/api', async () => {
  const errors = await import('@/api/errors')
  return { ...errors, createClient: vi.fn(), connect: vi.fn(), mapNotification: vi.fn() }
})

const input: LoginInput = {
  idInstance: ' 3100000001 ',
  apiTokenInstance: ' test-token ',
  apiUrl: '',
  remember: true,
}

function Probe({ onChange }: { onChange: (api: SessionApi) => void }) {
  const api = useSession()
  useEffect(() => {
    onChange(api)
  })
  return null
}

function renderSession() {
  let current: SessionApi | null = null
  render(
    <SessionProvider>
      <Probe
        onChange={(api) => {
          current = api
        }}
      />
    </SessionProvider>,
  )
  return {
    get api(): SessionApi {
      if (!current) throw new Error('SessionProvider did not render')
      return current
    },
  }
}

async function login(session: { api: SessionApi }, value: LoginInput): Promise<LoginResult> {
  let result: LoginResult | null = null
  await act(async () => {
    result = await session.api.login(value)
  })
  if (!result) throw new Error('login did not finish')
  return result
}

function connection(): Connection {
  return { client: createFakeClient().client, state: 'authorized' }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.mocked(connect).mockReset()
  vi.mocked(connect).mockResolvedValue(connection())
})

describe('SessionProvider', () => {
  it('restores the saved session without a request', () => {
    saveSession(testCredentials, true)
    const session = renderSession()
    expect(session.api.session).toEqual(testCredentials)
    expect(session.api.initialState).toBeNull()
    expect(connect).not.toHaveBeenCalled()
  })

  it.each([
    [{ idInstance: '' }, 'idInstance', 'Введите idInstance: только цифры.'],
    [{ idInstance: '3100abc' }, 'idInstance', 'Введите idInstance: только цифры.'],
    [{ apiTokenInstance: '   ' }, 'apiTokenInstance', 'Введите apiTokenInstance.'],
    [
      { apiUrl: 'ftp://3100.api.green-api.com' },
      'apiUrl',
      'Укажите API URL, начинающийся с https://',
    ],
    [{ apiUrl: '3100.api.green-api.com' }, 'apiUrl', 'Укажите API URL, начинающийся с https://'],
  ])('rejects %j without a request', async (patch, field, error) => {
    const session = renderSession()
    expect(await login(session, { ...input, ...patch })).toEqual({ ok: false, field, error })
    expect(connect).not.toHaveBeenCalled()
  })

  it('connects with trimmed values, remembers the session and clears the message', async () => {
    const session = renderSession()
    act(() => session.api.logout('Сессия завершена: проверьте idInstance и apiTokenInstance.'))
    expect(session.api.message).toBe('Сессия завершена: проверьте idInstance и apiTokenInstance.')
    expect(await login(session, input)).toEqual({ ok: true })
    expect(connect).toHaveBeenCalledWith({
      idInstance: '3100000001',
      apiTokenInstance: 'test-token',
      apiUrl: undefined,
    })
    expect(session.api.session).toEqual(testCredentials)
    expect(session.api.initialState).toBe('authorized')
    expect(session.api.message).toBeNull()
    expect(localStorage.getItem('max-chat:session')).not.toBeNull()
  })

  it('passes an explicit API URL and keeps a session that should not be remembered in this tab only', async () => {
    const session = renderSession()
    await login(session, { ...input, apiUrl: ' http://localhost:8787 ', remember: false })
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ apiUrl: 'http://localhost:8787' }),
    )
    expect(localStorage.getItem('max-chat:session')).toBeNull()
    expect(sessionStorage.getItem('max-chat:session')).not.toBeNull()
    expect(loadSession()).toEqual(testCredentials)
  })

  it.each([
    [
      new GreenApiError('auth', 'Неверный idInstance или apiTokenInstance.', 401),
      { ok: false, field: 'apiTokenInstance', error: 'Неверный idInstance или apiTokenInstance.' },
    ],
    [
      new GreenApiError('forbidden', 'Неверный idInstance или адрес API.', 403),
      { ok: false, field: 'idInstance', error: 'Неверный idInstance или адрес API.' },
    ],
    [
      new GreenApiError('wrongHost', 'Этот адрес API не обслуживает указанный idInstance.', 404),
      {
        ok: false,
        field: 'idInstance',
        error: 'Этот адрес API не обслуживает указанный idInstance.',
      },
    ],
    [
      new GreenApiError('network', 'Не удалось подключиться к GREEN-API.'),
      { ok: false, error: 'Не удалось подключиться к GREEN-API.' },
    ],
    [new Error('boom'), { ok: false, error: 'Не удалось войти. Попробуйте ещё раз.' }],
  ])('maps %s to the form', async (error, expected) => {
    vi.mocked(connect).mockRejectedValue(error)
    const session = renderSession()
    expect(await login(session, input)).toEqual(expected)
    expect(session.api.session).toBeNull()
    expect(loadSession()).toBeNull()
  })

  it('ignores a second login while the first one is running', async () => {
    let finish: (value: Connection) => void = () => undefined
    vi.mocked(connect).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const session = renderSession()
    const first = session.api.login(input)
    const second = session.api.login(input)
    expect(second).toBe(first)
    expect(connect).toHaveBeenCalledOnce()
    await act(async () => {
      finish(connection())
      await first
    })
    await expect(second).resolves.toEqual({ ok: true })
    await login(session, input)
    expect(connect).toHaveBeenCalledTimes(2)
  })

  it('logout forgets the session but keeps the chat history', () => {
    saveSession(testCredentials, true)
    saveData(testCredentials.idInstance, {
      chats: { a: { id: 'a', title: 'Анна', type: 'user', unread: 0, updatedAt: 1 } },
      messages: {},
    })
    const session = renderSession()
    act(() => session.api.logout())
    expect(session.api.session).toBeNull()
    expect(session.api.message).toBeNull()
    expect(loadSession()).toBeNull()
    expect(loadData(testCredentials.idInstance).chats).toHaveProperty('a')
  })
})
