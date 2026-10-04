import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { linkify } from './linkify'

function renderText(text: string) {
  return render(<p data-testid="text">{linkify(text)}</p>)
}

describe('linkify', () => {
  it('turns http and https addresses into safe links', () => {
    renderText('Смотри https://example.com/a?b=1 и http://example.org')
    const first = screen.getByRole('link', { name: 'https://example.com/a?b=1' })
    expect(first).toHaveAttribute('href', 'https://example.com/a?b=1')
    expect(first).toHaveAttribute('target', '_blank')
    expect(first).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'http://example.org' })).toBeInTheDocument()
    expect(screen.getByTestId('text')).toHaveTextContent(
      'Смотри https://example.com/a?b=1 и http://example.org',
    )
  })

  it('leaves sentence punctuation and a closing bracket outside the link', () => {
    renderText('Ссылка (см. https://example.com/docs). Готово, https://example.com/x!')
    expect(screen.getByRole('link', { name: 'https://example.com/docs' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://example.com/x' })).toBeInTheDocument()
  })

  it('keeps balanced brackets that belong to the address', () => {
    renderText('https://ru.wikipedia.org/wiki/Чат_(программа)')
    expect(screen.getByRole('link')).toHaveTextContent(
      'https://ru.wikipedia.org/wiki/Чат_(программа)',
    )
  })

  it('never links other protocols and never renders markup from the text', () => {
    const { container } = renderText(
      'javascript:alert(1) <img src=x onerror=alert(1)> <b>жирный</b>',
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(screen.getByTestId('text')).toHaveTextContent(
      '<img src=x onerror=alert(1)> <b>жирный</b>',
    )
  })

  it('returns the plain text when there is no link', () => {
    expect(linkify('Просто текст')).toEqual(['Просто текст'])
  })
})
