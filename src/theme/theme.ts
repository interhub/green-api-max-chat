export type Theme = 'dark' | 'light'

/** Same key and values as the pre-paint script in index.html. */
export const THEME_STORAGE_KEY = 'max-chat:theme'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

const BROWSER_BAR_COLORS: Record<Theme, string> = {
  dark: '#17181c',
  light: '#ffffff',
}

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage is blocked (private mode): the choice still applies until the page is reloaded.
  }
}

export function getSystemTheme(): Theme {
  if (typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia(LIGHT_QUERY).matches ? 'light' : 'dark'
}

export function watchSystemTheme(onChange: (theme: Theme) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(LIGHT_QUERY)
  const listener = () => onChange(query.matches ? 'light' : 'dark')
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** The pre-paint script has already put the theme on <html>; fall back to storage and the OS setting. */
export function getInitialTheme(): Theme {
  const current = document.documentElement.dataset.theme
  if (isTheme(current)) return current
  return readStoredTheme() ?? getSystemTheme()
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', BROWSER_BAR_COLORS[theme])
}
