import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { connect, isApiUrl, isGreenApiError, type ConnectInput } from '@/api'
import { clearSession, loadSession, saveSession } from '@/lib/storage'
import type {
  Credentials,
  GreenApiErrorCode,
  InstanceState,
  LoginInput,
  LoginResult,
  SessionApi,
} from '@/types'
import { SessionContext } from './contexts'

const LOGIN_FAILED = 'Не удалось войти. Попробуйте ещё раз.'
/** Errors of the host rather than of the token: the user fixes them in the API URL field. */
const API_URL_ERRORS = new Set<GreenApiErrorCode>(['wrongHost', 'forbidden', 'network'])

type CheckedInput =
  | { ok: true; input: ConnectInput }
  | { ok: false; error: string; field: 'idInstance' | 'apiTokenInstance' | 'apiUrl' }

function checkInput(input: LoginInput): CheckedInput {
  const idInstance = input.idInstance.trim()
  const apiTokenInstance = input.apiTokenInstance.trim()
  const apiUrl = input.apiUrl?.trim() ?? ''
  if (!/^\d+$/.test(idInstance)) {
    return { ok: false, field: 'idInstance', error: 'Введите idInstance: только цифры.' }
  }
  if (!apiTokenInstance) {
    return { ok: false, field: 'apiTokenInstance', error: 'Введите apiTokenInstance.' }
  }
  if (apiUrl && !isApiUrl(apiUrl)) {
    return { ok: false, field: 'apiUrl', error: 'Укажите API URL, начинающийся с https://' }
  }
  return { ok: true, input: { idInstance, apiTokenInstance, apiUrl: apiUrl || undefined } }
}

function toLoginError(error: unknown): LoginResult {
  if (!isGreenApiError(error)) return { ok: false, error: LOGIN_FAILED }
  const message = error.message || LOGIN_FAILED
  if (error.code === 'auth') return { ok: false, field: 'apiTokenInstance', error: message }
  if (API_URL_ERRORS.has(error.code)) return { ok: false, field: 'apiUrl', error: message }
  return { ok: false, error: message }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Credentials | null>(loadSession)
  const [initialState, setInitialState] = useState<InstanceState | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const pendingLogin = useRef<Promise<LoginResult> | null>(null)

  const login = useCallback((input: LoginInput): Promise<LoginResult> => {
    if (pendingLogin.current) return pendingLogin.current
    const checked = checkInput(input)
    if (!checked.ok) return Promise.resolve(checked)
    const attempt = connect(checked.input).then(({ client, state }): LoginResult => {
      saveSession(client.credentials, input.remember)
      setSession(client.credentials)
      setInitialState(state)
      setMessage(null)
      return { ok: true }
    }, toLoginError)
    pendingLogin.current = attempt
    void attempt.finally(() => {
      pendingLogin.current = null
    })
    return attempt
  }, [])

  const logout = useCallback((reason?: string) => {
    clearSession()
    setSession(null)
    setInitialState(null)
    setMessage(typeof reason === 'string' ? reason : null)
  }, [])

  const value = useMemo<SessionApi>(
    () => ({ session, initialState, message, login, logout }),
    [session, initialState, message, login, logout],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
