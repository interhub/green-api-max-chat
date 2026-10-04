import type { ChatApi, SessionApi } from '@/types'

/** SessionApi with harmless defaults, for tests and the preview harness. */
export function createSessionApi(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    session: null,
    initialState: null,
    message: null,
    login: () => Promise.resolve({ ok: true }),
    logout: () => undefined,
    ...overrides,
  }
}

/** ChatApi with an empty chat list and no-op actions, for tests and the preview harness. */
export function createChatApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    chats: [],
    activeChat: null,
    messages: [],
    lastMessages: {},
    totalUnread: 0,
    notice: null,
    instanceState: 'authorized',
    openChat: () => undefined,
    sendMessage: () => Promise.resolve(),
    retryMessage: () => Promise.resolve(),
    startChat: () => Promise.resolve({ ok: false, error: 'Этот номер не найден в MAX.' }),
    enableNotifications: () => Promise.resolve(),
    ...overrides,
  }
}
