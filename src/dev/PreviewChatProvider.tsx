import { useMemo, useState, type ReactNode } from 'react'
import { ChatContext } from '@/state/contexts'
import type { ChatApi, ChatMessage, MessageStatus, Notice } from '@/types'
import { formatPhone } from '@/ui/format'
import type { PreviewData } from './fixtures'

interface PreviewState extends PreviewData {
  activeChatId: string | null
  notice: Notice | null
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function normalizeDigits(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`
  const valid = (digits.length === 11 && digits.startsWith('7')) || /^375\d{9}$/.test(digits)
  return valid ? digits : null
}

/**
 * In-memory ChatApi for the preview page: sending walks through every delivery status, a text with
 * the word "ошибка" fails, numbers ending with 0000 are "not in MAX", enabling notifications shows
 * the applying banner for a few seconds.
 */
export function PreviewChatProvider({
  data,
  activeChatId = null,
  notice = null,
  children,
}: {
  data: PreviewData
  activeChatId?: string | null
  notice?: Notice | null
  children: ReactNode
}) {
  const [state, setState] = useState<PreviewState>(() => ({
    ...data,
    activeChatId,
    notice,
    chats: data.chats.map((chat) => (chat.id === activeChatId ? { ...chat, unread: 0 } : chat)),
  }))

  const api = useMemo<ChatApi>(() => {
    const setStatus = (chatId: string, id: string, status: MessageStatus, error?: string) =>
      setState((current) => ({
        ...current,
        messages: {
          ...current.messages,
          [chatId]: (current.messages[chatId] ?? []).map((message) =>
            message.id === id ? { ...message, status, error } : message,
          ),
        },
      }))

    const deliver = (chatId: string, id: string, text: string) => {
      if (text.toLowerCase().includes('ошибка')) {
        setTimeout(() => setStatus(chatId, id, 'failed', 'Нет связи с GREEN-API.'), 800)
        return
      }
      setTimeout(() => setStatus(chatId, id, 'sent'), 700)
      setTimeout(() => setStatus(chatId, id, 'delivered'), 1600)
      setTimeout(() => setStatus(chatId, id, 'read'), 3200)
    }

    const openChat = (chatId: string | null) =>
      setState((current) => ({
        ...current,
        activeChatId: chatId,
        chats: current.chats.map((chat) => (chat.id === chatId ? { ...chat, unread: 0 } : chat)),
      }))

    const chats = [...state.chats].sort((a, b) => b.updatedAt - a.updatedAt)
    const lastMessages: Record<string, ChatMessage | undefined> = {}
    for (const chat of chats) lastMessages[chat.id] = state.messages[chat.id]?.at(-1)

    return {
      chats,
      activeChat: chats.find((chat) => chat.id === state.activeChatId) ?? null,
      messages: state.activeChatId ? (state.messages[state.activeChatId] ?? []) : [],
      lastMessages,
      totalUnread: chats.reduce((sum, chat) => sum + chat.unread, 0),
      notice: state.notice,
      instanceState: 'authorized',
      openChat,
      async sendMessage(chatId, text) {
        const trimmed = text.trim()
        if (!trimmed) return
        const message: ChatMessage = {
          id: crypto.randomUUID(),
          chatId,
          direction: 'out',
          text: trimmed,
          kind: 'text',
          timestamp: Date.now(),
          status: 'sending',
        }
        setState((current) => ({
          ...current,
          messages: {
            ...current.messages,
            [chatId]: [...(current.messages[chatId] ?? []), message],
          },
          chats: current.chats.map((chat) =>
            chat.id === chatId ? { ...chat, updatedAt: message.timestamp } : chat,
          ),
        }))
        deliver(chatId, message.id, trimmed)
      },
      async retryMessage(chatId, messageId) {
        setStatus(chatId, messageId, 'sending')
        const text = state.messages[chatId]?.find((message) => message.id === messageId)?.text ?? ''
        deliver(chatId, messageId, text.replace(/ошибка/gi, ''))
      },
      async startChat(phoneInput) {
        await wait(700)
        const digits = normalizeDigits(phoneInput)
        if (!digits) return { ok: false, error: 'Введите номер России (+7) или Беларуси (+375).' }
        if (digits.endsWith('0000')) return { ok: false, error: 'Этот номер не найден в MAX.' }
        const existing = state.chats.find((chat) => chat.phone === digits)
        const chatId = existing?.id ?? String(20_000_000 + Number(digits.slice(-6)))
        if (!existing) {
          setState((current) => ({
            ...current,
            chats: [
              ...current.chats,
              {
                id: chatId,
                title: formatPhone(digits),
                type: 'user',
                phone: digits,
                unread: 0,
                updatedAt: Date.now(),
              },
            ],
          }))
        }
        openChat(chatId)
        return { ok: true, chatId }
      },
      async enableNotifications() {
        await wait(500)
        setState((current) => ({ ...current, notice: { kind: 'settingsApplying' } }))
        setTimeout(() => setState((current) => ({ ...current, notice: null })), 5000)
      },
    }
  }, [state])

  return <ChatContext.Provider value={api}>{children}</ChatContext.Provider>
}
