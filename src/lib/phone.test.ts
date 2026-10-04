import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone } from './phone'

describe('normalizePhone', () => {
  it.each([
    ['+7 (900) 123-45-67', '79001234567'],
    ['8 900 123 45 67', '79001234567'],
    ['900 123-45-67', '79001234567'],
    ['79001234567', '79001234567'],
    ['+375 (29) 123-45-67', '375291234567'],
    ['8 029 123-45-67', '375291234567'],
    ['8 (044) 765-43-21', '375447654321'],
    ['80171234567', '375171234567'],
    ['8 800 555-35-35', '78005553535'],
  ])('accepts %s', (input, digits) => {
    expect(normalizePhone(input)).toEqual({ ok: true, digits })
  })

  it.each([
    '',
    'номер',
    '12345',
    '+1 202 555 0100',
    '+44 20 7946 0958',
    '+380 44 123 45 67',
    '8 800 555 35 3',
    '375 29 123 45 6',
  ])('rejects %j', (input) => {
    expect(normalizePhone(input)).toEqual({
      ok: false,
      error: 'Введите номер России (+7) или Беларуси (+375).',
    })
  })
})

describe('formatPhone', () => {
  it('formats Russian, Belarusian and other numbers', () => {
    expect(formatPhone('79001234567')).toBe('+7 900 123-45-67')
    expect(formatPhone('375291234567')).toBe('+375 29 123-45-67')
    expect(formatPhone('12025550100')).toBe('+12025550100')
  })
})
