import { expect, test } from '@playwright/test'
import {
  PHONE_A,
  PHONE_B,
  PHONE_INVALID,
  PHONE_WITHOUT_MAX,
  TEXT,
  loginToChats,
  mock,
  openNewChat,
  sendText,
  startChat,
  ui,
} from './support.ts'

test.beforeEach(async ({ request }) => {
  await mock.reset(request)
})

test('a new chat by phone number gets the formatted title', async ({ page, request }) => {
  await loginToChats(page)
  await startChat(page, PHONE_A.input, PHONE_A.title)
  await expect(ui(page).chat(PHONE_A.title)).toBeVisible()
  const log = await mock.log(request)
  const checks = log.requests.filter((entry) => entry.method === 'checkAccount')
  expect(checks.map((entry) => entry.body)).toEqual([{ phoneNumber: Number(PHONE_A.digits) }])
})

test('a number without a MAX account shows an error in the dialog', async ({ page }) => {
  const view = ui(page)
  await loginToChats(page)
  await openNewChat(page, PHONE_WITHOUT_MAX)
  await expect(view.dialogError).toContainText(TEXT.numberNotFound)
  await expect(view.dialog).toBeVisible()
})

test('an invalid number is rejected without an API call', async ({ page, request }) => {
  const view = ui(page)
  await loginToChats(page)
  await openNewChat(page, PHONE_INVALID)
  await expect(view.dialogError).toContainText(TEXT.invalidPhone)
  const log = await mock.log(request)
  expect(log.requests.filter((entry) => entry.method === 'checkAccount')).toHaveLength(0)
})

test('an incoming message raises the unread badge and the title counter until opened', async ({
  page,
  request,
}) => {
  const view = ui(page)
  await loginToChats(page)
  await startChat(page, PHONE_A.input, PHONE_A.title)
  await startChat(page, PHONE_B.input, PHONE_B.title)
  const chatA = await mock.chatIdFor(request, PHONE_A.digits)
  const nameA = await mock.contactName(request, chatA)
  await mock.incoming(request, { chatId: chatA, text: 'Привет из MAX' })
  await expect(view.unread(1)).toBeVisible()
  await expect(page).toHaveTitle(`(1) ${TEXT.appTitle}`)
  await view.chat(nameA).click()
  await expect(view.message('Привет из MAX')).toBeVisible()
  await expect(view.unread(1)).toHaveCount(0)
  await expect(page).toHaveTitle(TEXT.appTitle)
  await mock.incoming(request, { chatId: chatA, text: 'Ответ в открытый чат' })
  await expect(view.message('Ответ в открытый чат')).toBeVisible()
  await expect(view.unread(1)).toHaveCount(0)
})

test('a message to a fourth chat fails and the quota banner appears', async ({ page, request }) => {
  const view = ui(page)
  await loginToChats(page)
  for (const index of [1, 2, 3]) {
    await mock.incoming(request, {
      chatId: `2000000${index}`,
      text: `Сообщение ${index}`,
      senderName: `Собеседник ${index}`,
    })
  }
  await expect(view.chat('Собеседник 3')).toBeVisible()
  await startChat(page, PHONE_A.input, PHONE_A.title)
  await sendText(page, 'Сообщение в четвёртый чат')
  await expect(view.tick('Не отправлено')).toBeVisible()
  await expect(view.retry).toBeVisible()
  await expect(view.banner(TEXT.quota).first()).toBeVisible()
})
