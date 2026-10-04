import type { ChatInfo, ParsedMessage } from '@/types'
import { describe, expect, it } from 'vitest'
import { mapNotification } from './notifications'

const TEXT = 'Я использую GREEN-API для отправки этого сообщения!'

/** contract.txt 6.1, private chat, verbatim. */
const INCOMING_PRIVATE = {
  typeWebhook: 'incomingMessageReceived',
  instanceData: { idInstance: 3100000000, wid: '79991234567@c.us', typeInstance: 'v3' },
  timestamp: 1763115112,
  idMessage: '1763115112345',
  senderData: {
    chatId: '10000000',
    chatName: 'Ходабрыш Пробешёлов',
    chatType: 'user',
    sender: '10000000',
    senderName: 'Ходабрыш Пробешёлов',
    senderType: 'user',
    senderContactName: 'Ходабрыш Пробешёлов',
    senderPhoneNumber: 79876543210,
  },
  messageData: {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: TEXT },
  },
}

/** contract.txt 6.1, group chat, verbatim. */
const INCOMING_GROUP = {
  typeWebhook: 'incomingMessageReceived',
  instanceData: { idInstance: 3100000000, wid: '79991234567@c.us', typeInstance: 'v3' },
  timestamp: 1763115112,
  idMessage: '1763115112345',
  senderData: {
    chatId: '-69876543210123',
    chatName: 'Название группы',
    chatType: 'group',
    sender: '10000000',
    senderName: 'Ходабрыш',
    senderType: 'user',
    senderContactName: '',
    senderPhoneNumber: 0,
  },
  messageData: {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: TEXT, forwardingScore: 0, isForwarded: false },
  },
}

const EXTENDED_TEXT =
  'Я использую GREEN-API для отправки этого сообщения! Документация на сайте https://green-api.com/'

/** contract.txt 6.1b messageData. */
const EXTENDED_MESSAGE_DATA = {
  typeMessage: 'extendedTextMessage',
  extendedTextMessageData: {
    text: EXTENDED_TEXT,
    description:
      'Сервис GREEN-API - интеграция с MAX на любом языке программирования: PHP, JavaScript, 1С, Python, Java, C#, VBA.',
    title: 'Доступный MAX API для отправки сообщений | Сервис GREEN-API',
    forwardingScore: 0,
    isForwarded: false,
  },
}

/** contract.txt 6.4, verbatim. */
const OUTGOING_STATUS = {
  typeWebhook: 'outgoingMessageStatus',
  chatId: '10000000',
  instanceData: { idInstance: 3100000000, wid: '79991234567@c.us', typeInstance: 'v3' },
  timestamp: 1755591519,
  idMessage: '115054445839974415',
  status: 'delivered',
}

/** contract.txt 6.5, verbatim. */
const STATE_CHANGED = {
  typeWebhook: 'stateInstanceChanged',
  instanceData: { idInstance: 3100000000, wid: '79991234567@c.us', typeInstance: 'v3' },
  timestamp: 1755589527,
  stateInstance: 'authorized',
}

const QUOTA_DESCRIPTION =
  'Monthly quota has been exceeded. You can only send or receive messages from following chats: 10000000, 10000001, 10000002. Please go to your personal account and change the tariff to business https://console.green-api.com'

/** contract.txt 6.6, verbatim. */
const QUOTA_EXCEEDED = {
  typeWebhook: 'quotaExceeded',
  instanceData: { idInstance: 3100000000, wid: '79991234567@c.us', typeInstance: 'v3' },
  quotaData: {
    method: 'correspondents',
    used: 3,
    total: 3,
    status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
    description: QUOTA_DESCRIPTION,
  },
}

function withSender(senderData: object, typeWebhook = INCOMING_PRIVATE.typeWebhook) {
  return {
    ...INCOMING_PRIVATE,
    typeWebhook,
    senderData: { ...INCOMING_PRIVATE.senderData, ...senderData },
  }
}

function withMessageData(messageData: unknown) {
  return { ...INCOMING_PRIVATE, messageData }
}

function chatOf(body: unknown): ChatInfo | undefined {
  const event = mapNotification(body)
  return event?.type === 'message' ? event.chat : undefined
}

function messageOf(body: unknown): ParsedMessage | undefined {
  const event = mapNotification(body)
  return event?.type === 'message' ? event.message : undefined
}

describe('mapNotification: messages', () => {
  it('maps an incoming private text message (6.1)', () => {
    expect(mapNotification(INCOMING_PRIVATE)).toStrictEqual({
      type: 'message',
      origin: 'incoming',
      chat: { id: '10000000', type: 'user', title: 'Ходабрыш Пробешёлов', phone: '79876543210' },
      message: {
        remoteId: '1763115112345',
        timestamp: 1763115112000,
        text: TEXT,
        kind: 'text',
        senderName: 'Ходабрыш Пробешёлов',
      },
    })
  })

  it('routes an incoming group message to the group, not to the sender (6.1 group)', () => {
    expect(mapNotification(INCOMING_GROUP)).toStrictEqual({
      type: 'message',
      origin: 'incoming',
      chat: { id: '-69876543210123', type: 'group', title: 'Название группы' },
      message: {
        remoteId: '1763115112345',
        timestamp: 1763115112000,
        text: TEXT,
        kind: 'text',
        senderName: 'Ходабрыш',
      },
    })
  })

  it('reads the text of an extendedTextMessage (6.1b)', () => {
    expect(messageOf(withMessageData(EXTENDED_MESSAGE_DATA))).toMatchObject({
      text: EXTENDED_TEXT,
      kind: 'text',
    })
  })

  it.each([
    ['outgoingMessageReceived', 'phone'],
    ['outgoingAPIMessageReceived', 'api'],
  ])('maps %s to origin %s without a sender name (6.2, 6.3)', (typeWebhook, origin) => {
    expect(mapNotification({ ...INCOMING_PRIVATE, typeWebhook })).toStrictEqual({
      type: 'message',
      origin,
      chat: { id: '10000000', type: 'user', title: 'Ходабрыш Пробешёлов' },
      message: { remoteId: '1763115112345', timestamp: 1763115112000, text: TEXT, kind: 'text' },
    })
  })

  it('reads outgoing plain text that arrives as extendedTextMessage', () => {
    const body = {
      ...INCOMING_PRIVATE,
      typeWebhook: 'outgoingAPIMessageReceived',
      messageData: {
        typeMessage: 'extendedTextMessage',
        extendedTextMessageData: { text: 'Привет', description: '', title: '' },
      },
    }

    expect(messageOf(body)).toMatchObject({ text: 'Привет', kind: 'text' })
  })

  it.each([
    ['outgoingMessageReceived', 'phone'],
    ['outgoingAPIMessageReceived', 'api'],
  ])('routes %s of a group to the group (origin %s)', (typeWebhook, origin) => {
    expect(mapNotification({ ...INCOMING_GROUP, typeWebhook })).toStrictEqual({
      type: 'message',
      origin,
      chat: { id: '-69876543210123', type: 'group', title: 'Название группы' },
      message: { remoteId: '1763115112345', timestamp: 1763115112000, text: TEXT, kind: 'text' },
    })
  })

  it('routes an outgoing echo by chatId even when sender is the owner (U4)', () => {
    const body = withSender(
      { chatId: '10000000', sender: '20000001', senderName: 'Владелец' },
      'outgoingAPIMessageReceived',
    )

    expect(mapNotification(body)).toMatchObject({
      origin: 'api',
      chat: { id: '10000000', type: 'user', title: 'Ходабрыш Пробешёлов' },
    })
  })

  it('does not name an outgoing chat after the sender fields', () => {
    const body = withSender(
      {
        chatName: '',
        senderName: 'Владелец',
        senderContactName: 'Владелец',
        senderPhoneNumber: 79990000000,
      },
      'outgoingMessageReceived',
    )

    expect(chatOf(body)).toStrictEqual({ id: '10000000', type: 'user', title: '10000000' })
  })
})

describe('mapNotification: chat details', () => {
  it.each([
    ['chatName', { chatName: 'Чат', senderContactName: 'Контакт', senderName: 'Имя' }, 'Чат'],
    [
      'senderContactName',
      { chatName: '', senderContactName: 'Контакт', senderName: 'Имя' },
      'Контакт',
    ],
    ['senderName', { chatName: '', senderContactName: '', senderName: 'Имя' }, 'Имя'],
    [
      'the formatted phone',
      { chatName: '', senderContactName: '', senderName: '' },
      '+7 987 654-32-10',
    ],
    [
      'the chat id',
      { chatName: '', senderContactName: '', senderName: '', senderPhoneNumber: 0 },
      '10000000',
    ],
  ])('titles a private chat by %s', (_label, senderData, title) => {
    expect(chatOf(withSender(senderData))?.title).toBe(title)
  })

  it.each([
    [79876543210, '+7 987 654-32-10'],
    [375291234567, '+375 29 123-45-67'],
    [4915112345678, '+4915112345678'],
  ])('keeps the phone %i and formats it as %s', (senderPhoneNumber, title) => {
    const body = withSender({
      chatName: '',
      senderContactName: '',
      senderName: '',
      senderPhoneNumber,
    })

    expect(chatOf(body)).toStrictEqual({
      id: '10000000',
      type: 'user',
      title,
      phone: String(senderPhoneNumber),
    })
  })

  it('derives the chat type from the id when chatType is missing or unknown', () => {
    expect(
      chatOf(withSender({ chatId: '-10000000000000', chatType: undefined, chatName: '' })),
    ).toStrictEqual({ id: '-10000000000000', type: 'group', title: 'Группа' })
    expect(chatOf(withSender({ chatType: 'robot' }))?.type).toBe('user')
  })

  it('never gives a group the phone of the sender', () => {
    const body = withSender({ chatId: '-1', chatType: 'group', chatName: 'Семья' })

    expect(chatOf(body)).toStrictEqual({ id: '-1', type: 'group', title: 'Семья' })
  })

  it('keeps the bot and channel chat types', () => {
    const body = withSender({ chatType: 'bot', chatName: 'Green-API bot', senderPhoneNumber: 0 })

    expect(chatOf(body)).toStrictEqual({ id: '10000000', type: 'bot', title: 'Green-API bot' })
    expect(chatOf(withSender({ chatType: 'channel' }))?.type).toBe('channel')
  })

  it('accepts a numeric chatId and idMessage', () => {
    const body = { ...withSender({ chatId: 10000000 }), idMessage: 42 }

    expect(mapNotification(body)).toMatchObject({
      chat: { id: '10000000' },
      message: { remoteId: '42' },
    })
  })
})

describe('mapNotification: message types', () => {
  it.each([
    ['imageMessage', 'Фото'],
    ['videoMessage', 'Видео'],
    ['documentMessage', 'Документ'],
    ['audioMessage', 'Голосовое сообщение'],
    ['locationMessage', 'Геопозиция'],
    ['contactMessage', 'Контакт'],
    ['pollMessage', 'Опрос'],
    ['stickerMessage', 'Стикер'],
    ['buttonsMessage', 'Сообщение этого типа не поддерживается'],
  ])('labels %s as "%s"', (typeMessage, text) => {
    expect(messageOf(withMessageData({ typeMessage }))).toMatchObject({ text, kind: 'unsupported' })
  })

  it('shows the text of a quotedMessage', () => {
    const messageData = {
      typeMessage: 'quotedMessage',
      extendedTextMessageData: { text: 'Ответ на цитату', stanzaId: '1', participant: '10000000' },
      quotedMessage: { stanzaId: '1', participant: '10000000' },
    }

    expect(messageOf(withMessageData(messageData))).toMatchObject({
      text: 'Ответ на цитату',
      kind: 'text',
    })
  })

  it.each([
    ['a reactionMessage', { typeMessage: 'reactionMessage' }],
    [
      'an editedMessage',
      { typeMessage: 'editedMessage', editedMessageData: { textMessage: 'Новый' } },
    ],
    ['a deletedMessage', { typeMessage: 'deletedMessage' }],
    ['an empty text', { typeMessage: 'textMessage', textMessageData: { textMessage: '   ' } }],
    ['a quotedMessage without text', { typeMessage: 'quotedMessage', quotedMessage: {} }],
    ['a message without typeMessage', { textMessageData: { textMessage: 'Привет' } }],
  ])('skips %s', (_label, messageData) => {
    expect(mapNotification(withMessageData(messageData))).toBeNull()
  })
})

describe('mapNotification: statuses', () => {
  it.each(['delivered', 'read'])('passes the status %s through (6.4)', (status) => {
    expect(mapNotification({ ...OUTGOING_STATUS, status })).toStrictEqual({
      type: 'status',
      chatId: '10000000',
      remoteId: '115054445839974415',
      status,
    })
  })

  it.each([
    ['failed with a description', 'failed', { description: 'Chat not found' }, 'Chat not found'],
    ['failed without a description', 'failed', {}, 'Сообщение не доставлено.'],
    ['noAccount', 'noAccount', {}, 'У получателя нет аккаунта MAX.'],
    ['notInGroup', 'notInGroup', {}, 'Вы не состоите в этой группе.'],
  ])('maps %s to failed', (_label, status, extra, description) => {
    expect(mapNotification({ ...OUTGOING_STATUS, ...extra, status })).toStrictEqual({
      type: 'status',
      chatId: '10000000',
      remoteId: '115054445839974415',
      status: 'failed',
      description,
    })
  })

  it.each(['sent', 'pending', undefined])('ignores the status %s', (status) => {
    expect(mapNotification({ ...OUTGOING_STATUS, status })).toBeNull()
  })

  it('accepts a numeric chatId and idMessage in a status', () => {
    expect(
      mapNotification({ ...OUTGOING_STATUS, chatId: 10000000, idMessage: 1755591519123 }),
    ).toStrictEqual({
      type: 'status',
      chatId: '10000000',
      remoteId: '1755591519123',
      status: 'delivered',
    })
  })

  it('ignores a status without chatId or idMessage', () => {
    expect(mapNotification({ ...OUTGOING_STATUS, chatId: undefined })).toBeNull()
    expect(mapNotification({ ...OUTGOING_STATUS, idMessage: '' })).toBeNull()
  })
})

describe('mapNotification: instance state and quota', () => {
  it.each(['authorized', 'suspended', 'starting', 'pendingPassword'])(
    'maps stateInstanceChanged %s (6.5)',
    (state) => {
      expect(mapNotification({ ...STATE_CHANGED, stateInstance: state })).toStrictEqual({
        type: 'instanceState',
        state,
      })
    },
  )

  it('treats an unknown or missing state as notAuthorized', () => {
    expect(mapNotification({ ...STATE_CHANGED, stateInstance: 'sleeping' })).toStrictEqual({
      type: 'instanceState',
      state: 'notAuthorized',
    })
    expect(mapNotification({ ...STATE_CHANGED, stateInstance: undefined })).toStrictEqual({
      type: 'instanceState',
      state: 'notAuthorized',
    })
  })

  it('maps quotaExceeded with its description (6.6)', () => {
    expect(mapNotification(QUOTA_EXCEEDED)).toStrictEqual({
      type: 'quotaExceeded',
      description: QUOTA_DESCRIPTION,
    })
  })

  it('uses an empty description when quotaData is missing', () => {
    expect(mapNotification({ ...QUOTA_EXCEEDED, quotaData: undefined })).toStrictEqual({
      type: 'quotaExceeded',
      description: '',
    })
  })
})

describe('mapNotification: malformed input', () => {
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'incomingMessageReceived'],
    ['an array', [INCOMING_PRIVATE]],
    ['an empty object', {}],
    ['an unknown typeWebhook', { ...INCOMING_PRIVATE, typeWebhook: 'incomingCall' }],
    ['a message without senderData', { ...INCOMING_PRIVATE, senderData: undefined }],
    ['a message with senderData as an array', { ...INCOMING_PRIVATE, senderData: [] }],
    ['a message without chatId', withSender({ chatId: '' })],
    ['a message without idMessage', { ...INCOMING_PRIVATE, idMessage: undefined }],
    ['a message with a text timestamp', { ...INCOMING_PRIVATE, timestamp: '1763115112' }],
    ['a message without messageData', { ...INCOMING_PRIVATE, messageData: null }],
    [
      'a message with textMessageData as a string',
      withMessageData({ typeMessage: 'textMessage', textMessageData: 'Привет' }),
    ],
  ])('returns null for %s', (_label, body) => {
    expect(mapNotification(body)).toBeNull()
  })
})
