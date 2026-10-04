import type { AppEvent, ChatInfo, ChatType, ParsedMessage } from '@/types'
import { isRecord, readId, readText, toInstanceState, type JsonObject } from './parse'

type MessageOrigin = 'incoming' | 'phone' | 'api'
type MessageContent = Pick<ParsedMessage, 'text' | 'kind'>

const CHAT_TYPES: readonly ChatType[] = ['user', 'group', 'channel', 'bot']
const TEXT_TYPES = new Set(['textMessage', 'extendedTextMessage', 'quotedMessage'])
const HIDDEN_TYPES = new Set(['reactionMessage', 'editedMessage', 'deletedMessage'])
const UNSUPPORTED_LABELS = new Map([
  ['imageMessage', 'Фото'],
  ['videoMessage', 'Видео'],
  ['documentMessage', 'Документ'],
  ['audioMessage', 'Голосовое сообщение'],
  ['locationMessage', 'Геопозиция'],
  ['contactMessage', 'Контакт'],
  ['pollMessage', 'Опрос'],
  ['stickerMessage', 'Стикер'],
])
const UNKNOWN_TYPE_LABEL = 'Сообщение этого типа не поддерживается'
const FAILURE_DESCRIPTIONS = new Map([
  ['noAccount', 'У получателя нет аккаунта MAX.'],
  ['notInGroup', 'Вы не состоите в этой группе.'],
])
const PHONE_FORMATS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 $1 $2-$3-$4'],
  [/^375(\d{2})(\d{3})(\d{2})(\d{2})$/, '+375 $1 $2-$3-$4'],
]

/** Translates the body of a receiveNotification answer. Returns null for anything the app does not show. */
export function mapNotification(body: unknown): AppEvent | null {
  if (!isRecord(body)) return null
  switch (body.typeWebhook) {
    case 'incomingMessageReceived':
      return mapMessage(body, 'incoming')
    case 'outgoingMessageReceived':
      return mapMessage(body, 'phone')
    case 'outgoingAPIMessageReceived':
      return mapMessage(body, 'api')
    case 'outgoingMessageStatus':
      return mapStatus(body)
    case 'stateInstanceChanged':
      return { type: 'instanceState', state: toInstanceState(body.stateInstance) }
    case 'quotaExceeded':
      return {
        type: 'quotaExceeded',
        description: isRecord(body.quotaData) ? readText(body.quotaData.description) : '',
      }
    default:
      return null
  }
}

function mapMessage(body: JsonObject, origin: MessageOrigin): AppEvent | null {
  const sender = body.senderData
  const remoteId = readId(body.idMessage)
  const timestamp = body.timestamp
  const content = readContent(body.messageData)
  if (!isRecord(sender) || !remoteId || typeof timestamp !== 'number' || !content) return null
  const chatId = readId(sender.chatId)
  if (!chatId) return null
  const message: ParsedMessage = { remoteId, timestamp: timestamp * 1000, ...content }
  const senderName = readText(sender.senderName)
  if (origin === 'incoming' && senderName) message.senderName = senderName
  return { type: 'message', origin, chat: readChat(sender, chatId, origin), message }
}

function readChat(sender: JsonObject, id: string, origin: MessageOrigin): ChatInfo {
  const type =
    CHAT_TYPES.find((chatType) => chatType === sender.chatType) ??
    (id.startsWith('-') ? 'group' : 'user')
  const chatName = readText(sender.chatName)
  if (type === 'group') return { id, type, title: chatName || 'Группа' }
  // In outgoing notifications the sender fields may describe the account owner, not the interlocutor.
  if (origin !== 'incoming') return { id, type, title: chatName || id }
  const phone = readPhone(sender.senderPhoneNumber)
  const title =
    chatName ||
    readText(sender.senderContactName) ||
    readText(sender.senderName) ||
    (phone ? formatPhone(phone) : id)
  return phone ? { id, type, title, phone } : { id, type, title }
}

function readContent(messageData: unknown): MessageContent | null {
  if (!isRecord(messageData)) return null
  const type = readText(messageData.typeMessage)
  if (TEXT_TYPES.has(type)) {
    const text = readMessageText(messageData)
    return text ? { text, kind: 'text' } : null
  }
  if (!type || HIDDEN_TYPES.has(type)) return null
  return { text: UNSUPPORTED_LABELS.get(type) ?? UNKNOWN_TYPE_LABEL, kind: 'unsupported' }
}

function readMessageText(messageData: JsonObject): string {
  const { textMessageData, extendedTextMessageData } = messageData
  const candidates = [
    isRecord(textMessageData) ? textMessageData.textMessage : undefined,
    isRecord(extendedTextMessageData) ? extendedTextMessageData.text : undefined,
  ]
  return (
    candidates.find((text): text is string => typeof text === 'string' && text.trim() !== '') ?? ''
  )
}

function mapStatus(body: JsonObject): AppEvent | null {
  const chatId = readId(body.chatId)
  const remoteId = readId(body.idMessage)
  const status = readText(body.status)
  if (!chatId || !remoteId) return null
  if (status === 'delivered' || status === 'read') {
    return { type: 'status', chatId, remoteId, status }
  }
  const description =
    status === 'failed'
      ? readText(body.description) || 'Сообщение не доставлено.'
      : FAILURE_DESCRIPTIONS.get(status)
  return description ? { type: 'status', chatId, remoteId, status: 'failed', description } : null
}

function readPhone(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : undefined
}

function formatPhone(digits: string): string {
  const format = PHONE_FORMATS.find(([pattern]) => pattern.test(digits))
  return format ? digits.replace(format[0], format[1]) : `+${digits}`
}
