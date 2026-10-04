import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { ChatApi, StartChatResult } from '@/types'
import { NewChatDialog } from './NewChatDialog'

function renderDialog(startChat: ChatApi['startChat']) {
  const onClose = vi.fn()
  renderWithProviders(<NewChatDialog open onClose={onClose} />, { chat: { startChat } })
  return { onClose }
}

describe('NewChatDialog', () => {
  it('starts the chat and closes on success', async () => {
    const startChat = vi
      .fn<ChatApi['startChat']>()
      .mockResolvedValue({ ok: true, chatId: '10000001' })
    const user = userEvent.setup()
    const { onClose } = renderDialog(startChat)

    expect(screen.getByRole('dialog', { name: 'Новый чат' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Новый чат' })).toBeInTheDocument()
    const phone = screen.getByLabelText('Номер телефона')
    expect(phone).toHaveFocus()
    expect(phone).toHaveAttribute('type', 'tel')
    expect(phone).toHaveAccessibleDescription('Номера России (+7) и Беларуси (+375)')

    await user.type(phone, '+7 900 123-45-67')
    await user.click(screen.getByRole('button', { name: 'Начать чат' }))

    expect(startChat).toHaveBeenCalledWith('+7 900 123-45-67')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the error of startChat() under the input', async () => {
    const startChat = vi
      .fn<ChatApi['startChat']>()
      .mockResolvedValue({ ok: false, error: 'Этот номер не найден в MAX.' })
    const user = userEvent.setup()
    const { onClose } = renderDialog(startChat)

    await user.type(screen.getByLabelText('Номер телефона'), '79001110000{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Этот номер не найден в MAX.')
    const phone = screen.getByLabelText('Номер телефона')
    expect(phone).toHaveAttribute('aria-invalid', 'true')
    expect(phone).toHaveAccessibleDescription(
      'Этот номер не найден в MAX. Номера России (+7) и Беларуси (+375)',
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a busy button while the number is checked', async () => {
    const startChat = vi.fn<ChatApi['startChat']>(
      () => new Promise<StartChatResult>(() => undefined),
    )
    const user = userEvent.setup()
    renderDialog(startChat)

    await user.type(screen.getByLabelText('Номер телефона'), '79001234567')
    await user.click(screen.getByRole('button', { name: 'Начать чат' }))

    const submit = screen.getByRole('button', { name: 'Начать чат' })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAttribute('aria-busy', 'true')
  })

  it('closes on a click on the backdrop, not after a text selection that ends there', () => {
    const { onClose } = renderDialog(vi.fn<ChatApi['startChat']>())
    const dialog = screen.getByRole('dialog', { name: 'Новый чат' })

    fireEvent.pointerDown(screen.getByLabelText('Номер телефона'))
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(dialog)
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on "Отмена"', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDialog(vi.fn<ChatApi['startChat']>())

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
