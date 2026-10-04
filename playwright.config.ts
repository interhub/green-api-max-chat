import { defineConfig, devices } from '@playwright/test'
import { API_TOKEN, APP_URL, ID_INSTANCE, MOCK_URL } from './e2e/support.ts'

const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  // One mock server holds the state of every test, so the tests run one by one.
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: APP_URL,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(isCI ? {} : { channel: 'chrome' }) },
    },
  ],
  webServer: [
    {
      command: 'npm run mock',
      url: `${MOCK_URL}/__mock/log`,
      reuseExistingServer: false,
      env: {
        MOCK_PORT: new URL(MOCK_URL).port,
        MOCK_ID_INSTANCE: ID_INSTANCE,
        MOCK_TOKEN: API_TOKEN,
        MOCK_NOTIFICATIONS: 'on',
        MOCK_AUTOREPLY: '0',
        MOCK_QUOTA: '3',
        MOCK_STATE: 'authorized',
        MOCK_RATE_LIMIT: '0',
        MOCK_ECHO_KIND: 'text',
      },
    },
    {
      command: `npm run dev -- --port ${new URL(APP_URL).port} --strictPort`,
      url: APP_URL,
      reuseExistingServer: false,
      env: { VITE_GREEN_API_URL: MOCK_URL },
    },
  ],
})
