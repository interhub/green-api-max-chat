import type { PersistedData } from '@/lib/storage'
import type {
  AppEvent,
  Chat,
  ChatInfo,
  ChatMessage,
  InstanceState,
  MessageStatus,
  Notice,
  ParsedMessage,
} from '@/types'

export interface ChatState {
  chats: Record<string, Chat>
  /** Oldest first. */
  messages: Record<string, ChatMessage[]>
  activeChatId: string | null
  instanceState: InstanceState | null
  /** null until getSettings answered. */
  notificationsEnabled: boolean | null
  settingsApplying: boolean
  settingsError: string | null
  webhookUrlSet: boolean
  offline: boolean
  quota: string | null
}

export const initialChatState: ChatState = {
  chats: {},
  messages: {},
  activeChatId: null,
  instanceState: null,
  notificationsEnabled: null,
  settingsApplying: false,
  settingsError: null,
  webhookUrlSet: false,
  offline: false,
  quota: null,
}

export type ChatAction =
  | { type: 'hydrate'; data: PersistedData }
  | { type: 'openChat'; chatId: string | null }
  | { type: 'createChat'; chat: Chat }
  | { type: 'queueMessage'; chatId: string; id: string; text: string; timestamp: number }
  | { type: 'messageSent'; chatId: string; id: string; remoteId: string }
  | { type: 'messageFailed'; chatId: string; id: string; error: string }
  | { type: 'retryMessage'; chatId: string; id: string; timestamp: number }
  | { type: 'applyEvent'; event: AppEvent; visible: boolean }
  | { type: 'setInstanceState'; state: InstanceState }
  | { type: 'setSettingsStatus'; enabled: boolean; webhookUrlSet: boolean }
  | { type: 'setWebhookUrlSet'; webhookUrlSet: boolean }
  | { type: 'settingsApplying'; applying: boolean }
  | { type: 'settingsError'; error: string | null }
  | { type: 'setOffline'; offline: boolean }
  | { type: 'setQuota'; quota: string }

type ActionOf<T extends ChatAction['type']> = Extract<ChatAction, { type: T }>
type ChatMessageEvent = Extract<AppEvent, { type: 'message' }>
type ChatStatusEvent = Extract<AppEvent, { type: 'status' }>

const NOT_SENT = 'Не отправлено'
const NO_MESSAGES: ChatMessage[] = []
/** An echo may adopt a failed copy only this young: it timed out or the page reloaded, yet the server took it. */
const FAILED_COPY_MAX_AGE_MS = 10 * 60_000
/** Statuses only move forward. A failed message moves on when the API proves it was sent after all. */
const STATUS_RANK: Record<MessageStatus, number> = {
  sending: 0,
  failed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, chats: action.data.chats, messages: failUnsent(action.data.messages) }
    case 'openChat':
      return openChat(state, action.chatId)
    case 'createChat':
      return createChat(state, action.chat)
    case 'queueMessage':
      return queueMessage(state, action)
    case 'messageSent':
      return messageSent(state, action)
    case 'messageFailed':
      return updateMessage(
        state,
        action.chatId,
        (message) => message.id === action.id && message.status === 'sending',
        (message) => ({ ...message, status: 'failed', error: action.error }),
      )
    case 'retryMessage':
      return retryMessage(state, action)
    case 'applyEvent':
      return applyEvent(state, action.event, action.visible)
    case 'setInstanceState':
      return { ...state, instanceState: action.state }
    case 'setSettingsStatus':
      return {
        ...state,
        notificationsEnabled: action.enabled,
        webhookUrlSet: action.webhookUrlSet && !state.settingsApplying,
        // Settings that already work, for example fixed in the console, outdate a failed attempt to change them.
        settingsError: action.enabled ? null : state.settingsError,
      }
    case 'setWebhookUrlSet': {
      // The old webhookUrl stays in force until the new settings apply: the notice keeps saying so.
      const webhookUrlSet = action.webhookUrlSet && !state.settingsApplying
      return state.webhookUrlSet === webhookUrlSet ? state : { ...state, webhookUrlSet }
    }
    case 'settingsApplying':
      return {
        ...state,
        settingsApplying: action.applying,
        settingsError: action.applying ? null : state.settingsError,
      }
    case 'settingsError':
      return { ...state, settingsError: action.error }
    case 'setOffline':
      return state.offline === action.offline ? state : { ...state, offline: action.offline }
    case 'setQuota':
      return { ...state, quota: action.quota }
  }
}

function failUnsent(messages: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
  return Object.fromEntries(
    Object.entries(messages).map(([chatId, list]) => [
      chatId,
      list.map((message): ChatMessage =>
        message.status === 'sending' ? { ...message, status: 'failed', error: NOT_SENT } : message,
      ),
    ]),
  )
}

function openChat(state: ChatState, chatId: string | null): ChatState {
  if (chatId === null) return state.activeChatId === null ? state : { ...state, activeChatId: null }
  const chat = state.chats[chatId]
  if (!chat) return state
  if (state.activeChatId === chatId && chat.unread === 0) return state
  const chats =
    chat.unread === 0 ? state.chats : { ...state.chats, [chatId]: { ...chat, unread: 0 } }
  return { ...state, activeChatId: chatId, chats }
}

function createChat(state: ChatState, chat: Chat): ChatState {
  const existing = state.chats[chat.id]
  if (!existing) return { ...state, chats: { ...state.chats, [chat.id]: chat } }
  if (existing.phone || !chat.phone) return state
  return { ...state, chats: { ...state.chats, [chat.id]: { ...existing, phone: chat.phone } } }
}

function queueMessage(state: ChatState, action: ActionOf<'queueMessage'>): ChatState {
  const { chatId, id, text, timestamp } = action
  const chat = state.chats[chatId]
  if (!chat) return state
  const message: ChatMessage = {
    id,
    chatId,
    direction: 'out',
    text,
    kind: 'text',
    timestamp,
    status: 'sending',
  }
  return {
    ...state,
    chats: {
      ...state.chats,
      [chatId]: { ...chat, updatedAt: Math.max(chat.updatedAt, timestamp) },
    },
    messages: { ...state.messages, [chatId]: [...(state.messages[chatId] ?? []), message] },
  }
}

function messageSent(state: ChatState, action: ActionOf<'messageSent'>): ChatState {
  const { chatId, id, remoteId } = action
  const list = state.messages[chatId] ?? []
  if (list.some((message) => message.remoteId === remoteId && message.id !== id)) {
    return {
      ...state,
      messages: { ...state.messages, [chatId]: list.filter((message) => message.id !== id) },
    }
  }
  return updateMessage(
    state,
    chatId,
    (message) => message.id === id,
    (message) => ({ ...advance(message, 'sent'), remoteId }),
  )
}

function retryMessage(state: ChatState, action: ActionOf<'retryMessage'>): ChatState {
  const { chatId, id, timestamp } = action
  const list = state.messages[chatId] ?? []
  const failed = list.find((message) => message.id === id && message.status === 'failed')
  if (!failed) return state
  const retried: ChatMessage = {
    ...failed,
    status: 'sending',
    error: undefined,
    remoteId: undefined,
    timestamp,
  }
  const chat = state.chats[chatId]
  return {
    ...state,
    chats: chat
      ? { ...state.chats, [chatId]: { ...chat, updatedAt: Math.max(chat.updatedAt, timestamp) } }
      : state.chats,
    messages: {
      ...state.messages,
      [chatId]: [...list.filter((message) => message.id !== id), retried],
    },
  }
}

function applyEvent(state: ChatState, event: AppEvent, visible: boolean): ChatState {
  switch (event.type) {
    case 'message':
      return applyMessage(state, event, visible)
    case 'status':
      return applyStatus(state, event)
    case 'instanceState':
      return { ...state, instanceState: event.state }
    case 'quotaExceeded':
      return { ...state, quota: event.description || 'quota' }
  }
}

function applyMessage(state: ChatState, event: ChatMessageEvent, visible: boolean): ChatState {
  const { chat: info, message, origin } = event
  const list = state.messages[info.id] ?? []
  const incoming = origin === 'incoming'
  const known = list.find((item) => item.remoteId === message.remoteId)
  if (known) {
    // The echo of a message that the HTTP answer already confirmed brings the server time and the contact name.
    const stored = state.chats[info.id]
    const merged = stored && mergeChat(stored, info)
    const chats =
      stored && merged && (merged.title !== stored.title || merged.phone !== stored.phone)
        ? { ...state.chats, [info.id]: merged }
        : state.chats
    const retimable =
      !incoming && known.direction === 'out' && known.timestamp !== message.timestamp
    if (chats === state.chats && !retimable) return state
    const messages = retimable
      ? {
          ...state.messages,
          [info.id]: replaceSorted(list, known, { ...known, timestamp: message.timestamp }),
        }
      : state.messages
    return { ...state, chats, messages }
  }
  const chat = mergeChat(state.chats[info.id], info)
  const unseen = incoming && (state.activeChatId !== info.id || !visible)
  return {
    ...state,
    chats: {
      ...state.chats,
      [info.id]: {
        ...chat,
        unread: chat.unread + (unseen ? 1 : 0),
        updatedAt: Math.max(chat.updatedAt, message.timestamp),
      },
    },
    messages: {
      ...state.messages,
      [info.id]: incoming
        ? insertSorted(list, toIncoming(info.id, message))
        : addOutgoing(list, info.id, message),
    },
  }
}

function mergeChat(stored: Chat | undefined, info: ChatInfo): Chat {
  if (!stored) return { ...info, unread: 0, updatedAt: 0 }
  const title = isPlaceholderTitle(stored) && !isPlaceholderTitle(info) ? info.title : stored.title
  return { ...stored, title, phone: stored.phone ?? info.phone }
}

/** A title the app made up (the chat id or a formatted phone number) that a real name may replace. */
function isPlaceholderTitle({ id, title }: { id: string; title: string }): boolean {
  return title === id || !/\p{L}/u.test(title)
}

function toIncoming(chatId: string, message: ParsedMessage): ChatMessage {
  return {
    id: `remote:${message.remoteId}`,
    remoteId: message.remoteId,
    chatId,
    direction: 'in',
    text: message.text,
    kind: message.kind,
    timestamp: message.timestamp,
    status: 'read',
    senderName: message.senderName,
  }
}

/**
 * Echo of a message sent from this app or from the phone: it adopts an optimistic copy with the same text and gives
 * it the server time, because the device clock may run ahead of the clock of the replies.
 */
function addOutgoing(list: ChatMessage[], chatId: string, message: ParsedMessage): ChatMessage[] {
  const pending = findOptimisticCopy(list, message)
  if (pending) {
    return replaceSorted(list, pending, {
      ...advance(pending, 'sent'),
      remoteId: message.remoteId,
      timestamp: message.timestamp,
    })
  }
  return insertSorted(list, {
    id: `remote:${message.remoteId}`,
    remoteId: message.remoteId,
    chatId,
    direction: 'out',
    text: message.text,
    kind: message.kind,
    timestamp: message.timestamp,
    status: 'sent',
  })
}

/** A copy still being sent (oldest first); otherwise a failed one that is young enough to be this message. */
function findOptimisticCopy(list: ChatMessage[], message: ParsedMessage): ChatMessage | undefined {
  const copies = list.filter(
    (item) => item.direction === 'out' && item.remoteId === undefined && item.text === message.text,
  )
  return (
    copies.find((item) => item.status === 'sending') ??
    copies.find(
      (item) =>
        item.status === 'failed' && message.timestamp - item.timestamp < FAILED_COPY_MAX_AGE_MS,
    )
  )
}

function applyStatus(state: ChatState, event: ChatStatusEvent): ChatState {
  const matches = (message: ChatMessage) =>
    message.direction === 'out' && message.remoteId === event.remoteId
  const chatId = [event.chatId, ...Object.keys(state.messages)].find((id) =>
    state.messages[id]?.some(matches),
  )
  if (chatId === undefined) return state
  return updateMessage(state, chatId, matches, (message) => {
    if (event.status !== 'failed') return advance(message, event.status)
    if (message.status === 'delivered' || message.status === 'read') return message
    return { ...message, status: 'failed', error: event.description }
  })
}

function advance(message: ChatMessage, status: 'sent' | 'delivered' | 'read'): ChatMessage {
  return STATUS_RANK[message.status] >= STATUS_RANK[status]
    ? message
    : { ...message, status, error: undefined }
}

function updateMessage(
  state: ChatState,
  chatId: string,
  matches: (message: ChatMessage) => boolean,
  update: (message: ChatMessage) => ChatMessage,
): ChatState {
  const list = state.messages[chatId] ?? []
  const current = list.find(matches)
  if (!current) return state
  const next = update(current)
  if (next === current) return state
  return {
    ...state,
    messages: {
      ...state.messages,
      [chatId]: list.map((message) => (message === current ? next : message)),
    },
  }
}

/** Stable: a message goes after every message with the same or an earlier timestamp. */
function insertSorted(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = list.findLastIndex((item) => item.timestamp <= message.timestamp) + 1
  return list.toSpliced(index, 0, message)
}

/** Replaces a message and moves it to the place of its (possibly new) timestamp. */
function replaceSorted(
  list: ChatMessage[],
  current: ChatMessage,
  next: ChatMessage,
): ChatMessage[] {
  const others = list.filter((item) => item !== current)
  return insertSorted(others, next)
}

export function selectChats(state: ChatState): Chat[] {
  return Object.values(state.chats).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function selectActiveChat(state: ChatState): Chat | null {
  return state.activeChatId === null ? null : (state.chats[state.activeChatId] ?? null)
}

export function selectActiveMessages(state: ChatState): ChatMessage[] {
  return state.activeChatId === null
    ? NO_MESSAGES
    : (state.messages[state.activeChatId] ?? NO_MESSAGES)
}

export function selectLastMessages(state: ChatState): Record<string, ChatMessage | undefined> {
  const result: Record<string, ChatMessage | undefined> = {}
  for (const [chatId, list] of Object.entries(state.messages)) {
    const last = list.at(-1)
    if (last) result[chatId] = last
  }
  return result
}

export function selectTotalUnread(state: ChatState): number {
  return Object.values(state.chats).reduce((total, chat) => total + chat.unread, 0)
}

/** The instance state or the settings are unknown, or the instance cannot work yet: read them again. */
export function selectNeedsStatusCheck(state: ChatState): boolean {
  return state.instanceState !== 'authorized' || state.notificationsEnabled === null
}

export function selectNotice(state: ChatState): Notice | null {
  if (state.offline) return { kind: 'offline' }
  // A failed attempt to fix the settings shows its reason and the retry button over the notice it tried to clear.
  if (state.settingsError !== null) return { kind: 'settingsFailed', message: state.settingsError }
  if (state.webhookUrlSet) return { kind: 'webhookUrlSet' }
  // Applying settings restarts the instance, so it reports "starting" for a while.
  if (state.settingsApplying) return { kind: 'settingsApplying' }
  if (state.instanceState !== null && state.instanceState !== 'authorized') {
    return { kind: 'notAuthorized', state: state.instanceState }
  }
  if (state.notificationsEnabled === false) return { kind: 'notificationsOff' }
  if (state.quota !== null) return { kind: 'quota', description: state.quota }
  return null
}
