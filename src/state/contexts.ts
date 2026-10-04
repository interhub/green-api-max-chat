import { createContext, useContext } from 'react'
import type { ChatApi, SessionApi } from '@/types'

export const SessionContext = createContext<SessionApi | null>(null)
export const ChatContext = createContext<ChatApi | null>(null)

export function useSession(): SessionApi {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

export function useChat(): ChatApi {
  const value = useContext(ChatContext)
  if (!value) throw new Error('useChat must be used inside <ChatProvider>')
  return value
}
