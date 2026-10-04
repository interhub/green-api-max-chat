import { createContext, useContext } from 'react'
import type { Theme } from './theme'

export interface ThemeApi {
  theme: Theme
  toggleTheme(): void
}

export const ThemeContext = createContext<ThemeApi | null>(null)

export function useTheme(): ThemeApi {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>')
  return value
}
