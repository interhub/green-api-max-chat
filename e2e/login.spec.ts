import { expect, test } from '@playwright/test'
import { TEXT, login, loginToChats, mock, ui } from './support.ts'

test.beforeEach(async ({ request }) => {
  await mock.reset(request)
})

test('wrong credentials show the error and keep the login screen', async ({ page, request }) => {
  await login(page, 'wrong-token')
  await expect(page.getByText(TEXT.wrongCredentials)).toBeVisible()
  await expect(ui(page).idInstance).toBeVisible()
  const log = await mock.log(request)
  expect(log.requests).toContainEqual(
    expect.objectContaining({ method: 'getStateInstance', status: 401 }),
  )
})

test('notifications are enabled from the banner and the banner goes away once applied', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await mock.reset(request, {
    notifications: 'off',
    settings: { stateWebhook: 'yes' },
    applyMs: 5000,
  })
  const view = ui(page)
  await loginToChats(page)
  await expect(view.banner(TEXT.notificationsOff).first()).toBeVisible()
  await view.button('Включить').first().click()
  await expect.poll(async () => (await mock.log(request)).stateInstance).toBe('starting')
  await expect.poll(async () => (await mock.log(request)).queue).toEqual([])
  await expect(view.banner(TEXT.settingsApplying).first()).toBeVisible()
  await expect(view.banner(TEXT.notAuthorized)).toHaveCount(0)
  await expect(view.banner(TEXT.settingsApplying)).toHaveCount(0, { timeout: 60_000 })
  await expect(view.banner(TEXT.notificationsOff)).toHaveCount(0)
  await expect(view.banner(TEXT.notAuthorized)).toHaveCount(0)
  const log = await mock.log(request)
  expect(log.stateInstance).toBe('authorized')
  const setSettings = log.requests.find((entry) => entry.method === 'setSettings')
  expect(setSettings?.body).toEqual({
    webhookUrl: '',
    incomingWebhook: 'yes',
    outgoingWebhook: 'yes',
    outgoingMessageWebhook: 'yes',
    outgoingAPIMessageWebhook: 'yes',
    stateWebhook: 'yes',
  })
})

test('logout shows the login screen and the session is gone after a reload', async ({ page }) => {
  const view = ui(page)
  await loginToChats(page)
  await view.logout.click()
  await expect(view.idInstance).toBeVisible()
  await page.reload()
  await expect(view.idInstance).toBeVisible()
  await expect(view.newChat).toBeHidden()
})

test('a session rejected by the API returns to the login screen with a reason', async ({
  page,
  request,
}) => {
  const view = ui(page)
  await loginToChats(page)
  await mock.fail(request, 'receiveNotification', 401)
  await expect(view.idInstance).toBeVisible()
  await expect(page.getByText(TEXT.sessionEnded)).toBeVisible()
})
