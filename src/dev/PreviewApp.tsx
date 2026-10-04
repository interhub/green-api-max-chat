import { useState } from 'react'
import { ChatApp } from '@/components/ChatApp'
import { LoginScreen } from '@/components/LoginScreen'
import { SessionContext } from '@/state/contexts'
import type { LoginInput, LoginResult, Notice, SessionApi } from '@/types'
import { createSessionApi } from './fakes'
import { CHAT_IDS, type PreviewData } from './fixtures'
import { PreviewChatProvider } from './PreviewChatProvider'

const NOTICES: Record<string, Notice> = {
  offline: { kind: 'offline' },
  webhookUrlSet: { kind: 'webhookUrlSet' },
  notAuthorized: { kind: 'notAuthorized', state: 'notAuthorized' },
  settingsApplying: { kind: 'settingsApplying' },
  settingsFailed: { kind: 'settingsFailed', message: 'Нет связи с GREEN-API.' },
  notificationsOff: { kind: 'notificationsOff' },
  quota: { kind: 'quota', description: 'quota' },
}

/** Fake login: token "demo" signs in, anything else shows the matching error. */
async function previewLogin(input: LoginInput): Promise<LoginResult> {
  await new Promise((resolve) => setTimeout(resolve, 900))
  if (!/^\d+$/.test(input.idInstance.trim())) {
    return { ok: false, field: 'idInstance', error: 'Введите idInstance: только цифры.' }
  }
  if (!input.apiTokenInstance.trim()) {
    return { ok: false, field: 'apiTokenInstance', error: 'Введите apiTokenInstance.' }
  }
  if (input.apiTokenInstance.trim() !== 'demo') {
    return {
      ok: false,
      field: 'apiTokenInstance',
      error: 'Неверный idInstance или apiTokenInstance.',
    }
  }
  return { ok: true }
}

interface PreviewAppProps {
  scene: string
  data: PreviewData
  /** Chat id from the query string (?chat=...), overrides the scene default. */
  chatId: string | null
}

function sceneChat(scene: string, chatId: string | null): string | null {
  if (chatId) return chatId
  if (scene === 'chat' || scene.startsWith('banner-')) return CHAT_IDS.anna
  if (scene === 'group') return CHAT_IDS.team
  if (scene === 'failed') return CHAT_IDS.sergey
  if (scene === 'new') return CHAT_IDS.belarus
  return null
}

export function PreviewApp({ scene, data, chatId }: PreviewAppProps) {
  const loginScene = scene === 'login' || scene === 'login-message'
  const [signedIn, setSignedIn] = useState(!loginScene)
  const [message, setMessage] = useState<string | null>(
    scene === 'login-message' ? 'Сессия завершена: проверьте idInstance и apiTokenInstance.' : null,
  )

  const session: SessionApi = createSessionApi({
    session: signedIn
      ? {
          idInstance: '3100000001',
          apiTokenInstance: 'demo',
          apiUrl: 'https://3100.api.green-api.com',
        }
      : null,
    message,
    async login(input) {
      const result = await previewLogin(input)
      if (result.ok) {
        setMessage(null)
        setSignedIn(true)
      }
      return result
    },
    logout(text) {
      setMessage(text ?? null)
      setSignedIn(false)
    },
  })

  const notice = scene.startsWith('banner-')
    ? (NOTICES[scene.slice('banner-'.length)] ?? null)
    : null
  const chatData = scene === 'empty' ? { chats: [], messages: {} } : data

  return (
    <SessionContext.Provider value={session}>
      {signedIn ? (
        <PreviewChatProvider
          data={chatData}
          activeChatId={sceneChat(scene, chatId)}
          notice={notice}
        >
          <ChatApp />
        </PreviewChatProvider>
      ) : (
        <LoginScreen />
      )}
    </SessionContext.Provider>
  )
}
