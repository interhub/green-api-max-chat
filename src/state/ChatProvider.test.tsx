import { act, cleanup, render } from '@testing-library/react'
import { StrictMode, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, mapNotification } from '@/api'
import { GreenApiError } from '@/api/errors'
import { loadData, saveData } from '@/lib/storage'
import type {
  AppEvent,
  ChatApi,
  ChatMessage,
  InstanceState,
  SessionApi,
  StartChatResult,
} from '@/types'
import { ChatProvider } from './ChatProvider'
import { SessionContext, useChat } from './contexts'
import { createFakeClient, testCredentials, type FakeClient } from './testing/fakeClient'

vi.mock('@/api', async () => {
  const errors = await import('@/api/errors')
  return { ...errors, createClient: vi.fn(), connect: vi.fn(), mapNotification: vi.fn() }
})

const CHAT_ID = '20000000'
const PHONE = '79001234567'

let fake: FakeClient
const logout = vi.fn<SessionApi['logout']>()

function Probe({ onChange }: { onChange: (api: ChatApi) => void }) {
  const api = useChat()
  useEffect(() => {
    onChange(api)
  })
  return null
}

function renderChat(options: { initialState?: InstanceState | null; strict?: boolean } = {}) {
  let current: ChatApi | null = null
  const session: SessionApi = {
    session: testCredentials,
    initialState: options.initialState === undefined ? 'authorized' : options.initialState,
    message: null,
    login: vi.fn(),
    logout,
  }
  const tree = (
    <SessionContext.Provider value={session}>
      <ChatProvider>
        <Probe
          onChange={(api) => {
            current = api
          }}
        />
      </ChatProvider>
    </SessionContext.Provider>
  )
  render(options.strict ? <StrictMode>{tree}</StrictMode> : tree)
  return {
    get api(): ChatApi {
      if (!current) throw new Error('ChatProvider did not render')
      return current
    },
  }
}

async function flush(ms = 0): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms))
}

function seedChat(messages: ChatMessage[] = []): void {
  saveData(testCredentials.idInstance, {
    chats: {
      [CHAT_ID]: {
        id: CHAT_ID,
        title: '+7 900 123-45-67',
        type: 'user',
        phone: PHONE,
        unread: 0,
        updatedAt: 1_000,
      },
    },
    messages: { [CHAT_ID]: messages },
  })
}

async function renderOpenChat() {
  seedChat()
  const chat = renderChat()
  await flush()
  act(() => chat.api.openChat(CHAT_ID))
  return chat
}

function messageEvent(origin: 'incoming' | 'api', remoteId: string, text: string): AppEvent {
  return {
    type: 'message',
    origin,
    chat: { id: CHAT_ID, title: origin === 'incoming' ? 'Анна' : '+7 900 123-45-67', type: 'user' },
    message: { remoteId, timestamp: Date.now(), text, kind: 'text' },
  }
}

function statusEvent(remoteId: string, status: 'delivered' | 'read'): AppEvent {
  return { type: 'status', chatId: CHAT_ID, remoteId, status }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const AUTH_ERROR = 'Неверный idInstance или apiTokenInstance.'
const WEBHOOK_URL_ERROR = 'В настройках инстанса указан webhookUrl, поэтому сообщения не приходят.'

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  logout.mockReset()
  fake = createFakeClient()
  vi.mocked(createClient).mockReturnValue(fake.client)
  vi.mocked(mapNotification).mockImplementation(fake.mapNotification)
})

afterEach(() => {
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'hidden')
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('ChatProvider: mount', () => {
  it('restores stored chats and marks messages that were still sending as failed', async () => {
    seedChat([
      {
        id: 'm1',
        chatId: CHAT_ID,
        direction: 'out',
        text: 'Привет',
        kind: 'text',
        timestamp: 1_000,
        status: 'sending',
      },
    ])
    const chat = renderChat()
    await flush()
    act(() => chat.api.openChat(CHAT_ID))
    expect(chat.api.activeChat?.id).toBe(CHAT_ID)
    expect(chat.api.messages).toEqual([
      expect.objectContaining({ id: 'm1', status: 'failed', error: 'Не отправлено' }),
    ])
    expect(createClient).toHaveBeenCalledWith(testCredentials)
  })

  it('uses the state seen at login and reads the settings once', async () => {
    const chat = renderChat()
    await flush()
    expect(fake.client.getStateInstance).not.toHaveBeenCalled()
    expect(fake.client.getSettings).toHaveBeenCalledOnce()
    expect(chat.api.instanceState).toBe('authorized')
    expect(chat.api.notice).toBeNull()
  })

  it('reads the instance state of a restored session', async () => {
    fake.client.getStateInstance.mockResolvedValue('notAuthorized')
    const chat = renderChat({ initialState: null })
    await flush()
    expect(fake.client.getStateInstance).toHaveBeenCalledOnce()
    expect(chat.api.notice).toEqual({ kind: 'notAuthorized', state: 'notAuthorized' })
  })

  it('retries the instance state after a rate limit and logs out on a rejected token', async () => {
    fake.client.getStateInstance
      .mockRejectedValueOnce(new GreenApiError('rateLimit', 'Слишком много запросов.', 429))
      .mockRejectedValueOnce(new GreenApiError('auth', AUTH_ERROR, 401))
    renderChat({ initialState: null })
    await flush(1_199)
    expect(fake.client.getStateInstance).toHaveBeenCalledOnce()
    await flush(1)
    expect(fake.client.getStateInstance).toHaveBeenCalledTimes(2)
    expect(logout).toHaveBeenCalledWith(AUTH_ERROR)
  })

  it('shows notificationsOff when incoming notifications are switched off', async () => {
    fake.client.getSettings.mockResolvedValue({ webhookUrl: '', incomingWebhook: 'no' })
    const chat = renderChat()
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'notificationsOff' })
  })

  it('shows webhookUrlSet when a webhook URL blocks polling', async () => {
    fake.client.getSettings.mockResolvedValue({
      webhookUrl: 'https://example.com',
      incomingWebhook: 'yes',
    })
    const chat = renderChat()
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'webhookUrlSet' })
  })
})

describe('ChatProvider: instance state and settings checks', () => {
  it('re-reads the state every 15 seconds until the instance is authorized', async () => {
    fake.client.getStateInstance
      .mockResolvedValueOnce('notAuthorized')
      .mockResolvedValueOnce('authorized')
    const chat = renderChat({ initialState: 'starting' })
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'notAuthorized', state: 'starting' })
    expect(fake.client.getStateInstance).not.toHaveBeenCalled()
    await flush(15_000)
    expect(fake.client.getStateInstance).toHaveBeenCalledOnce()
    expect(chat.api.notice).toEqual({ kind: 'notAuthorized', state: 'notAuthorized' })
    await flush(15_000)
    expect(chat.api.notice).toBeNull()
    await flush(60_000)
    expect(fake.client.getStateInstance).toHaveBeenCalledTimes(2)
    expect(fake.client.getSettings).toHaveBeenCalledOnce()
  })

  it('checks when the tab becomes visible, one check at a time', async () => {
    const answer = deferred<InstanceState>()
    fake.client.getStateInstance.mockReturnValue(answer.promise)
    const chat = renderChat({ initialState: 'notAuthorized' })
    await flush()
    setHidden(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush(15_000)
    expect(fake.client.getStateInstance).toHaveBeenCalledOnce()
    answer.resolve('authorized')
    await flush()
    expect(chat.api.notice).toBeNull()
  })

  it('reads the settings again when polling recovers after an offline start', async () => {
    fake.client.getSettings
      .mockRejectedValueOnce(new GreenApiError('network', 'Нет связи с GREEN-API.'))
      .mockResolvedValueOnce({ webhookUrl: '', incomingWebhook: 'no' })
    const chat = renderChat()
    await flush()
    fake.pushError(new GreenApiError('network', 'Нет связи с GREEN-API.'))
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'offline' })
    fake.pushNotification(null)
    await flush(1_000)
    expect(fake.client.getSettings).toHaveBeenCalledTimes(2)
    expect(chat.api.notice).toEqual({ kind: 'notificationsOff' })
  })

  it('reads the settings again when a webhookUrl stops blocking polling', async () => {
    fake.client.getSettings
      .mockResolvedValueOnce({ webhookUrl: 'https://example.com', incomingWebhook: 'yes' })
      .mockResolvedValueOnce({ webhookUrl: '', incomingWebhook: 'yes' })
    const chat = renderChat()
    await flush()
    fake.pushError(new GreenApiError('webhookUrlSet', WEBHOOK_URL_ERROR, 400))
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'webhookUrlSet' })
    fake.pushNotification(null)
    await flush(10_000)
    expect(fake.client.getSettings).toHaveBeenCalledTimes(2)
    expect(chat.api.notice).toBeNull()
  })

  it('shows a starting instance instead of the offline notice and checks it after recovery', async () => {
    const chat = renderChat()
    await flush()
    fake.pushError(
      new GreenApiError('instance', 'Инстанс сейчас не готов: инстанс запускается.', 400),
    )
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'notAuthorized', state: 'starting' })
    fake.pushNotification(null)
    await flush(10_000)
    expect(fake.client.getStateInstance).toHaveBeenCalledOnce()
    expect(chat.api.notice).toBeNull()
  })

  it('logs out when a later check finds rejected credentials', async () => {
    fake.client.getStateInstance.mockRejectedValue(new GreenApiError('auth', AUTH_ERROR, 401))
    renderChat({ initialState: 'starting' })
    await flush(15_000)
    expect(logout).toHaveBeenCalledWith(AUTH_ERROR)
  })
})

describe('ChatProvider: notifications settings', () => {
  it('sends the settings and waits until the instance applies them', async () => {
    const off = { webhookUrl: '', incomingWebhook: 'no' } as const
    fake.client.getSettings.mockResolvedValueOnce(off).mockResolvedValueOnce(off)
    const chat = renderChat()
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'notificationsOff' })
    await act(() => chat.api.enableNotifications())
    expect(fake.client.setSettings).toHaveBeenCalledWith({
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      outgoingAPIMessageWebhook: 'yes',
      stateWebhook: 'yes',
    })
    expect(chat.api.notice).toEqual({ kind: 'settingsApplying' })
    await flush(20_000)
    expect(fake.client.getSettings).toHaveBeenCalledTimes(2)
    expect(chat.api.notice).toEqual({ kind: 'settingsApplying' })
    await flush(20_000)
    expect(fake.client.getSettings).toHaveBeenCalledTimes(3)
    expect(chat.api.notice).toBeNull()
  })

  it('keeps the applying notice while the old webhookUrl still blocks polling', async () => {
    fake.client.getSettings.mockResolvedValueOnce({
      webhookUrl: 'https://example.com',
      incomingWebhook: 'no',
    })
    const chat = renderChat()
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'webhookUrlSet' })
    await act(() => chat.api.enableNotifications())
    expect(chat.api.notice).toEqual({ kind: 'settingsApplying' })
    fake.pushError(new GreenApiError('webhookUrlSet', WEBHOOK_URL_ERROR, 400))
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'settingsApplying' })
    await flush(20_000)
    expect(chat.api.notice).toBeNull()
  })

  it('shows settingsFailed when setSettings is rejected', async () => {
    fake.client.getSettings.mockResolvedValue({ webhookUrl: '', incomingWebhook: 'no' })
    fake.client.setSettings.mockRejectedValue(
      new GreenApiError('validation', 'Неверный запрос: Validation failed', 400),
    )
    const chat = renderChat()
    await flush()
    await act(() => chat.api.enableNotifications())
    expect(chat.api.notice).toEqual({
      kind: 'settingsFailed',
      message: 'Неверный запрос: Validation failed',
    })
  })
})

describe('ChatProvider: sending', () => {
  it('shows the message at once and marks it sent with the HTTP answer', async () => {
    const answer = deferred<{ idMessage: string }>()
    fake.client.sendMessage.mockReturnValue(answer.promise)
    const chat = await renderOpenChat()
    let sending: Promise<void> = Promise.resolve()
    act(() => {
      sending = chat.api.sendMessage(CHAT_ID, '  Привет  ')
    })
    expect(fake.client.sendMessage).toHaveBeenCalledWith(CHAT_ID, 'Привет')
    expect(chat.api.messages).toEqual([
      expect.objectContaining({ direction: 'out', text: 'Привет', status: 'sending' }),
    ])
    answer.resolve({ idMessage: 'r1' })
    await act(() => sending)
    expect(chat.api.messages).toEqual([expect.objectContaining({ remoteId: 'r1', status: 'sent' })])
    expect(chat.api.chats[0]?.updatedAt).toBeGreaterThan(1_000)
  })

  it('adopts the echo that arrives before the HTTP answer', async () => {
    const answer = deferred<{ idMessage: string }>()
    fake.client.sendMessage.mockReturnValue(answer.promise)
    const chat = await renderOpenChat()
    let sending: Promise<void> = Promise.resolve()
    act(() => {
      sending = chat.api.sendMessage(CHAT_ID, 'Привет')
    })
    fake.pushEvent(messageEvent('api', 'r1', 'Привет'))
    await flush()
    expect(chat.api.messages).toEqual([expect.objectContaining({ remoteId: 'r1', status: 'sent' })])
    answer.resolve({ idMessage: 'r1' })
    await act(() => sending)
    fake.pushEvent(statusEvent('r1', 'delivered'))
    await flush()
    expect(chat.api.messages).toEqual([
      expect.objectContaining({ remoteId: 'r1', status: 'delivered' }),
    ])
  })

  it('ignores the echo of a message that the HTTP answer already confirmed', async () => {
    fake.client.sendMessage.mockResolvedValue({ idMessage: 'r1' })
    const chat = await renderOpenChat()
    await act(() => chat.api.sendMessage(CHAT_ID, 'Привет'))
    fake.pushEvent(messageEvent('api', 'r1', 'Привет'))
    fake.pushEvent(statusEvent('r1', 'read'))
    await flush()
    expect(chat.api.messages).toEqual([expect.objectContaining({ remoteId: 'r1', status: 'read' })])
    expect(fake.client.deleteNotification).toHaveBeenCalledTimes(2)
  })

  it('marks a failed message and sends the stored text again on retry', async () => {
    fake.client.sendMessage
      .mockRejectedValueOnce(
        new GreenApiError('server', 'Сервис GREEN-API временно недоступен.', 502),
      )
      .mockResolvedValueOnce({ idMessage: 'r2' })
    const chat = await renderOpenChat()
    await act(() => chat.api.sendMessage(CHAT_ID, 'Привет'))
    const failed = chat.api.messages[0]
    expect(failed).toMatchObject({
      status: 'failed',
      error: 'Сервис GREEN-API временно недоступен.',
    })
    await act(() => chat.api.retryMessage(CHAT_ID, failed?.id ?? ''))
    expect(fake.client.sendMessage).toHaveBeenNthCalledWith(2, CHAT_ID, 'Привет')
    expect(chat.api.messages).toEqual([
      expect.objectContaining({ id: failed?.id, remoteId: 'r2', status: 'sent' }),
    ])
    await act(() => chat.api.retryMessage(CHAT_ID, failed?.id ?? ''))
    expect(fake.client.sendMessage).toHaveBeenCalledTimes(2)
  })

  it('retries a rate limited message twice with a one second pause', async () => {
    const limit = new GreenApiError('rateLimit', 'Слишком много запросов. Подождите секунду.', 429)
    fake.client.sendMessage
      .mockRejectedValueOnce(limit)
      .mockRejectedValueOnce(limit)
      .mockResolvedValueOnce({ idMessage: 'r1' })
    const chat = await renderOpenChat()
    act(() => {
      void chat.api.sendMessage(CHAT_ID, 'Привет')
    })
    await flush(999)
    expect(fake.client.sendMessage).toHaveBeenCalledOnce()
    await flush(1)
    expect(fake.client.sendMessage).toHaveBeenCalledTimes(2)
    await flush(1_000)
    expect(fake.client.sendMessage).toHaveBeenCalledTimes(3)
    expect(chat.api.messages[0]).toMatchObject({ remoteId: 'r1', status: 'sent' })
  })

  it('shows the quota notice when the plan allows no more chats', async () => {
    const quota = 'Тариф Developer позволяет общаться только с 3 чатами.'
    fake.client.sendMessage.mockRejectedValue(new GreenApiError('chatQuota', quota, 466))
    const chat = await renderOpenChat()
    await act(() => chat.api.sendMessage(CHAT_ID, 'Привет'))
    expect(chat.api.notice).toEqual({ kind: 'quota', description: quota })
    expect(chat.api.lastMessages[CHAT_ID]).toMatchObject({ status: 'failed', error: quota })
  })

  it('logs out when sending reveals a rejected token', async () => {
    fake.client.sendMessage.mockRejectedValue(new GreenApiError('auth', AUTH_ERROR, 401))
    const chat = await renderOpenChat()
    await act(() => chat.api.sendMessage(CHAT_ID, 'Привет'))
    expect(logout).toHaveBeenCalledWith(AUTH_ERROR)
  })

  it('does not end a newer session when a send of the old one fails later', async () => {
    const answer = deferred<{ idMessage: string }>()
    fake.client.sendMessage.mockReturnValue(answer.promise)
    const chat = await renderOpenChat()
    let sending: Promise<void> = Promise.resolve()
    act(() => {
      sending = chat.api.sendMessage(CHAT_ID, 'Привет')
    })
    cleanup()
    answer.reject(new GreenApiError('auth', AUTH_ERROR, 401))
    await sending
    expect(logout).not.toHaveBeenCalled()
  })

  it('gives every sent message its own remote id', async () => {
    const chat = await renderOpenChat()
    await act(() => chat.api.sendMessage(CHAT_ID, 'Раз'))
    await act(() => chat.api.sendMessage(CHAT_ID, 'Два'))
    expect(chat.api.messages.map(({ text, remoteId }) => [text, remoteId])).toEqual([
      ['Раз', 'remote-1'],
      ['Два', 'remote-2'],
    ])
  })

  it('ignores blank text and fails a text over 4000 characters without a request', async () => {
    const chat = await renderOpenChat()
    await act(() => chat.api.sendMessage(CHAT_ID, '  \n '))
    expect(chat.api.messages).toEqual([])
    await act(() => chat.api.sendMessage(CHAT_ID, 'я'.repeat(4_001)))
    expect(fake.client.sendMessage).not.toHaveBeenCalled()
    expect(chat.api.messages).toEqual([
      expect.objectContaining({ status: 'failed', error: 'Максимум 4000 символов' }),
    ])
  })

  it('saves chats and messages after a change', async () => {
    fake.client.sendMessage.mockResolvedValue({ idMessage: 'r1' })
    const chat = await renderOpenChat()
    await act(() => chat.api.sendMessage(CHAT_ID, 'Сохрани меня'))
    await flush(400)
    expect(loadData(testCredentials.idInstance).messages[CHAT_ID]).toEqual([
      expect.objectContaining({ text: 'Сохрани меня', status: 'sent', remoteId: 'r1' }),
    ])
  })
})

describe('ChatProvider: startChat', () => {
  async function start(chat: { api: ChatApi }, phone: string): Promise<StartChatResult> {
    let result: StartChatResult | null = null
    await act(async () => {
      result = await chat.api.startChat(phone)
    })
    if (!result) throw new Error('startChat did not finish')
    return result
  }

  it('rejects an invalid number without a request', async () => {
    const chat = renderChat()
    await flush()
    expect(await start(chat, '12345')).toEqual({
      ok: false,
      error: 'Введите номер России (+7) или Беларуси (+375).',
    })
    expect(fake.client.checkAccount).not.toHaveBeenCalled()
  })

  it('opens an existing chat with the same phone without a request', async () => {
    seedChat()
    const chat = renderChat()
    await flush()
    expect(await start(chat, '8 (900) 123-45-67')).toEqual({ ok: true, chatId: CHAT_ID })
    expect(chat.api.activeChat?.id).toBe(CHAT_ID)
    expect(fake.client.checkAccount).not.toHaveBeenCalled()
  })

  it('creates and opens a chat for a number that has MAX', async () => {
    fake.client.checkAccount.mockResolvedValue({ exists: true, chatId: CHAT_ID })
    const chat = renderChat()
    await flush()
    expect(await start(chat, '+7 900 123 45 67')).toEqual({ ok: true, chatId: CHAT_ID })
    expect(fake.client.checkAccount).toHaveBeenCalledWith(79001234567)
    expect(chat.api.activeChat).toMatchObject({
      id: CHAT_ID,
      title: '+7 900 123-45-67',
      type: 'user',
      phone: PHONE,
      unread: 0,
    })
    expect(chat.api.chats).toHaveLength(1)
  })

  it('reports a number without MAX and never checks it twice', async () => {
    fake.client.checkAccount.mockResolvedValue({ exists: false, chatId: '' })
    const chat = renderChat()
    await flush()
    const notFound = { ok: false, error: 'Этот номер не найден в MAX.' }
    expect(await start(chat, '79001234567')).toEqual(notFound)
    expect(await start(chat, '89001234567')).toEqual(notFound)
    expect(fake.client.checkAccount).toHaveBeenCalledOnce()
    expect(chat.api.chats).toEqual([])
  })

  it('remembers numbers without MAX after a reload', async () => {
    fake.client.checkAccount.mockResolvedValue({ exists: false, chatId: '' })
    const notFound = { ok: false, error: 'Этот номер не найден в MAX.' }
    const first = renderChat()
    await flush()
    expect(await start(first, '79001234567')).toEqual(notFound)
    cleanup()
    const second = renderChat()
    await flush()
    expect(await start(second, '8 900 123-45-67')).toEqual(notFound)
    expect(fake.client.checkAccount).toHaveBeenCalledOnce()
  })

  it('retries once after a rate limit and returns the API error text', async () => {
    const limit = 'Исчерпан месячный лимит проверки номеров на тарифе Developer.'
    fake.client.checkAccount
      .mockRejectedValueOnce(new GreenApiError('rateLimit', 'Слишком много запросов.', 429))
      .mockRejectedValueOnce(new GreenApiError('checkLimit', limit, 466))
    const chat = renderChat()
    await flush()
    let result: Promise<StartChatResult> = Promise.resolve({ ok: true, chatId: '' })
    act(() => {
      result = chat.api.startChat('79001234567')
    })
    await flush(1_000)
    await expect(result).resolves.toEqual({ ok: false, error: limit })
    expect(fake.client.checkAccount).toHaveBeenCalledTimes(2)
  })
})

describe('ChatProvider: receiving', () => {
  it('counts unread messages of a closed chat and clears them when it is opened', async () => {
    seedChat()
    const chat = renderChat()
    await flush()
    fake.pushEvent(messageEvent('incoming', 'in1', 'Как дела?'))
    await flush()
    expect(chat.api.totalUnread).toBe(1)
    expect(chat.api.chats[0]).toMatchObject({ id: CHAT_ID, title: 'Анна', unread: 1 })
    expect(chat.api.lastMessages[CHAT_ID]).toMatchObject({ direction: 'in', text: 'Как дела?' })
    expect(fake.client.deleteNotification).toHaveBeenCalledOnce()
    act(() => chat.api.openChat(CHAT_ID))
    expect(chat.api.totalUnread).toBe(0)
  })

  it('marks the open chat as read when the hidden tab becomes visible again', async () => {
    const chat = await renderOpenChat()
    setHidden(true)
    fake.pushEvent(messageEvent('incoming', 'in1', 'Ты тут?'))
    await flush()
    expect(chat.api.totalUnread).toBe(1)
    setHidden(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(chat.api.totalUnread).toBe(0)
  })

  it('shows the offline notice while polling fails and clears it after a success', async () => {
    const chat = renderChat()
    await flush()
    fake.pushError(new GreenApiError('network', 'Нет связи с GREEN-API.'))
    await flush()
    expect(chat.api.notice).toEqual({ kind: 'offline' })
    fake.pushNotification(null)
    await flush(1_000)
    expect(chat.api.notice).toBeNull()
  })

  it('logs out when polling reports rejected credentials', async () => {
    renderChat()
    await flush()
    fake.pushError(new GreenApiError('auth', AUTH_ERROR, 401))
    await flush()
    expect(logout).toHaveBeenCalledWith(
      'Сессия завершена: проверьте idInstance и apiTokenInstance.',
    )
  })

  it('keeps exactly one polling loop alive under StrictMode', async () => {
    seedChat()
    const chat = renderChat({ strict: true })
    await flush()
    expect(fake.pendingReceives).toBe(1)
    fake.pushEvent(messageEvent('incoming', 'in1', 'Привет'))
    await flush()
    expect(fake.client.deleteNotification).toHaveBeenCalledOnce()
    expect(chat.api.lastMessages[CHAT_ID]).toMatchObject({ remoteId: 'in1' })
    expect(fake.pendingReceives).toBe(1)
  })
})
