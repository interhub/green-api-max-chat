import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { ChatApi, Notice } from '@/types'
import { Banner } from './Banner'

function renderBanner(notice: Notice) {
  const enableNotifications = vi.fn<ChatApi['enableNotifications']>().mockResolvedValue(undefined)
  renderWithProviders(<Banner notice={notice} />, { chat: { enableNotifications } })
  return { enableNotifications, status: screen.getByRole('status') }
}

describe('Banner', () => {
  it.each<[Notice, string]>([
    [{ kind: 'offline' }, 'Нет связи с GREEN-API. Пробуем подключиться снова.'],
    [{ kind: 'settingsApplying' }, 'Настройки применяются, это занимает до 5 минут.'],
    [
      { kind: 'quota', description: 'quota' },
      'Тариф Developer позволяет общаться только с 3 чатами. Чтобы писать в другие чаты, нужен платный тариф.',
    ],
  ])('shows the text of %o without actions', (notice, text) => {
    const { status } = renderBanner(notice)
    expect(status).toHaveTextContent(text)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each<[Notice, string, string]>([
    [
      { kind: 'webhookUrlSet' },
      'В настройках инстанса указан webhookUrl, поэтому сообщения не приходят.',
      'Очистить и включить',
    ],
    [
      { kind: 'settingsFailed', message: 'Нет связи с GREEN-API.' },
      'Не удалось сохранить настройки: Нет связи с GREEN-API.',
      'Повторить',
    ],
    [{ kind: 'notificationsOff' }, 'Приём сообщений выключен в настройках инстанса.', 'Включить'],
  ])('for %o the button calls enableNotifications()', async (notice, text, button) => {
    const user = userEvent.setup()
    const { status, enableNotifications } = renderBanner(notice)
    expect(status).toHaveTextContent(text)

    await user.click(screen.getByRole('button', { name: button }))
    expect(enableNotifications).toHaveBeenCalledTimes(1)
  })

  it('explains that the instance restarts when notifications are enabled', () => {
    const { status } = renderBanner({ kind: 'notificationsOff' })
    expect(status).toHaveTextContent('Инстанс перезапустится, настройки применяются до 5 минут.')
  })

  it.each<[Notice, string, boolean]>([
    [
      { kind: 'notAuthorized', state: 'starting' },
      'Инстанс запускается, это занимает до 5 минут.',
      false,
    ],
    [
      { kind: 'notAuthorized', state: 'blocked' },
      'Аккаунт MAX заблокирован. Подробности в личном кабинете GREEN-API.',
      true,
    ],
    [
      { kind: 'notAuthorized', state: 'suspended' },
      'Аккаунт MAX временно ограничен: писать можно только тем, кто сохранил ваш номер.',
      false,
    ],
    [
      { kind: 'notAuthorized', state: 'pendingPassword' },
      'MAX запрашивает пароль. Введите его в личном кабинете GREEN-API.',
      true,
    ],
  ])('describes the instance state in %o', (notice, text, hasConsoleLink) => {
    const { status } = renderBanner(notice)
    expect(status).toHaveTextContent(text)
    expect(screen.queryByRole('link', { name: 'Открыть кабинет' }) !== null).toBe(hasConsoleLink)
  })

  it('links to the console when the instance is not authorized', () => {
    const { status } = renderBanner({ kind: 'notAuthorized', state: 'notAuthorized' })
    expect(status).toHaveTextContent(
      'Инстанс не авторизован в MAX. Отсканируйте QR-код в личном кабинете GREEN-API.',
    )
    const link = screen.getByRole('link', { name: 'Открыть кабинет' })
    expect(link).toHaveAttribute('href', 'https://console.green-api.com')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('keeps one live region mounted and only changes its content', () => {
    const view = renderWithProviders(<Banner notice={null} />)
    const status = screen.getByRole('status')
    expect(status).toBeEmptyDOMElement()

    view.rerender(<Banner notice={{ kind: 'offline' }} />)
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Нет связи с GREEN-API. Пробуем подключиться снова.')

    view.rerender(<Banner notice={null} />)
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toBeEmptyDOMElement()
  })
})
