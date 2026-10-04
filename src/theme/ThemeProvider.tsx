import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type ThemeApi } from './context'
import {
  applyTheme,
  getInitialTheme,
  readStoredTheme,
  storeTheme,
  watchSystemTheme,
  type Theme,
} from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [followsSystem, setFollowsSystem] = useState(() => readStoredTheme() === null)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!followsSystem) return undefined
    return watchSystemTheme(setTheme)
  }, [followsSystem])

  const value = useMemo<ThemeApi>(
    () => ({
      theme,
      toggleTheme() {
        const next: Theme = theme === 'dark' ? 'light' : 'dark'
        storeTheme(next)
        setFollowsSystem(false)
        setTheme(next)
      },
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
