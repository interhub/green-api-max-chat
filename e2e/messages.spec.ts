import { expect, test } from '@playwright/test'
import { PHONE_A, TEXT, loginToChats, mock, sendText, startChat, ui } from './support.ts'

test.beforeEach(async ({ request }) => {
  await mock.reset(request)
})

test('a sent message appears at once and its ticks go from sending to read', async ({
  page,
  request,
}) => {
  await mock.reset(request, { deliveredMs: 2500, readMs: 4500 })
  const view = ui(page)
  await loginToChats(page)
  await startChat(page, PHONE_A.input, PHONE_A.title)
  await page.route('**/sendMessage/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    await route.continue()
  })
  await sendText(page, 'Привет!')
  await expect(view.message('Привет!')).toBeVisible()
  await expect(view.tick('Отправляется')).toBeVisible()
  await expect(view.tick('Отправлено')).toBeVisible()
  await expect(view.tick('Доставлено')).toBeVisible()
  await expect(view.tick('Прочитано')).toBeVisible()
  const chatId = await mock.chatIdFor(request, PHONE_A.digits)
  const log = await mock.log(request)
  expect(log.sent).toEqual([expect.objectContaining({ chatId, message: 'Привет!' })])
})

test('Enter sends the message and Shift+Enter inserts a new line', async ({ page, request }) => {
  const view = ui(page)
  await loginToChats(page)
  await startChat(page, PHONE_A.input, PHONE_A.title)
  await view.composer.click()
  await page.keyboard.type('Первая строка')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('Вторая строка')
  await expect(view.composer).toHaveValue('Первая строка\nВторая строка')
  await page.keyboard.press('Enter')
  await expect(view.composer).toHaveValue('')
  await expect(view.message('Вторая строка')).toBeVisible()
  await expect
    .poll(async () => (await mock.log(request)).sent.map((entry) => entry.message))
    .toEqual(['Первая строка\nВторая строка'])
})

test('the first echo renames the chat to the contact and the history survives a reload', async ({
  page,
  request,
}) => {
  const view = ui(page)
  await loginToChats(page)
  await startChat(page, PHONE_A.input, PHONE_A.title)
  await expect(view.chat(PHONE_A.title)).toBeVisible()
  const name = await mock.contactName(request, await mock.chatIdFor(request, PHONE_A.digits))
  await sendText(page, 'Сообщение до перезагрузки')
  await expect(view.heading(name)).toBeVisible()
  await expect(view.chat(name)).toBeVisible()
  await expect(view.chat(PHONE_A.title)).toHaveCount(0)
  await expect(view.tick('Прочитано')).toBeVisible()
  await page.reload()
  await expect(view.newChat).toBeVisible()
  await view.chat(name).click()
  await expect(view.message('Сообщение до перезагрузки')).toBeVisible()
})

test('polling errors show the offline banner until the connection recovers', async ({
  page,
  request,
}) => {
  const view = ui(page)
  await loginToChats(page)
  await mock.fail(request, 'receiveNotification', 500, 3)
  await expect(view.banner(TEXT.offline).first()).toBeVisible()
  await mock.incoming(request, {
    chatId: '20000001',
    text: 'Связь восстановлена',
    senderName: 'Собеседник',
  })
  await expect(view.banner(TEXT.offline)).toHaveCount(0, { timeout: 30_000 })
  await expect(view.chat('Собеседник')).toBeVisible()
})
