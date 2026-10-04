/**
 * Shared model of the app. The api layer produces these types, the state layer stores them
 * and the components render them.
 */

export interface Credentials {
  idInstance: string
  apiTokenInstance: string
  /** API host without a trailing slash, for example https://3100.api.green-api.com */
  apiUrl: string
}

/** Values of stateInstance: getStateInstance answer and the stateInstanceChanged notification. */
export type InstanceState =
  'authorized' | 'notAuthorized' | 'starting' | 'blocked' | 'suspended' | 'pendingPassword'

export type ChatType = 'user' | 'group' | 'channel' | 'bot'

export interface Chat {
  /** GREEN-API chatId: a numeric string, group ids are negative. */
  id: string
  title: string
  type: ChatType
  /** Digits in international format without "+", when known. */
  phone?: string
  /** Incoming messages that were not read yet. */
  unread: number
  /** Milliseconds of the last activity (last message or chat creation). Sort key of the chat list. */
  updatedAt: number
}

export type MessageDirection = 'in' | 'out'
/** Only outgoing messages move through these statuses. */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
export type MessageKind = 'text' | 'unsupported'

export interface ChatMessage {
  /** Local unique id: React key and handle of optimistic updates. */
  id: string
  /** GREEN-API idMessage. Unknown until sendMessage answers. */
  remoteId?: string
  chatId: string
  direction: MessageDirection
  /** The text, or a short label such as "Фото" when kind is "unsupported". */
  text: string
  kind: MessageKind
  /** Milliseconds since epoch. */
  timestamp: number
  status: MessageStatus
  /** Display name of the sender: shown above incoming bubbles of group chats. */
  senderName?: string
  /** Human readable reason, set when status is "failed". */
  error?: string
}

/* ------------------------------------------------------------------ */
/* api layer: implemented in src/api, consumed by src/state            */
/* ------------------------------------------------------------------ */

/** The flags of getSettings / setSettings that matter for a chat client. Flags are "yes" / "no" strings. */
export interface InstanceSettings {
  /** Must be "" for polling through the HTTP API. */
  webhookUrl: string
  incomingWebhook: 'yes' | 'no'
  outgoingWebhook: 'yes' | 'no'
  outgoingMessageWebhook: 'yes' | 'no'
  outgoingAPIMessageWebhook: 'yes' | 'no'
  stateWebhook: 'yes' | 'no'
}

export interface ReceivedNotification {
  receiptId: number
  /** The raw body. Parse it with mapNotification. */
  body: unknown
}

export interface GreenApiClient {
  readonly credentials: Credentials
  getStateInstance(signal?: AbortSignal): Promise<InstanceState>
  getSettings(signal?: AbortSignal): Promise<Partial<InstanceSettings>>
  setSettings(settings: Partial<InstanceSettings>, signal?: AbortSignal): Promise<void>
  /** POST checkAccount. exists is false for a number without a MAX account (chatId is then ""). */
  checkAccount(
    phoneNumber: number,
    signal?: AbortSignal,
  ): Promise<{ exists: boolean; chatId: string }>
  sendMessage(chatId: string, message: string, signal?: AbortSignal): Promise<{ idMessage: string }>
  /** Long poll. Resolves to null when nothing arrived before receiveTimeout (5..60 seconds). */
  receiveNotification(
    receiveTimeout: number,
    signal?: AbortSignal,
  ): Promise<ReceivedNotification | null>
  /** An already deleted notification is not an error. */
  deleteNotification(receiptId: number, signal?: AbortSignal): Promise<void>
}

export type GreenApiErrorCode =
  | 'auth' // 401: wrong apiTokenInstance
  | 'forbidden' // 403: wrong idInstance or request address
  | 'wrongHost' // 404: this shard does not serve the idInstance
  | 'instance' // 400: instance expired, deleted, starting or not authorized
  | 'webhookUrlSet' // 400: a custom webhookUrl blocks receiveNotification
  | 'validation' // any other 400
  | 'chatQuota' // 466 on sendMessage: Developer plan allows 3 chats
  | 'checkLimit' // 466 or 469 on checkAccount: monthly quota or throttling
  | 'rateLimit' // 429
  | 'server' // 5xx
  | 'network' // fetch failed: offline, DNS, blocked
  | 'aborted' // AbortController
  | 'unknown'

/** A notification of the receiveNotification queue translated into what the app understands. */
export interface ChatInfo {
  id: string
  title: string
  type: ChatType
  phone?: string
}

export interface ParsedMessage {
  /** idMessage */
  remoteId: string
  /** Milliseconds (the API sends seconds). */
  timestamp: number
  text: string
  kind: MessageKind
  senderName?: string
}

export type AppEvent =
  | {
      type: 'message'
      /** incoming: from the interlocutor; phone: typed in the MAX app of the owner; api: sent through the API. */
      origin: 'incoming' | 'phone' | 'api'
      chat: ChatInfo
      message: ParsedMessage
    }
  | {
      type: 'status'
      chatId: string
      remoteId: string
      status: 'delivered' | 'read' | 'failed'
      description?: string
    }
  | { type: 'instanceState'; state: InstanceState }
  | { type: 'quotaExceeded'; description: string }

/* ------------------------------------------------------------------ */
/* state layer: implemented in src/state, consumed by src/components   */
/* ------------------------------------------------------------------ */

export interface LoginInput {
  idInstance: string
  apiTokenInstance: string
  /** Optional API host. Detected from idInstance when empty. */
  apiUrl?: string
  /** Keep the session in localStorage (true) or in sessionStorage (false). */
  remember: boolean
}

export type LoginResult =
  { ok: true } | { ok: false; error: string; field?: 'idInstance' | 'apiTokenInstance' | 'apiUrl' }

export interface SessionApi {
  /** null while the user is logged out. */
  session: Credentials | null
  /** stateInstance seen while logging in; null for a session restored from the storage. */
  initialState: InstanceState | null
  /** Text for the login screen after a forced logout (token revoked and so on). */
  message: string | null
  login(input: LoginInput): Promise<LoginResult>
  /** The optional message is shown on the login screen. */
  logout(message?: string): void
}

/** A banner above the conversation. The state layer keeps only the most important one. */
export type Notice =
  | { kind: 'offline' } // GREEN-API cannot be reached, the app retries
  | { kind: 'webhookUrlSet' } // a custom webhookUrl blocks receiving
  | { kind: 'notAuthorized'; state: InstanceState } // the instance is not linked to MAX (scan the QR in the console)
  | { kind: 'settingsApplying' } // setSettings was sent: it applies within 5 minutes
  | { kind: 'settingsFailed'; message: string } // setSettings was rejected
  | { kind: 'notificationsOff' } // incoming messages are switched off in the instance settings
  | { kind: 'quota'; description: string } // Developer plan chat quota

export type StartChatResult = { ok: true; chatId: string } | { ok: false; error: string }

export interface ChatApi {
  /** Sorted by Chat.updatedAt, newest first. */
  chats: Chat[]
  activeChat: Chat | null
  /** Messages of the active chat, oldest first. */
  messages: ChatMessage[]
  /** Last message of every chat that has one, keyed by chat id (chat list preview). */
  lastMessages: Record<string, ChatMessage | undefined>
  totalUnread: number
  notice: Notice | null
  instanceState: InstanceState | null
  /** Opens a chat (null closes the conversation) and marks it as read. */
  openChat(chatId: string | null): void
  /** Optimistic: the message appears at once with status "sending". Never rejects. */
  sendMessage(chatId: string, text: string): Promise<void>
  retryMessage(chatId: string, messageId: string): Promise<void>
  /** Phone number as typed by the user. Validates, resolves the chatId with checkAccount, creates and opens the chat. */
  startChat(phoneInput: string): Promise<StartChatResult>
  /** setSettings with the flags the app needs. Switches the notice to "settingsApplying". */
  enableNotifications(): Promise<void>
}
