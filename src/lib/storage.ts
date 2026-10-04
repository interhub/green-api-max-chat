import type { Chat, ChatMessage, Credentials } from '@/types'

const SESSION_KEY = 'max-chat:session'
const DATA_VERSION = 1
export const MAX_STORED_MESSAGES = 500
/** When the storage is full the per-chat cap is halved down to this value. */
export const MIN_STORED_MESSAGES = 20
export const WRITE_DELAY_MS = 400

export interface PersistedData {
  chats: Record<string, Chat>
  /** Oldest first. */
  messages: Record<string, ChatMessage[]>
}

type StorageKind = 'local' | 'session'

/** sessionStorage first: it holds the session only when the user chose not to be remembered. */
const SESSION_LOOKUP: readonly StorageKind[] = ['session', 'local']
const CHAT_TYPES = new Set(['user', 'group', 'channel', 'bot'])
const MESSAGE_STATUSES = new Set(['sending', 'sent', 'delivered', 'read', 'failed'])

/* Every storage access is wrapped: private mode, blocked cookies or a full quota must not break the app. */

function getStorage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function readJson(kind: StorageKind, key: string): unknown {
  try {
    const text = getStorage(kind)?.getItem(key)
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

type WriteResult = 'ok' | 'full' | 'failed'

function writeJson(kind: StorageKind, key: string, value: unknown): boolean {
  return tryWrite(kind, key, value) === 'ok'
}

function tryWrite(kind: StorageKind, key: string, value: unknown): WriteResult {
  try {
    getStorage(kind)?.setItem(key, JSON.stringify(value))
    return 'ok'
  } catch (error) {
    return isQuotaError(error) ? 'full' : 'failed'
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

function removeItem(kind: StorageKind, key: string): boolean {
  try {
    getStorage(kind)?.removeItem(key)
    return true
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isCredentials(value: unknown): value is Credentials {
  return (
    isRecord(value) &&
    typeof value.idInstance === 'string' &&
    typeof value.apiTokenInstance === 'string' &&
    typeof value.apiUrl === 'string'
  )
}

function isChat(value: unknown): value is Chat {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.type === 'string' &&
    CHAT_TYPES.has(value.type) &&
    isOptionalString(value.phone) &&
    typeof value.unread === 'number' &&
    typeof value.updatedAt === 'number'
  )
}

function isMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    isOptionalString(value.remoteId) &&
    typeof value.chatId === 'string' &&
    (value.direction === 'in' || value.direction === 'out') &&
    typeof value.text === 'string' &&
    (value.kind === 'text' || value.kind === 'unsupported') &&
    typeof value.timestamp === 'number' &&
    typeof value.status === 'string' &&
    MESSAGE_STATUSES.has(value.status) &&
    isOptionalString(value.senderName) &&
    isOptionalString(value.error)
  )
}

export function loadSession(): Credentials | null {
  for (const kind of SESSION_LOOKUP) {
    const value = readJson(kind, SESSION_KEY)
    if (isCredentials(value)) {
      const { idInstance, apiTokenInstance, apiUrl } = value
      return { idInstance, apiTokenInstance, apiUrl }
    }
  }
  return null
}

/** remember: localStorage (survives the browser restart), otherwise sessionStorage (this tab only). */
export function saveSession(credentials: Credentials, remember: boolean): void {
  const { idInstance, apiTokenInstance, apiUrl } = credentials
  removeItem(remember ? 'session' : 'local', SESSION_KEY)
  writeJson(remember ? 'local' : 'session', SESSION_KEY, { idInstance, apiTokenInstance, apiUrl })
}

export function clearSession(): void {
  removeItem('local', SESSION_KEY)
  removeItem('session', SESSION_KEY)
}

function dataKey(idInstance: string): string {
  return `max-chat:data:${idInstance}`
}

/** Chats and messages saved for this idInstance. Broken entries are dropped, another version is ignored. */
export function loadData(idInstance: string): PersistedData {
  const data: PersistedData = { chats: {}, messages: {} }
  const stored = readJson('local', dataKey(idInstance))
  if (!isRecord(stored) || stored.version !== DATA_VERSION) return data
  const { chats, messages } = stored
  if (!isRecord(chats) || !isRecord(messages)) return data
  for (const [id, chat] of Object.entries(chats)) {
    if (isChat(chat) && chat.id === id) data.chats[id] = chat
  }
  for (const [chatId, list] of Object.entries(messages)) {
    if (data.chats[chatId] && Array.isArray(list)) data.messages[chatId] = list.filter(isMessage)
  }
  return data
}

/**
 * Writes at once and keeps the last MAX_STORED_MESSAGES messages of every chat. When the storage is full it keeps
 * half as many, down to MIN_STORED_MESSAGES. Returns false when nothing could be written.
 */
export function saveData(idInstance: string, data: PersistedData): boolean {
  for (let cap = MAX_STORED_MESSAGES; ; cap = Math.max(MIN_STORED_MESSAGES, Math.floor(cap / 2))) {
    const result = tryWrite('local', dataKey(idInstance), toStoredData(data, cap))
    if (result !== 'full' || cap === MIN_STORED_MESSAGES) return result === 'ok'
  }
}

function toStoredData(data: PersistedData, cap: number) {
  const messages: Record<string, ChatMessage[]> = {}
  for (const [chatId, list] of Object.entries(data.messages)) {
    messages[chatId] = list.slice(-cap)
  }
  return { version: DATA_VERSION, chats: data.chats, messages }
}

function missingKey(idInstance: string): string {
  return `max-chat:missing:${idInstance}`
}

/** Numbers that checkAccount reported without a MAX account (digits), so they are never checked twice. */
export function loadMissingNumbers(idInstance: string): string[] {
  const stored = readJson('local', missingKey(idInstance))
  return Array.isArray(stored)
    ? stored.filter((value): value is string => typeof value === 'string')
    : []
}

export function saveMissingNumbers(idInstance: string, numbers: Iterable<string>): void {
  writeJson('local', missingKey(idInstance), [...numbers])
}

export interface DataWriter {
  /** Saves the data after WRITE_DELAY_MS; a newer call replaces the pending data. */
  schedule(data: PersistedData): void
  flush(): void
  /** Flushes and stops listening to the page events. */
  dispose(): void
}

/** Debounced saveData that also flushes when the page is hidden or left, so a closed tab loses nothing. */
export function createDataWriter(idInstance: string): DataWriter {
  let pending: PersistedData | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    if (pending) saveData(idInstance, pending)
    pending = null
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush()
  }

  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onVisibilityChange)

  return {
    schedule(data) {
      pending = data
      clearTimeout(timer)
      timer = setTimeout(flush, WRITE_DELAY_MS)
    },
    flush,
    dispose() {
      flush()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}
