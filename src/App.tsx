import { ChatApp } from '@/components/ChatApp'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginScreen } from '@/components/LoginScreen'
import { ChatProvider, SessionProvider, useSession } from '@/state'
import { ThemeProvider } from '@/theme'

function Root() {
  const { session } = useSession()
  if (!session) return <LoginScreen />
  return (
    <ChatProvider key={`${session.apiUrl}|${session.idInstance}`}>
      <ChatApp />
    </ChatProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <SessionProvider>
          <Root />
        </SessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
