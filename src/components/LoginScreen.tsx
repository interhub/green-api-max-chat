import { CaretDownIcon, EyeIcon, EyeSlashIcon, InfoIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSession } from '@/state'
import type { LoginResult } from '@/types'
import { Button } from '@/ui/Button'
import { Logo } from '@/ui/Logo'
import { TextField } from '@/ui/TextField'
import { ThemeToggleButton } from './ShellActions'

type LoginField = 'idInstance' | 'apiTokenInstance' | 'apiUrl'

interface LoginFailure {
  error: string
  field?: LoginField
}

const CONSOLE_URL = 'https://console.green-api.com'

export function LoginScreen() {
  const { login, message } = useSession()
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [remember, setRemember] = useState(true)
  const [showToken, setShowToken] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<LoginFailure | null>(null)
  const idInstanceRef = useRef<HTMLInputElement>(null)
  const tokenRef = useRef<HTMLInputElement>(null)
  const apiUrlRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!failure?.field) return
    const refs = { idInstance: idInstanceRef, apiTokenInstance: tokenRef, apiUrl: apiUrlRef }
    refs[failure.field].current?.focus()
  }, [failure])

  function fieldError(field: LoginField): string | null {
    return failure?.field === field ? failure.error : null
  }

  function clearErrorOf(field: LoginField) {
    if (failure?.field === field) setFailure(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setFailure(null)
    let result: LoginResult
    try {
      result = await login({
        idInstance,
        apiTokenInstance,
        apiUrl: apiUrl.trim() ? apiUrl : undefined,
        remember,
      })
    } catch {
      result = { ok: false, error: 'Не удалось войти. Попробуйте ещё раз.' }
    }
    setPending(false)
    if (result.ok) return
    if (result.field === 'apiUrl') setAdvancedOpen(true)
    setFailure({ error: result.error, field: result.field })
  }

  const formError = failure && !failure.field ? failure.error : null

  return (
    <div className="flex min-h-dvh justify-center login-ground sm:p-[8.5px]">
      <main className="relative flex min-h-dvh w-full flex-col bg-panel sm:min-h-[calc(100dvh-17px)] sm:w-[580px] sm:rounded-login">
        <ThemeToggleButton className="absolute top-2 right-2 size-[52px] rounded-2xl sm:top-[17px] sm:right-[17px]" />

        <div className="m-auto w-full max-w-[368px] px-4 pt-20 pb-12">
          <Logo size={72} className="mx-auto" />
          <h1 className="mt-6 text-center text-subheader text-fg">Войдите в чат</h1>
          <p className="mt-2 text-center text-detail text-fg-3">
            Введите данные инстанса GREEN-API
          </p>

          {message && (
            <div
              role="status"
              className="mt-6 flex items-start gap-3 rounded-field bg-field px-4 py-3 text-bubble-description text-fg"
            >
              <InfoIcon size={20} aria-hidden="true" className="shrink-0 text-icon-themed" />
              <span>{message}</span>
            </div>
          )}

          <form noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
            <TextField
              label="idInstance"
              name="idInstance"
              inputMode="numeric"
              autoComplete="username"
              spellCheck={false}
              autoFocus
              inputRef={idInstanceRef}
              value={idInstance}
              onChange={(event) => {
                setIdInstance(event.target.value)
                clearErrorOf('idInstance')
              }}
              error={fieldError('idInstance')}
            />
            <TextField
              label="apiTokenInstance"
              name="apiTokenInstance"
              type={showToken ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="off"
              spellCheck={false}
              inputRef={tokenRef}
              value={apiTokenInstance}
              onChange={(event) => {
                setApiTokenInstance(event.target.value)
                clearErrorOf('apiTokenInstance')
              }}
              error={fieldError('apiTokenInstance')}
              trailing={
                <button
                  type="button"
                  aria-label={showToken ? 'Скрыть токен' : 'Показать токен'}
                  title={showToken ? 'Скрыть токен' : 'Показать токен'}
                  onClick={() => setShowToken((visible) => !visible)}
                  className="mr-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-icon-3 hover:bg-ghost-hover hover:text-icon-2 active:scale-[0.94] active:bg-ghost-pressed"
                >
                  {showToken ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
                </button>
              }
            />

            <label className="flex cursor-pointer items-center gap-3 py-1 text-detail text-fg select-none">
              <span className="relative inline-flex size-5 shrink-0">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="peer size-5 cursor-pointer appearance-none rounded-md border-2 border-icon-mute transition-transform duration-100 checked:border-accent checked:bg-accent active:scale-[0.92]"
                />
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="pointer-events-none absolute inset-0 hidden size-5 text-white peer-checked:block"
                >
                  <path
                    d="M5.5 10.5l3 3 6-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Запомнить меня на этом устройстве
            </label>

            {formError && (
              <p role="alert" className="text-description text-negative">
                {formError}
              </p>
            )}

            <Button type="submit" size="large" loading={pending} className="mt-2 w-full">
              Войти
            </Button>

            <details
              open={advancedOpen}
              onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
              className="group"
            >
              <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1 text-action-small text-fg-2 hover:bg-ghost-hover active:bg-ghost-pressed [&::-webkit-details-marker]:hidden">
                Дополнительно
                <CaretDownIcon
                  size={16}
                  aria-hidden="true"
                  className="transition-transform duration-150 group-open:rotate-180"
                />
              </summary>
              <TextField
                className="mt-3"
                label="API URL"
                name="apiUrl"
                type="url"
                inputMode="url"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="https://3100.api.green-api.com"
                inputRef={apiUrlRef}
                value={apiUrl}
                onChange={(event) => {
                  setApiUrl(event.target.value)
                  clearErrorOf('apiUrl')
                }}
                error={fieldError('apiUrl')}
                hint="Определяется автоматически. Укажите адрес из личного кабинета, если вход не удаётся"
              />
            </details>
          </form>

          <p className="mt-6 text-center">
            <a
              href={CONSOLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm text-detail font-medium text-themed hover:underline"
            >
              Где взять idInstance и apiTokenInstance?
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}
