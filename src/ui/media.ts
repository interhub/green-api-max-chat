/** Same breakpoint as web.max.ru: below it only one pane (list or conversation) is shown. */
const DESKTOP_QUERY = '(min-width: 926px)'

function matches(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

export function isDesktop(): boolean {
  return matches(DESKTOP_QUERY)
}

export function prefersReducedMotion(): boolean {
  return matches('(prefers-reduced-motion: reduce)')
}
