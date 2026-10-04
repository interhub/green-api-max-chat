import { expect, test } from '@playwright/test'
import { PHONE_A, loginToChats, mock, startChat, ui } from './support.ts'

test.beforeEach(async ({ request }) => {
  await mock.reset(request)
})

test.describe('theme', () => {
  test.use({ colorScheme: 'light' })

  test('the chosen theme survives a reload', async ({ page }) => {
    const root = page.locator('html')
    await loginToChats(page)
    await expect(root).toHaveAttribute('data-theme', 'light')
    await ui(page).themeToggle.click()
    await expect(root).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(root).toHaveAttribute('data-theme', 'dark')
  })
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the list and the conversation take turns on a phone screen', async ({ page }) => {
    const view = ui(page)
    await loginToChats(page)
    await startChat(page, PHONE_A.input, PHONE_A.title)
    await expect(view.chatList).toBeHidden()
    await view.back.click()
    await expect(view.chatList).toBeVisible()
    await expect(view.heading(PHONE_A.title)).toBeHidden()
    await view.chat(PHONE_A.title).click()
    await expect(view.heading(PHONE_A.title)).toBeVisible()
  })
})
