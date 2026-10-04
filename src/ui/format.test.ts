import { describe, expect, it } from 'vitest'
import { formatClock, formatDayLabel, formatListTime, getInitials, pickByKey } from './format'

/** Sunday, 4 October 2026, 14:30 local time. */
const NOW = new Date(2026, 9, 4, 14, 30).getTime()
const at = (month: number, day: number, hours = 10, minutes = 0, year = 2026) =>
  new Date(year, month, day, hours, minutes).getTime()

describe('formatListTime', () => {
  it('shows the clock for today', () => {
    expect(formatListTime(at(9, 4, 9, 5), NOW)).toBe('09:05')
  })

  it('shows "Вчера" for yesterday, even right after midnight', () => {
    expect(formatListTime(at(9, 3, 23, 59), NOW)).toBe('Вчера')
    expect(formatListTime(at(9, 3, 0, 1), at(9, 4, 0, 2))).toBe('Вчера')
  })

  it('shows a short weekday within the last week', () => {
    expect(formatListTime(at(9, 1), NOW)).toBe('Чт')
    expect(formatListTime(at(8, 28), NOW)).toBe('Пн')
  })

  it('shows dd.MM.yy for older messages', () => {
    expect(formatListTime(at(8, 27), NOW)).toBe('27.09.26')
    expect(formatListTime(at(11, 31, 23, 50, 2025), NOW)).toBe('31.12.25')
  })
})

describe('formatDayLabel', () => {
  it('names today and yesterday', () => {
    expect(formatDayLabel(at(9, 4, 8), NOW)).toBe('Сегодня')
    expect(formatDayLabel(at(9, 3, 8), NOW)).toBe('Вчера')
  })

  it('uses the genitive month name and adds the year for another year', () => {
    expect(formatDayLabel(at(9, 2), NOW)).toBe('2 октября')
    expect(formatDayLabel(at(4, 9), NOW)).toBe('9 мая')
    expect(formatDayLabel(at(9, 5, 10, 0, 2025), NOW)).toBe('5 октября 2025')
  })
})

describe('formatClock', () => {
  it('pads hours and minutes', () => {
    expect(formatClock(at(9, 4, 7, 3))).toBe('07:03')
  })
})

describe('getInitials', () => {
  it('takes the first letters of up to two words', () => {
    expect(getInitials('Анна Смирнова')).toBe('АС')
    expect(getInitials('мама')).toBe('М')
    expect(getInitials('Команда проекта MAX')).toBe('КП')
  })

  it('returns an empty string for a phone number title', () => {
    expect(getInitials('+7 999 123-45-67')).toBe('')
  })
})

describe('pickByKey', () => {
  it('is stable for the same key', () => {
    const items = ['a', 'b', 'c', 'd'] as const
    expect(pickByKey(items, '10000001')).toBe(pickByKey(items, '10000001'))
    expect(items).toContain(pickByKey(items, '-100200300400'))
  })
})
