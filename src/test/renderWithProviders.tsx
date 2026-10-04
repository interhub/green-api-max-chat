import { render } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { ChatContext, SessionContext } from '@/state/contexts'
import { ThemeProvider } from '@/theme'
import type { ChatApi, SessionApi } from '@/types'
import { createChatApi, createSessionApi } from './fakes'

/** Renders UI under fake session and chat contexts (kept on rerender) and returns the fakes. */
export function renderWithProviders(
  ui: ReactElement,
  options: { chat?: Partial<ChatApi>; session?: Partial<SessionApi> } = {},
) {
  const chatApi = createChatApi(options.chat)
  const sessionApi = createSessionApi(options.session)
  function Providers({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <SessionContext.Provider value={sessionApi}>
          <ChatContext.Provider value={chatApi}>{children}</ChatContext.Provider>
        </SessionContext.Provider>
      </ThemeProvider>
    )
  }
  const view = render(ui, { wrapper: Providers })
  return { ...view, chatApi, sessionApi }
}
