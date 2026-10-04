import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/dev/renderWithProviders'
import type { LoginResult, SessionApi } from '@/types'
import { LoginScreen } from './LoginScreen'

function renderLogin(session: Partial<SessionApi> = {}) {
  return renderWithProviders(<LoginScreen />, { session })
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('idInstance'), '3100000001')
  await user.type(screen.getByLabelText('apiTokenInstance'), 'secret-token')
}

describe('LoginScreen', () => {
  it('focuses idInstance and sends the form values to login()', async () => {
    const login = vi.fn<SessionApi['login']>().mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderLogin({ login })

    expect(screen.getByRole('heading', { name: 'Войдите в чат' })).toBeInTheDocument()
    expect(screen.getByLabelText('idInstance')).toHaveFocus()
    expect(screen.getByLabelText('idInstance')).toHaveAttribute('inputmode', 'numeric')
    expect(
      screen.getByRole('checkbox', { name: 'Запомнить меня на этом устройстве' }),
    ).toBeChecked()

    await fillCredentials(user)
    await user.click(screen.getByRole('checkbox', { name: 'Запомнить меня на этом устройстве' }))
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(login).toHaveBeenCalledWith({
      idInstance: '3100000001',
      apiTokenInstance: 'secret-token',
      apiUrl: undefined,
      remember: false,
    })
  })

  it('shows a field error under the field named by the result and focuses it', async () => {
    const login = vi.fn<SessionApi['login']>().mockResolvedValue({
      ok: false,
      field: 'apiTokenInstance',
      error: 'Неверный idInstance или apiTokenInstance.',
    })
    const user = userEvent.setup()
    renderLogin({ login })

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    const token = screen.getByLabelText('apiTokenInstance')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный idInstance или apiTokenInstance.',
    )
    expect(token).toHaveAttribute('aria-invalid', 'true')
    expect(token).toHaveAccessibleDescription('Неверный idInstance или apiTokenInstance.')
    expect(token).toHaveFocus()
    expect(screen.getByLabelText('idInstance')).not.toHaveAttribute('aria-invalid')

    await user.type(token, 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error without a field as a form-level alert', async () => {
    const login = vi
      .fn<SessionApi['login']>()
      .mockResolvedValue({ ok: false, error: 'Нет связи с GREEN-API.' })
    const user = userEvent.setup()
    renderLogin({ login })

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с GREEN-API.')
    expect(screen.getByLabelText('idInstance')).not.toHaveAttribute('aria-invalid')
  })

  it('opens the advanced section for an API URL error and passes the URL', async () => {
    const login = vi.fn<SessionApi['login']>().mockResolvedValue({
      ok: false,
      field: 'apiUrl',
      error: 'Укажите API URL, начинающийся с https://',
    })
    const user = userEvent.setup()
    renderLogin({ login })

    await fillCredentials(user)
    await user.click(screen.getByText('Дополнительно'))
    await user.type(screen.getByLabelText('API URL'), 'ftp://host')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(login).toHaveBeenCalledWith(expect.objectContaining({ apiUrl: 'ftp://host' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите API URL')
    expect(screen.getByLabelText('API URL')).toHaveFocus()
    expect(screen.getByText('Дополнительно').closest('details')).toHaveAttribute('open')
  })

  it('shows a busy button while login() is running', async () => {
    let finish: (result: LoginResult) => void = () => undefined
    const login = vi.fn<SessionApi['login']>(
      () =>
        new Promise<LoginResult>((resolve) => {
          finish = resolve
        }),
    )
    const user = userEvent.setup()
    renderLogin({ login })

    await fillCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    const button = screen.getByRole('button', { name: 'Войти' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await user.keyboard('{Enter}')
    expect(login).toHaveBeenCalledTimes(1)

    finish({ ok: false, error: 'Сервис GREEN-API временно недоступен.' })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled()
  })

  it('shows and hides the token', async () => {
    const user = userEvent.setup()
    renderLogin()
    const token = screen.getByLabelText('apiTokenInstance')
    expect(token).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'Показать токен' }))
    expect(token).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'Скрыть токен' }))
    expect(token).toHaveAttribute('type', 'password')
  })

  it('shows the reason of a forced logout and the console link', () => {
    renderLogin({ message: 'Сессия завершена: проверьте idInstance и apiTokenInstance.' })
    expect(screen.getByRole('status')).toHaveTextContent('Сессия завершена')
    const link = screen.getByRole('link', { name: 'Где взять idInstance и apiTokenInstance?' })
    expect(link).toHaveAttribute('href', 'https://console.green-api.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})
