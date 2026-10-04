import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chat, ChatMessage, Credentials } from '@/types'
import {
  clearSession,
  createDataWriter,
  loadData,
  loadMissingNumbers,
  loadSession,
  MAX_STORED_MESSAGES,
  saveData,
  saveMissingNumbers,
  saveSession,
  WRITE_DELAY_MS,
  type PersistedData,
} from './storage'

const SESSION_KEY = 'max-chat:session'
const credentials: Credentials = {
  idInstance: '3100000001',
  apiTokenInstance: 'token',
  apiUrl: 'https://3100.api.green-api.com',
}
const chat: Chat = {
  id: '10000000',
  title: 'Анна',
  type: 'user',
  phone: '79001234567',
  unread: 1,
  updatedAt: 1_000,
}

function message(index: number): ChatMessage {
  return {
    id: `m${index}`,
    chatId: chat.id,
    direction: 'out',
    text: `text ${index}`,
    kind: 'text',
    timestamp: index,
    status: 'sent',
  }
}

function withTitle(title: string): PersistedData {
  return { chats: { [chat.id]: { ...chat, title } }, messages: {} }
}

function storedTitle(): string | undefined {
  return loadData('1').chats[chat.id]?.title
}

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState')
})

describe('session', () => {
  it('keeps a remembered session in localStorage', () => {
    saveSession(credentials, true)
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(loadSession()).toEqual(credentials)
  })

  it('keeps a session that should not be remembered in sessionStorage only', () => {
    saveSession(credentials, false)
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(loadSession()).toEqual(credentials)
  })

  it('moves the session when the remember choice changes', () => {
    saveSession(credentials, false)
    saveSession(credentials, true)
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(loadSession()).toEqual(credentials)
  })

  it('clears both storages and ignores broken values', () => {
    saveSession(credentials, true)
    clearSession()
    expect(loadSession()).toBeNull()
    localStorage.setItem(SESSION_KEY, '{broken')
    expect(loadSession()).toBeNull()
    localStorage.setItem(SESSION_KEY, JSON.stringify({ idInstance: 1, apiTokenInstance: 'x' }))
    expect(loadSession()).toBeNull()
  })

  it('does not throw when the storage is blocked or full', () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied)
    expect(() => saveSession(credentials, true)).not.toThrow()
    expect(() => clearSession()).not.toThrow()
    expect(loadSession()).toBeNull()
    expect(saveData('1', withTitle('x'))).toBe(false)
    expect(loadData('1')).toEqual({ chats: {}, messages: {} })
  })
})

describe('chat data', () => {
  it('stores chats and the last 500 messages of every chat per idInstance', () => {
    const messages = Array.from({ length: MAX_STORED_MESSAGES + 20 }, (_, index) => message(index))
    expect(saveData('1', { chats: { [chat.id]: chat }, messages: { [chat.id]: messages } })).toBe(
      true,
    )
    const loaded = loadData('1')
    expect(loaded.chats).toEqual({ [chat.id]: chat })
    expect(loaded.messages[chat.id]).toHaveLength(MAX_STORED_MESSAGES)
    expect(loaded.messages[chat.id]?.[0]?.id).toBe('m20')
    expect(JSON.parse(localStorage.getItem('max-chat:data:1') ?? '{}')).toMatchObject({
      version: 1,
    })
    expect(loadData('2')).toEqual({ chats: {}, messages: {} })
  })

  it('drops broken entries and ignores data of another version', () => {
    localStorage.setItem(
      'max-chat:data:1',
      JSON.stringify({
        version: 1,
        chats: { [chat.id]: chat, broken: { id: 'broken' }, other: { ...chat } },
        messages: { [chat.id]: [message(1), { id: 'x' }], broken: [message(2)] },
      }),
    )
    expect(loadData('1')).toEqual({
      chats: { [chat.id]: chat },
      messages: { [chat.id]: [message(1)] },
    })
    localStorage.setItem(
      'max-chat:data:1',
      JSON.stringify({ version: 2, chats: { [chat.id]: chat }, messages: {} }),
    )
    expect(loadData('1')).toEqual({ chats: {}, messages: {} })
  })

  describe('when the storage is full', () => {
    const all = Array.from({ length: MAX_STORED_MESSAGES + 20 }, (_, index) => message(index))
    const data: PersistedData = { chats: { [chat.id]: chat }, messages: { [chat.id]: all } }
    const sizeOf = (count: number) =>
      JSON.stringify({ version: 1, chats: data.chats, messages: { [chat.id]: all.slice(-count) } })
        .length

    function limitStorage(maxLength: number) {
      const write = Storage.prototype.setItem.bind(localStorage)
      return vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
        if (value.length > maxLength) throw new DOMException('full', 'QuotaExceededError')
        write(key, value)
      })
    }

    it('halves the messages per chat until the data fits', () => {
      const setItem = limitStorage(sizeOf(125))
      expect(saveData('1', data)).toBe(true)
      expect(setItem).toHaveBeenCalledTimes(3)
      const stored = loadData('1').messages[chat.id] ?? []
      expect(stored).toHaveLength(125)
      expect(stored.at(-1)?.id).toBe(`m${all.length - 1}`)
    })

    it('stops at 20 messages per chat and reports the failure without throwing', () => {
      const setItem = limitStorage(sizeOf(20) - 1)
      expect(saveData('1', data)).toBe(false)
      expect(setItem.mock.calls.map(([, value]) => value.length)).toEqual(
        [500, 250, 125, 62, 31, 20].map(sizeOf),
      )
    })

    it('does not retry other storage errors', () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError')
      })
      expect(saveData('1', data)).toBe(false)
      expect(setItem).toHaveBeenCalledOnce()
    })
  })
})

describe('numbers without MAX', () => {
  it('keeps the numbers per idInstance and ignores broken values', () => {
    saveMissingNumbers('1', new Set(['79001234567', '375291234567']))
    expect(loadMissingNumbers('1')).toEqual(['79001234567', '375291234567'])
    expect(loadMissingNumbers('2')).toEqual([])
    localStorage.setItem('max-chat:missing:2', JSON.stringify(['79001234567', 7, null]))
    expect(loadMissingNumbers('2')).toEqual(['79001234567'])
    localStorage.setItem('max-chat:missing:2', '{broken')
    expect(loadMissingNumbers('2')).toEqual([])
  })
})

describe('createDataWriter', () => {
  it('writes only the latest data after a pause', () => {
    vi.useFakeTimers()
    const writer = createDataWriter('1')
    writer.schedule(withTitle('first'))
    writer.schedule(withTitle('second'))
    vi.advanceTimersByTime(WRITE_DELAY_MS - 1)
    expect(storedTitle()).toBeUndefined()
    vi.advanceTimersByTime(1)
    expect(storedTitle()).toBe('second')
    writer.dispose()
  })

  it('writes at once when the page is hidden or left', () => {
    vi.useFakeTimers()
    const writer = createDataWriter('1')
    writer.schedule(withTitle('hidden'))
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(storedTitle()).toBe('hidden')
    writer.schedule(withTitle('left'))
    window.dispatchEvent(new Event('pagehide'))
    expect(storedTitle()).toBe('left')
    writer.dispose()
  })

  it('writes the pending data on dispose and stops listening', () => {
    const writer = createDataWriter('1')
    writer.schedule(withTitle('disposed'))
    writer.dispose()
    expect(storedTitle()).toBe('disposed')
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    window.dispatchEvent(new Event('pagehide'))
    expect(setItem).not.toHaveBeenCalled()
  })
})
