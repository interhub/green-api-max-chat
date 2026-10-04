import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { createClient, isGreenApiError, type GreenApiError } from '@/api'
import { createId } from '@/lib/async'
import { formatPhone, normalizePhone } from '@/lib/phone'
import {
  createDataWriter,
  loadData,
  loadMissingNumbers,
  saveMissingNumbers,
  type DataWriter,
} from '@/lib/storage'
import type { Chat, ChatApi, Credentials, InstanceState, StartChatResult } from '@/types'
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
  type ChatState,
} from './chatReducer'
import { ChatContext, useSession } from './contexts'
import { runNotificationLoop } from './notificationLoop'
import { withRateLimitRetry } from './retry'
import { REQUIRED_SETTINGS, toSettingsStatus, waitForIncomingWebhook } from './settings'

const MAX_MESSAGE_LENGTH = 4000
/** How often the instance state and the settings are re-read while they are unknown or not fine. */
const STATUS_CHECK_MS = 15_000
const SESSION_ENDED = 'Сессия завершена: проверьте idInstance и apiTokenInstance.'
const TOO_LONG = 'Максимум 4000 символов'
const NOT_IN_MAX = 'Этот номер не найден в MAX.'
const REQUEST_FAILED = 'Не удалось выполнить запрос. Попробуйте ещё раз.'

export function ChatProvider({ children }: { children: ReactNode }) {
  const { session } = useSession()
  if (!session) throw new Error('ChatProvider must be rendered only for a logged in session')
  return (
    <ChatSession key={session.idInstance} session={session}>
      {children}
    </ChatSession>
  )
}

interface InitArgs {
  idInstance: string
  instanceState: InstanceState | null
}

function initState({ idInstance, instanceState }: InitArgs): ChatState {
  const hydrated = chatReducer(initialChatState, { type: 'hydrate', data: loadData(idInstance) })
  return { ...hydrated, instanceState }
}

function isAuthError(error: unknown): error is GreenApiError {
  return isGreenApiError(error) && (error.code === 'auth' || error.code === 'forbidden')
}

function errorText(error: unknown): string {
  return isGreenApiError(error) && error.message ? error.message : REQUEST_FAILED
}

function ChatSession({ session, children }: { session: Credentials; children: ReactNode }) {
  const { initialState, logout } = useSession()
  const client = useMemo(() => createClient(session), [session])
  const [state, dispatch] = useReducer(
    chatReducer,
    { idInstance: session.idInstance, instanceState: initialState },
    initState,
  )
  const latest = useRef(state)
  /** False after logout or unmount: late answers belong to a session that is gone, maybe replaced by a new one. */
  const alive = useRef(false)
  const writer = useRef<DataWriter | null>(null)
  const delivering = useRef(new Set<string>())
  const missingNumbers = useRef(new Set<string>())
  const checkingStatus = useRef(false)
  const { chats, messages, activeChatId, settingsApplying } = state
  const needsStatusCheck = selectNeedsStatusCheck(state)

  useEffect(() => {
    latest.current = state
  }, [state])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    const created = createDataWriter(session.idInstance)
    writer.current = created
    return () => {
      created.dispose()
      writer.current = null
    }
  }, [session.idInstance])

  useEffect(() => {
    missingNumbers.current = new Set(loadMissingNumbers(session.idInstance))
  }, [session.idInstance])

  useEffect(() => {
    writer.current?.schedule({ chats, messages })
  }, [chats, messages])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const onError = (error: unknown) => {
      if (!signal.aborted && isAuthError(error)) logout(error.message)
    }
    if (initialState === null) {
      void withRateLimitRetry(() => client.getStateInstance(signal), 1, 1_200, signal).then(
        (instanceState) => dispatch({ type: 'setInstanceState', state: instanceState }),
        onError,
      )
    }
    void withRateLimitRetry(() => client.getSettings(signal), 1, 1_200, signal).then(
      (settings) => dispatch({ type: 'setSettingsStatus', ...toSettingsStatus(settings) }),
      onError,
    )
    return () => controller.abort()
  }, [client, initialState, logout])

  /**
   * Re-reads what is not known or not fine yet. Never two checks at once and the reads one after another:
   * getStateInstance allows 1 request per second. The settings watcher owns getSettings while settings apply.
   */
  const refreshStatus = useCallback(async () => {
    if (checkingStatus.current) return
    checkingStatus.current = true
    try {
      if (latest.current.instanceState !== 'authorized') {
        const instanceState = await withRateLimitRetry(() => client.getStateInstance(), 1, 1_200)
        if (!alive.current) return
        dispatch({ type: 'setInstanceState', state: instanceState })
      }
      if (latest.current.notificationsEnabled !== true && !latest.current.settingsApplying) {
        const settings = await withRateLimitRetry(() => client.getSettings(), 1, 1_200)
        if (!alive.current) return
        dispatch({ type: 'setSettingsStatus', ...toSettingsStatus(settings) })
      }
    } catch (error) {
      if (alive.current && isAuthError(error)) logout(error.message)
    } finally {
      checkingStatus.current = false
    }
  }, [client, logout])

  useEffect(() => {
    if (!needsStatusCheck) return
    const onVisibilityChange = () => {
      if (!document.hidden) void refreshStatus()
    }
    const timer = setInterval(() => void refreshStatus(), STATUS_CHECK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [needsStatusCheck, refreshStatus])

  useEffect(() => {
    const controller = new AbortController()
    void runNotificationLoop(
      client,
      {
        onEvent: (event) => dispatch({ type: 'applyEvent', event, visible: !document.hidden }),
        onOnline: () => {
          const before = latest.current
          dispatch({ type: 'setOffline', offline: false })
          dispatch({ type: 'setWebhookUrlSet', webhookUrlSet: false })
          // A webhookUrl cleared in the console also changes the settings read at mount.
          if (selectNeedsStatusCheck(before) || before.webhookUrlSet) void refreshStatus()
        },
        onOffline: () => dispatch({ type: 'setOffline', offline: true }),
        onWebhookUrlSet: () => dispatch({ type: 'setWebhookUrlSet', webhookUrlSet: true }),
        onInstanceNotReady: (instanceState) => {
          dispatch({ type: 'setOffline', offline: false })
          dispatch({ type: 'setInstanceState', state: instanceState })
        },
        onAuthError: () => logout(SESSION_ENDED),
      },
      controller.signal,
    )
    return () => controller.abort()
  }, [client, logout, refreshStatus])

  useEffect(() => {
    if (!settingsApplying) return
    const controller = new AbortController()
    void waitForIncomingWebhook(client, controller.signal).then((status) => {
      if (controller.signal.aborted) return
      if (status) dispatch({ type: 'setSettingsStatus', ...status })
      dispatch({ type: 'settingsApplying', applying: false })
    })
    return () => controller.abort()
  }, [client, settingsApplying])

  useEffect(() => {
    if (activeChatId === null) return
    const onVisibilityChange = () => {
      if (!document.hidden) dispatch({ type: 'openChat', chatId: activeChatId })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [activeChatId])

  const openChat = useCallback(
    (chatId: string | null) => dispatch({ type: 'openChat', chatId }),
    [],
  )

  const deliver = useCallback(
    async (chatId: string, id: string, text: string) => {
      if (text.length > MAX_MESSAGE_LENGTH) {
        dispatch({ type: 'messageFailed', chatId, id, error: TOO_LONG })
        return
      }
      delivering.current.add(id)
      try {
        const { idMessage } = await withRateLimitRetry(
          () => client.sendMessage(chatId, text),
          2,
          1_000,
        )
        if (alive.current) dispatch({ type: 'messageSent', chatId, id, remoteId: idMessage })
      } catch (error) {
        if (!alive.current) return
        dispatch({ type: 'messageFailed', chatId, id, error: errorText(error) })
        if (isGreenApiError(error) && error.code === 'chatQuota') {
          dispatch({ type: 'setQuota', quota: error.message })
        }
        if (isAuthError(error)) logout(error.message)
      } finally {
        delivering.current.delete(id)
      }
    },
    [client, logout],
  )

  const sendMessage = useCallback(
    async (chatId: string, input: string) => {
      const text = input.trim()
      if (!text || !latest.current.chats[chatId]) return
      const id = createId()
      dispatch({ type: 'queueMessage', chatId, id, text, timestamp: Date.now() })
      await deliver(chatId, id, text)
    },
    [deliver],
  )

  const retryMessage = useCallback(
    async (chatId: string, messageId: string) => {
      const message = latest.current.messages[chatId]?.find((item) => item.id === messageId)
      if (!message || message.status !== 'failed' || delivering.current.has(messageId)) return
      dispatch({ type: 'retryMessage', chatId, id: messageId, timestamp: Date.now() })
      await deliver(chatId, messageId, message.text)
    },
    [deliver],
  )

  const startChat = useCallback(
    async (phoneInput: string): Promise<StartChatResult> => {
      const phone = normalizePhone(phoneInput)
      if (!phone.ok) return { ok: false, error: phone.error }
      const { digits } = phone
      const existing = Object.values(latest.current.chats).find((chat) => chat.phone === digits)
      if (existing) {
        dispatch({ type: 'openChat', chatId: existing.id })
        return { ok: true, chatId: existing.id }
      }
      // checkAccount is limited to 100 calls a month on the Developer plan: a number without MAX is never
      // checked twice, the list is stored with the chats and survives a reload.
      if (missingNumbers.current.has(digits)) return { ok: false, error: NOT_IN_MAX }
      try {
        const account = await withRateLimitRetry(
          () => client.checkAccount(Number(digits)),
          1,
          1_000,
        )
        if (!account.exists || !account.chatId) {
          missingNumbers.current.add(digits)
          saveMissingNumbers(session.idInstance, missingNumbers.current)
          return { ok: false, error: NOT_IN_MAX }
        }
        if (!alive.current) return { ok: false, error: REQUEST_FAILED }
        const chat: Chat = {
          id: account.chatId,
          title: formatPhone(digits),
          type: 'user',
          phone: digits,
          unread: 0,
          updatedAt: Date.now(),
        }
        dispatch({ type: 'createChat', chat })
        dispatch({ type: 'openChat', chatId: chat.id })
        return { ok: true, chatId: chat.id }
      } catch (error) {
        return { ok: false, error: errorText(error) }
      }
    },
    [client, session.idInstance],
  )

  const enableNotifications = useCallback(async () => {
    try {
      await client.setSettings(REQUIRED_SETTINGS)
      if (!alive.current) return
      dispatch({ type: 'setWebhookUrlSet', webhookUrlSet: false })
      dispatch({ type: 'settingsApplying', applying: true })
    } catch (error) {
      if (alive.current) dispatch({ type: 'settingsError', error: errorText(error) })
    }
  }, [client])

  const value = useMemo<ChatApi>(
    () => ({
      chats: selectChats(state),
      activeChat: selectActiveChat(state),
      messages: selectActiveMessages(state),
      lastMessages: selectLastMessages(state),
      totalUnread: selectTotalUnread(state),
      notice: selectNotice(state),
      instanceState: state.instanceState,
      openChat,
      sendMessage,
      retryMessage,
      startChat,
      enableNotifications,
    }),
    [state, openChat, sendMessage, retryMessage, startChat, enableNotifications],
  )

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}
