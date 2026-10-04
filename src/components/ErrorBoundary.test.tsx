import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('render failed')
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the children while nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>Чаты</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('Чаты')).toBeInTheDocument()
  })

  it('replaces a crashed tree with a message and a reload button', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const onReload = vi.fn()
    const user = userEvent.setup()
    render(
      <ErrorBoundary onReload={onReload}>
        <Broken />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Что-то пошло не так')
    await user.click(screen.getByRole('button', { name: 'Обновить страницу' }))
    expect(onReload).toHaveBeenCalledTimes(1)
  })
})
