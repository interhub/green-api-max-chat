import type { ReactNode } from 'react'

const CONSOLE_URL = 'https://console.green-api.com'

/** Link to the GREEN-API console, opened in a new tab. */
export function ConsoleLink({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <a href={CONSOLE_URL} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  )
}
