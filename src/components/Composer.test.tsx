import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { ChatApi } from '@/types'
import { Composer } from './Composer'

function renderComposer() {
  const sendMessage = vi.fn<ChatApi['sendMessage']>().mockResolvedValue(undefined)
  renderWithProviders(<Composer chatId="10000001" />, { chat: { sendMessage } })
  return { sendMessage, field: screen.getByRole('textbox', { name: 'Сообщение' }) }
}

describe('Composer', () => {
  it('sends on Enter, clears the field and keeps the focus', async () => {
    const user = userEvent.setup()
    const { sendMessage, field } = renderComposer()

    await user.type(field, 'Привет{Enter}')

    expect(sendMessage).toHaveBeenCalledWith('10000001', 'Привет')
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('inserts a newline on Shift+Enter', async () => {
    const user = userEvent.setup()
    const { sendMessage, field } = renderComposer()

    await user.type(field, 'Первая{Shift>}{Enter}{/Shift}вторая')

    expect(field).toHaveValue('Первая\nвторая')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('does not send while an IME composition is confirmed with Enter', () => {
    const { sendMessage, field } = renderComposer()
    fireEvent.change(field, { target: { value: 'konnichiwa' } })

    fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 })

    expect(sendMessage).not.toHaveBeenCalled()
    expect(field).toHaveValue('konnichiwa')
  })

  it('enables the send button only for non-blank text and sends on click', async () => {
    const user = userEvent.setup()
    const { sendMessage, field } = renderComposer()
    const send = screen.getByRole('button', { name: 'Отправить' })
    expect(send).toBeDisabled()

    await user.type(field, '   ')
    expect(send).toBeDisabled()
    await user.keyboard('{Enter}')
    expect(sendMessage).not.toHaveBeenCalled()

    await user.type(field, 'текст')
    expect(send).toBeEnabled()
    await user.click(send)
    expect(sendMessage).toHaveBeenCalledWith('10000001', '   текст')
    expect(field).toHaveValue('')
  })

  it('limits the text to 4000 characters and shows the counter from 3500', () => {
    const { field } = renderComposer()
    expect(field).toHaveAttribute('maxLength', '4000')

    fireEvent.change(field, { target: { value: 'а'.repeat(3499) } })
    expect(screen.queryByText(/\/ 4000/)).not.toBeInTheDocument()

    fireEvent.change(field, { target: { value: 'а'.repeat(3500) } })
    expect(screen.getByText('3500 / 4000')).toBeInTheDocument()
  })
})
