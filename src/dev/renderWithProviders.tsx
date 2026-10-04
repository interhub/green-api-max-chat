import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ChatContext, SessionContext } from '@/state/contexts'
import { ThemeProvider } from '@/theme'
import type { ChatApi, SessionApi } from '@/types'
import { createChatApi, createSessionApi } from './fakes'

/** Test helper: renders UI under fake session and chat contexts and returns the fakes. */
export function renderWithProviders(
  ui: ReactElement,
  options: { chat?: Partial<ChatApi>; session?: Partial<SessionApi> } = {},
) {
  const chatApi = createChatApi(options.chat)
  const sessionApi = createSessionApi(options.session)
  const view = render(
    <ThemeProvider>
      <SessionContext.Provider value={sessionApi}>
        <ChatContext.Provider value={chatApi}>{ui}</ChatContext.Provider>
      </SessionContext.Provider>
    </ThemeProvider>,
  )
  return { ...view, chatApi, sessionApi }
}
