import '@fontsource-variable/roboto'
import '@/index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/theme'
import { createPreviewData } from './fixtures'
import { PreviewApp } from './PreviewApp'

/*
 * Dev-only page (preview.html, not part of the build): real components on fake contexts.
 * Query: ?scene=login|login-message|chats|chat|group|failed|new|empty|banner-<notice kind>
 *        &theme=dark|light &chat=<chat id>
 */
const params = new URLSearchParams(window.location.search)
const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element in preview.html')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <PreviewApp
        scene={params.get('scene') ?? 'chats'}
        chatId={params.get('chat')}
        data={createPreviewData(Date.now())}
      />
    </ThemeProvider>
  </StrictMode>,
)
