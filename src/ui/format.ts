const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]
const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const DAY_MS = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** False for NaN and for values outside the Date range, which make toISOString() throw. */
export function isValidTimestamp(timestamp: number): boolean {
  return !Number.isNaN(new Date(timestamp).getTime())
}

export function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** Calendar days from `from` to `to` in local time; rounding keeps it right across DST changes. */
function daysBetween(from: number, to: number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS)
}

export function isSameDay(a: number, b: number): boolean {
  return daysBetween(a, b) === 0
}

export function formatClock(timestamp: number): string {
  const date = new Date(timestamp)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Chat list time: "14:05" today, "Вчера", a short weekday within a week, "05.10.25" otherwise. */
export function formatListTime(timestamp: number, now: number): string {
  const days = daysBetween(timestamp, now)
  if (days === 0) return formatClock(timestamp)
  if (days === 1) return 'Вчера'
  const date = new Date(timestamp)
  if (days > 1 && days < 7) return WEEKDAYS_SHORT[date.getDay()] ?? ''
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${pad(date.getFullYear() % 100)}`
}

/** Date separator: "Сегодня", "Вчера", "5 октября", "5 октября 2025" for another year. */
export function formatDayLabel(timestamp: number, now: number): string {
  const days = daysBetween(timestamp, now)
  if (days === 0) return 'Сегодня'
  if (days === 1) return 'Вчера'
  const date = new Date(timestamp)
  const label = `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()] ?? ''}`
  return date.getFullYear() === new Date(now).getFullYear()
    ? label
    : `${label} ${date.getFullYear()}`
}

/** Up to two initials from the words that start with a letter; "" for a title without letters. */
export function getInitials(title: string): string {
  return title
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase()
}

/** Stable small hash: the same chat always gets the same avatar color. */
function hashString(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

export function pickByKey<T>(items: readonly [T, ...T[]], key: string): T {
  return items[hashString(key) % items.length] ?? items[0]
}
