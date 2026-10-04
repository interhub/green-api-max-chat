import type { ReactNode } from 'react'

const URL_PATTERN = /https?:\/\/[^\s<>"'«»]+/gi
const TRAILING_PUNCTUATION = /[.,!?;:…]$/

function count(text: string, char: string): number {
  return text.split(char).length - 1
}

/** Drops sentence punctuation glued to the end of a link, keeps a ")" that closes a "(" inside it. */
function trimUrl(raw: string): string {
  let url = raw
  for (;;) {
    if (TRAILING_PUNCTUATION.test(url)) {
      url = url.slice(0, -1)
    } else if (url.endsWith(')') && count(url, ')') > count(url, '(')) {
      url = url.slice(0, -1)
    } else {
      return url
    }
  }
}

function toSafeHref(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

/**
 * Splits plain text into strings and <a> elements for http(s) links. React escapes the strings,
 * so message text can never inject markup.
 */
export function linkify(text: string, linkClassName?: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0])
    const href = toSafeHref(url)
    if (!href) continue
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    nodes.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {url}
      </a>,
    )
    cursor = match.index + url.length
  }
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}
