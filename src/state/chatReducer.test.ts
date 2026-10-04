import { describe, expect, it } from 'vitest'
import type { AppEvent, Chat, ChatMessage } from '@/types'
import {
  chatReducer,
  initialChatState,
  selectActiveChat,
  selectActiveMessages,
  selectChats,
  selectLastMessages,
  selectNeedsStatusCheck,
  selectNotice,
  selectTotalUnread,
  type ChatAction,
  type ChatState,
} from './chatReducer'

const CHAT_ID = '10000000'

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: CHAT_ID,
    title: '+7 900 123-45-67',
    type: 'user',
    phone: '79001234567',
    unread: 0,
    updatedAt: 1_000,
    ...overrides,
  }
}

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'local-1',
    chatId: CHAT_ID,
    direction: 'out',
    text: 'Привет',
    kind: 'text',
    timestamp: 2_000,
    status: 'sending',
    ...overrides,
  }
}

function withChat(chat = makeChat(), messages: ChatMessage[] = []): ChatState {
  return { ...initialChatState, chats: { [chat.id]: chat }, messages: { [chat.id]: messages } }
}

function reduce(state: ChatState, ...actions: ChatAction[]): ChatState {
  return actions.reduce(chatReducer, state)
}

interface MessageOptions {
  remoteId?: string
  text?: string
  timestamp?: number
  title?: string
  phone?: string
  senderName?: string
}

function messageEvent(
  origin: 'incoming' | 'phone' | 'api',
  options: MessageOptions = {},
): AppEvent {
  return {
    type: 'message',
    origin,
    chat: { id: CHAT_ID, title: options.title ?? 'Анна', type: 'user', phone: options.phone },
    message: {
      remoteId: options.remoteId ?? 'remote-1',
      timestamp: options.timestamp ?? 5_000,
      text: options.text ?? 'Привет',
      kind: 'text',
      senderName: options.senderName,
    },
  }
}

function statusEvent(
  remoteId: string,
  status: 'delivered' | 'read' | 'failed',
  chatId = CHAT_ID,
  description?: string,
): AppEvent {
  return { type: 'status', chatId, remoteId, status, description }
}

function apply(event: AppEvent, visible = true): ChatAction {
  return { type: 'applyEvent', event, visible }
}

function messagesOf(state: ChatState): ChatMessage[] {
  return state.messages[CHAT_ID] ?? []
}

describe('chatReducer: local actions', () => {
  it('hydrate restores the data and marks messages that were still sending as failed', () => {
    const sending = makeMessage({ id: 'a' })
    const read = makeMessage({ id: 'b', status: 'read', remoteId: 'r' })
    const state = reduce(initialChatState, {
      type: 'hydrate',
      data: { chats: { [CHAT_ID]: makeChat() }, messages: { [CHAT_ID]: [sending, read] } },
    })
    expect(state.chats).toEqual({ [CHAT_ID]: makeChat() })
    expect(messagesOf(state)).toEqual([
      { ...sending, status: 'failed', error: 'Не отправлено' },
      read,
    ])
  })

  it('openChat activates a known chat and clears its unread counter', () => {
    const state = reduce(withChat(makeChat({ unread: 3 })), { type: 'openChat', chatId: CHAT_ID })
    expect(state.activeChatId).toBe(CHAT_ID)
    expect(state.chats[CHAT_ID]?.unread).toBe(0)
    expect(reduce(state, { type: 'openChat', chatId: CHAT_ID })).toBe(state)
    expect(reduce(state, { type: 'openChat', chatId: 'unknown' })).toBe(state)
    expect(reduce(state, { type: 'openChat', chatId: null }).activeChatId).toBeNull()
  })

  it('createChat adds a missing chat', () => {
    const state = reduce(initialChatState, { type: 'createChat', chat: makeChat() })
    expect(state.chats).toEqual({ [CHAT_ID]: makeChat() })
  })

  it('createChat only fills a missing phone of an existing chat', () => {
    const existing = makeChat({ title: 'Анна', phone: undefined, unread: 2 })
    const update = makeChat({ updatedAt: 9_000 })
    const state = reduce(withChat(existing), { type: 'createChat', chat: update })
    expect(state.chats[CHAT_ID]).toEqual({ ...existing, phone: '79001234567' })
    expect(reduce(state, { type: 'createChat', chat: makeChat({ phone: '70000000000' }) })).toBe(
      state,
    )
  })

  it('queueMessage appends an optimistic message and bumps the chat', () => {
    const older = makeMessage({ id: 'old', remoteId: 'r0', status: 'read', timestamp: 3_000 })
    const state = reduce(withChat(makeChat(), [older]), {
      type: 'queueMessage',
      chatId: CHAT_ID,
      id: 'local-1',
      text: 'Привет',
      timestamp: 2_000,
    })
    expect(messagesOf(state)).toEqual([older, makeMessage()])
    expect(state.chats[CHAT_ID]?.updatedAt).toBe(2_000)
    const unknown = { type: 'queueMessage', chatId: 'x', id: 'y', text: 'z', timestamp: 1 } as const
    expect(reduce(state, unknown)).toBe(state)
  })

  it('messageSent stores the remote id and marks the message sent', () => {
    const state = reduce(withChat(makeChat(), [makeMessage()]), {
      type: 'messageSent',
      chatId: CHAT_ID,
      id: 'local-1',
      remoteId: 'r1',
    })
    expect(messagesOf(state)).toEqual([makeMessage({ remoteId: 'r1', status: 'sent' })])
  })

  it('messageSent never downgrades a delivered or read message', () => {
    const state = withChat(makeChat(), [makeMessage({ remoteId: 'r1', status: 'read' })])
    const next = reduce(state, {
      type: 'messageSent',
      chatId: CHAT_ID,
      id: 'local-1',
      remoteId: 'r1',
    })
    expect(messagesOf(next)[0]?.status).toBe('read')
  })

  it('messageSent drops the optimistic message when the echo already added this remote id', () => {
    const echo = makeMessage({ id: 'remote:r1', remoteId: 'r1', status: 'delivered' })
    const state = reduce(withChat(makeChat(), [makeMessage(), echo]), {
      type: 'messageSent',
      chatId: CHAT_ID,
      id: 'local-1',
      remoteId: 'r1',
    })
    expect(messagesOf(state)).toEqual([echo])
  })

  it('messageFailed marks a sending message failed but keeps one the echo confirmed', () => {
    const failed = reduce(withChat(makeChat(), [makeMessage()]), {
      type: 'messageFailed',
      chatId: CHAT_ID,
      id: 'local-1',
      error: 'Нет связи с GREEN-API.',
    })
    expect(messagesOf(failed)[0]).toMatchObject({
      status: 'failed',
      error: 'Нет связи с GREEN-API.',
    })
    const confirmed = withChat(makeChat(), [makeMessage({ remoteId: 'r1', status: 'sent' })])
    const action: ChatAction = { type: 'messageFailed', chatId: CHAT_ID, id: 'local-1', error: 'x' }
    expect(reduce(confirmed, action)).toBe(confirmed)
  })

  it('retryMessage moves a failed message to the end as sending without error and remote id', () => {
    const failed = makeMessage({ status: 'failed', error: 'Ошибка', remoteId: 'old' })
    const later = makeMessage({ id: 'local-2', text: 'Ещё', timestamp: 3_000, status: 'sent' })
    const state = reduce(withChat(makeChat(), [failed, later]), {
      type: 'retryMessage',
      chatId: CHAT_ID,
      id: 'local-1',
      timestamp: 9_000,
    })
    expect(messagesOf(state)).toEqual([later, makeMessage({ timestamp: 9_000 })])
    expect(messagesOf(state)[1]?.error).toBeUndefined()
    expect(state.chats[CHAT_ID]?.updatedAt).toBe(9_000)
    const retryAgain: ChatAction = {
      type: 'retryMessage',
      chatId: CHAT_ID,
      id: 'local-1',
      timestamp: 1,
    }
    expect(reduce(state, retryAgain)).toBe(state)
  })

  it('updates the connection and settings flags', () => {
    const state = reduce(
      initialChatState,
      { type: 'setInstanceState', state: 'starting' },
      { type: 'setSettingsStatus', enabled: false, webhookUrlSet: true },
      { type: 'setOffline', offline: true },
      { type: 'settingsError', error: 'Ошибка' },
      { type: 'setQuota', quota: 'Лимит' },
    )
    expect(state).toMatchObject({
      instanceState: 'starting',
      notificationsEnabled: false,
      webhookUrlSet: true,
      offline: true,
      settingsError: 'Ошибка',
      quota: 'Лимит',
    })
    const applying = reduce(
      state,
      { type: 'settingsApplying', applying: true },
      { type: 'setWebhookUrlSet', webhookUrlSet: false },
    )
    expect(applying).toMatchObject({
      settingsApplying: true,
      settingsError: null,
      webhookUrlSet: false,
    })
    expect(reduce(applying, { type: 'setOffline', offline: true })).toBe(applying)
    expect(reduce(applying, { type: 'settingsApplying', applying: false }).settingsApplying).toBe(
      false,
    )
  })

  it('does not report the old webhookUrl while the new settings apply', () => {
    const applying = reduce(initialChatState, { type: 'settingsApplying', applying: true })
    expect(reduce(applying, { type: 'setWebhookUrlSet', webhookUrlSet: true })).toBe(applying)
    const read = reduce(applying, {
      type: 'setSettingsStatus',
      enabled: false,
      webhookUrlSet: true,
    })
    expect(read).toMatchObject({ notificationsEnabled: false, webhookUrlSet: false })
    const applied = reduce(
      read,
      { type: 'settingsApplying', applying: false },
      { type: 'setWebhookUrlSet', webhookUrlSet: true },
    )
    expect(applied.webhookUrlSet).toBe(true)
  })
})

describe('chatReducer: incoming messages', () => {
  it('creates the chat of a new interlocutor and counts the message as unread', () => {
    const state = reduce(
      initialChatState,
      apply(messageEvent('incoming', { phone: '79001234567' })),
    )
    expect(state.chats[CHAT_ID]).toEqual({
      id: CHAT_ID,
      title: 'Анна',
      type: 'user',
      phone: '79001234567',
      unread: 1,
      updatedAt: 5_000,
    })
    expect(messagesOf(state)).toEqual([
      {
        id: 'remote:remote-1',
        remoteId: 'remote-1',
        chatId: CHAT_ID,
        direction: 'in',
        text: 'Привет',
        kind: 'text',
        timestamp: 5_000,
        status: 'read',
      },
    ])
  })

  it('does not count a message of the open chat while the page is visible', () => {
    const open = reduce(withChat(), { type: 'openChat', chatId: CHAT_ID })
    expect(reduce(open, apply(messageEvent('incoming'), true)).chats[CHAT_ID]?.unread).toBe(0)
    expect(reduce(open, apply(messageEvent('incoming'), false)).chats[CHAT_ID]?.unread).toBe(1)
    expect(reduce(withChat(), apply(messageEvent('incoming'), true)).chats[CHAT_ID]?.unread).toBe(1)
  })

  it('replaces only a placeholder title and only with a real name', () => {
    const titleAfter = (stored: string, received: string) =>
      reduce(
        withChat(makeChat({ title: stored })),
        apply(messageEvent('incoming', { title: received })),
      ).chats[CHAT_ID]?.title
    expect(titleAfter('+7 900 123-45-67', 'Анна')).toBe('Анна')
    expect(titleAfter(CHAT_ID, 'Anna')).toBe('Anna')
    expect(titleAfter('Аня с работы', 'Анна')).toBe('Аня с работы')
    expect(titleAfter('+7 900 123-45-67', '+7 900 765-43-21')).toBe('+7 900 123-45-67')
  })

  it('fills a missing phone and keeps a known one', () => {
    const noPhone = withChat(makeChat({ phone: undefined }))
    const filled = reduce(noPhone, apply(messageEvent('incoming', { phone: '79005554433' })))
    expect(filled.chats[CHAT_ID]?.phone).toBe('79005554433')
    const known = reduce(withChat(), apply(messageEvent('incoming', { phone: '79005554433' })))
    expect(known.chats[CHAT_ID]?.phone).toBe('79001234567')
  })

  it('keeps the sender name of group messages', () => {
    const state = reduce(initialChatState, apply(messageEvent('incoming', { senderName: 'Иван' })))
    expect(messagesOf(state)[0]?.senderName).toBe('Иван')
  })

  it('skips a message whose remote id is already in the chat', () => {
    const once = reduce(initialChatState, apply(messageEvent('incoming')))
    expect(reduce(once, apply(messageEvent('incoming')))).toBe(once)
  })

  it('keeps the list sorted by time (stable) and the chat time at its maximum', () => {
    const state = reduce(
      withChat(makeChat({ updatedAt: 10_000 })),
      apply(messageEvent('incoming', { remoteId: 'late', timestamp: 8_000 })),
      apply(messageEvent('incoming', { remoteId: 'early', timestamp: 6_000 })),
      apply(messageEvent('incoming', { remoteId: 'same', timestamp: 8_000 })),
    )
    expect(messagesOf(state).map((message) => message.remoteId)).toEqual(['early', 'late', 'same'])
    expect(state.chats[CHAT_ID]?.updatedAt).toBe(10_000)
    const newer = reduce(
      state,
      apply(messageEvent('incoming', { remoteId: 'new', timestamp: 12_000 })),
    )
    expect(newer.chats[CHAT_ID]?.updatedAt).toBe(12_000)
  })
})

describe('chatReducer: echoes of outgoing messages', () => {
  it('adopts the oldest optimistic message with the same text when the echo comes first', () => {
    const state = reduce(
      withChat(makeChat(), [
        makeMessage({ id: 'a', text: 'Другое' }),
        makeMessage({ id: 'b', timestamp: 2_100 }),
        makeMessage({ id: 'c', timestamp: 2_200 }),
      ]),
      apply(messageEvent('api', { remoteId: 'r1', timestamp: 2_150 })),
    )
    expect(messagesOf(state).map(({ id, remoteId, status }) => [id, remoteId, status])).toEqual([
      ['a', undefined, 'sending'],
      ['b', 'r1', 'sent'],
      ['c', undefined, 'sending'],
    ])
    const answered = reduce(state, {
      type: 'messageSent',
      chatId: CHAT_ID,
      id: 'b',
      remoteId: 'r1',
    })
    expect(messagesOf(answered)).toHaveLength(3)
    expect(messagesOf(answered)[1]).toMatchObject({ id: 'b', remoteId: 'r1', status: 'sent' })
  })

  it('takes only the server time from the echo when the HTTP answer came first', () => {
    const sent = reduce(withChat(makeChat(), [makeMessage()]), {
      type: 'messageSent',
      chatId: CHAT_ID,
      id: 'local-1',
      remoteId: 'r1',
    })
    const echo = messageEvent('api', {
      remoteId: 'r1',
      timestamp: 5_000,
      title: '+7 900 123-45-67',
    })
    const echoed = reduce(sent, apply(echo))
    expect(messagesOf(echoed)).toEqual([
      makeMessage({ remoteId: 'r1', status: 'sent', timestamp: 5_000 }),
    ])
    expect(echoed.chats).toBe(sent.chats)
    expect(reduce(echoed, apply(echo))).toBe(echoed)
  })

  it('renames a placeholder chat title from the echo even when the HTTP answer came first', () => {
    const sent = reduce(withChat(makeChat(), [makeMessage()]), {
      type: 'messageSent',
      chatId: CHAT_ID,
      id: 'local-1',
      remoteId: 'r1',
    })
    const echoed = reduce(
      sent,
      apply(messageEvent('api', { remoteId: 'r1', timestamp: 5_000, title: 'Анна Смирнова' })),
    )
    expect(echoed.chats[CHAT_ID]?.title).toBe('Анна Смирнова')
    expect(echoed.chats[CHAT_ID]?.phone).toBe('79001234567')
    const again = reduce(
      echoed,
      apply(messageEvent('api', { remoteId: 'r1', timestamp: 5_000, title: 'Другое имя' })),
    )
    expect(again).toBe(echoed)
  })

  it('adopts a failed copy too: the echo proves it was sent', () => {
    const failed = withChat(makeChat(), [makeMessage({ status: 'failed', error: 'Не отправлено' })])
    const state = reduce(failed, apply(messageEvent('api', { remoteId: 'r1' })))
    expect(messagesOf(state)).toEqual([
      makeMessage({ remoteId: 'r1', status: 'sent', timestamp: 5_000 }),
    ])
    expect(messagesOf(state)[0]?.error).toBeUndefined()
  })

  it('prefers a copy that is still sending over an older failed one', () => {
    const failed = makeMessage({ id: 'old', status: 'failed', timestamp: 650_000 })
    const sending = makeMessage({ id: 'new', timestamp: 690_000 })
    const state = reduce(
      withChat(makeChat(), [failed, sending]),
      apply(messageEvent('api', { remoteId: 'r1', timestamp: 700_000 })),
    )
    expect(messagesOf(state).map(({ id, remoteId, status }) => [id, remoteId, status])).toEqual([
      ['old', undefined, 'failed'],
      ['new', 'r1', 'sent'],
    ])
  })

  it('adopts a failed copy only when it is younger than 10 minutes', () => {
    const failed = withChat(makeChat(), [makeMessage({ status: 'failed', timestamp: 2_000 })])
    const young = reduce(
      failed,
      apply(messageEvent('api', { remoteId: 'r1', timestamp: 2_000 + 599_999 })),
    )
    expect(messagesOf(young)).toEqual([expect.objectContaining({ id: 'local-1', remoteId: 'r1' })])
    const old = reduce(failed, apply(messageEvent('api', { remoteId: 'r1', timestamp: 602_000 })))
    expect(messagesOf(old).map(({ id, status }) => [id, status])).toEqual([
      ['local-1', 'failed'],
      ['remote:r1', 'sent'],
    ])
  })

  it('moves an adopted message to its server time, so a reply sorts after its question', () => {
    const question = makeMessage({ id: 'q', text: 'Как дела?', timestamp: 125_000 })
    const answered = reduce(
      withChat(makeChat(), [question]),
      apply(messageEvent('incoming', { remoteId: 'reply', text: 'Хорошо', timestamp: 6_000 })),
    )
    expect(messagesOf(answered).map((message) => message.id)).toEqual(['remote:reply', 'q'])
    const echoed = reduce(
      answered,
      apply(messageEvent('api', { remoteId: 'r1', text: 'Как дела?', timestamp: 5_000 })),
    )
    expect(messagesOf(echoed).map(({ id, timestamp }) => [id, timestamp])).toEqual([
      ['q', 5_000],
      ['remote:reply', 6_000],
    ])
  })

  it('adds a message typed in the MAX app as sent without unread', () => {
    const state = reduce(
      withChat(),
      apply(messageEvent('phone', { remoteId: 'p1', text: 'С телефона' })),
    )
    expect(messagesOf(state)).toEqual([
      {
        id: 'remote:p1',
        remoteId: 'p1',
        chatId: CHAT_ID,
        direction: 'out',
        text: 'С телефона',
        kind: 'text',
        timestamp: 5_000,
        status: 'sent',
      },
    ])
    expect(state.chats[CHAT_ID]?.unread).toBe(0)
  })
})

describe('chatReducer: statuses and service events', () => {
  it('advances statuses monotonically', () => {
    const sent = withChat(makeChat(), [makeMessage({ remoteId: 'r1', status: 'sent' })])
    const read = reduce(sent, apply(statusEvent('r1', 'read')))
    expect(messagesOf(read)[0]?.status).toBe('read')
    expect(reduce(read, apply(statusEvent('r1', 'delivered')))).toBe(read)
    expect(messagesOf(reduce(sent, apply(statusEvent('r1', 'delivered'))))[0]?.status).toBe(
      'delivered',
    )
  })

  it('applies failed with its description unless the message was delivered or read', () => {
    const sent = withChat(makeChat(), [makeMessage({ remoteId: 'r1', status: 'sent' })])
    const failed = reduce(
      sent,
      apply(statusEvent('r1', 'failed', CHAT_ID, 'У получателя нет аккаунта MAX.')),
    )
    expect(messagesOf(failed)[0]).toMatchObject({
      status: 'failed',
      error: 'У получателя нет аккаунта MAX.',
    })
    const delivered = withChat(makeChat(), [makeMessage({ remoteId: 'r1', status: 'delivered' })])
    expect(reduce(delivered, apply(statusEvent('r1', 'failed')))).toBe(delivered)
  })

  it('finds the message in another chat and ignores unknown ids', () => {
    const state = withChat(makeChat(), [makeMessage({ remoteId: 'r1', status: 'sent' })])
    const other = reduce(state, apply(statusEvent('r1', 'delivered', '99999')))
    expect(messagesOf(other)[0]?.status).toBe('delivered')
    expect(reduce(state, apply(statusEvent('unknown', 'read')))).toBe(state)
  })

  it('stores the instance state and the quota', () => {
    const blocked = reduce(initialChatState, apply({ type: 'instanceState', state: 'blocked' }))
    expect(blocked.instanceState).toBe('blocked')
    const quota = reduce(initialChatState, apply({ type: 'quotaExceeded', description: 'Лимит' }))
    expect(quota.quota).toBe('Лимит')
    const empty = reduce(initialChatState, apply({ type: 'quotaExceeded', description: '' }))
    expect(empty.quota).toBe('quota')
  })
})

describe('selectors', () => {
  const older = makeChat({ id: 'old', updatedAt: 1_000, unread: 2 })
  const newer = makeChat({ id: 'new', updatedAt: 5_000, unread: 3 })
  const first = makeMessage({ id: 'x', chatId: 'old' })
  const last = makeMessage({ id: 'y', chatId: 'old', timestamp: 3_000 })
  const state: ChatState = {
    ...initialChatState,
    chats: { old: older, new: newer },
    messages: { old: [first, last], new: [] },
    activeChatId: 'old',
  }

  it('lists chats newest first with the last message of each and the unread total', () => {
    expect(selectChats(state).map((chat) => chat.id)).toEqual(['new', 'old'])
    expect(selectLastMessages(state)).toEqual({ old: last })
    expect(selectTotalUnread(state)).toBe(5)
    expect(selectActiveChat(state)).toBe(older)
    expect(selectActiveMessages(state)).toEqual([first, last])
    expect(selectActiveChat(initialChatState)).toBeNull()
    expect(selectActiveMessages(initialChatState)).toEqual([])
  })

  it('selectNotice keeps only the most important notice', () => {
    let current: ChatState = {
      ...initialChatState,
      offline: true,
      webhookUrlSet: true,
      instanceState: 'notAuthorized',
      settingsApplying: true,
      settingsError: 'Ошибка',
      notificationsEnabled: false,
      quota: 'Лимит',
    }
    expect(selectNotice(current)).toEqual({ kind: 'offline' })
    current = { ...current, offline: false }
    expect(selectNotice(current)).toEqual({ kind: 'webhookUrlSet' })
    current = { ...current, webhookUrlSet: false }
    expect(selectNotice(current)).toEqual({ kind: 'settingsApplying' })
    current = { ...current, settingsApplying: false }
    expect(selectNotice(current)).toEqual({ kind: 'notAuthorized', state: 'notAuthorized' })
    current = { ...current, instanceState: 'authorized' }
    expect(selectNotice(current)).toEqual({ kind: 'settingsFailed', message: 'Ошибка' })
    current = { ...current, settingsError: null }
    expect(selectNotice(current)).toEqual({ kind: 'notificationsOff' })
    current = { ...current, notificationsEnabled: true }
    expect(selectNotice(current)).toEqual({ kind: 'quota', description: 'Лимит' })
    current = { ...current, quota: null }
    expect(selectNotice(current)).toBeNull()
    expect(selectNotice({ ...current, notificationsEnabled: null, instanceState: null })).toBeNull()
  })

  it('selectNeedsStatusCheck asks for a check until the instance is authorized and the settings known', () => {
    const fine: ChatState = {
      ...initialChatState,
      instanceState: 'authorized',
      notificationsEnabled: false,
    }
    expect(selectNeedsStatusCheck(fine)).toBe(false)
    expect(selectNeedsStatusCheck({ ...fine, instanceState: null })).toBe(true)
    expect(selectNeedsStatusCheck({ ...fine, instanceState: 'starting' })).toBe(true)
    expect(selectNeedsStatusCheck({ ...fine, notificationsEnabled: null })).toBe(true)
  })
})
