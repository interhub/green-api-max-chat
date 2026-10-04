import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const MOCK_URL = `http://localhost:${process.env.E2E_MOCK_PORT ?? '8788'}`
export const APP_URL = `http://localhost:${process.env.E2E_APP_PORT ?? '5199'}`
export const ID_INSTANCE = '3100000001'
export const API_TOKEN = 'mock-token'

export const PHONE_A = {
  input: '+7 900 123-45-67',
  digits: '79001234567',
  title: '+7 900 123-45-67',
}
export const PHONE_B = {
  input: '8 (900) 765-43-21',
  digits: '79007654321',
  title: '+7 900 765-43-21',
}
export const PHONE_WITHOUT_MAX = '+7 900 123-00-00'
export const PHONE_INVALID = '12345'

export const TEXT = {
  appTitle: 'Чат для MAX',
  wrongCredentials: 'Неверный idInstance или apiTokenInstance.',
  sessionEnded: 'Сессия завершена: проверьте idInstance и apiTokenInstance.',
  numberNotFound: 'Этот номер не найден в MAX.',
  invalidPhone: 'Введите номер России (+7) или Беларуси (+375).',
  notificationsOff: 'Приём сообщений выключен в настройках инстанса.',
  settingsApplying: 'Настройки применяются, это занимает до 5 минут.',
  notAuthorized: 'Инстанс не авторизован в MAX.',
  offline: 'Нет связи с GREEN-API. Пробуем подключиться снова.',
  quota: 'Чтобы писать в другие чаты, нужен платный тариф.',
}

export type TickLabel = 'Отправляется' | 'Отправлено' | 'Доставлено' | 'Прочитано' | 'Не отправлено'

export interface MockOptions {
  notifications?: 'on' | 'off'
  stateInstance?: string
  autoReply?: boolean
  quota?: number
  rateLimit?: boolean
  echoKind?: 'text' | 'extended'
  settings?: Record<string, string | number>
  applyMs?: number
  echoMs?: number
  deliveredMs?: number
  readMs?: number
  autoReplyMs?: number
}

export interface IncomingMessage {
  chatId: string
  text: string
  senderName?: string
  phone?: string
  kind?: 'text' | 'image' | 'extended'
}

export interface MockRequest {
  at: string
  method: string | null
  httpMethod: string
  status: number
  query: Record<string, string>
  body?: unknown
}

export interface MockContact {
  name: string
  phone: string
  chatName: string
}

export interface MockLog {
  stateInstance: string
  settings: Record<string, unknown>
  chats: string[]
  contacts: Record<string, MockContact>
  queue: { receiptId: number; body: Record<string, unknown> }[]
  requests: MockRequest[]
  sent: { idMessage: string; chatId: string; message: string; timestamp: number }[]
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function control(request: APIRequestContext, route: string, data: object): Promise<void> {
  const response = await request.post(`${MOCK_URL}/__mock/${route}`, { data })
  expect(response.ok(), `${route}: ${await response.text()}`).toBe(true)
}

export const mock = {
  reset: (request: APIRequestContext, options: MockOptions = {}) =>
    control(request, 'reset', options),
  incoming: (request: APIRequestContext, message: IncomingMessage) =>
    control(request, 'incoming', message),
  fail: (request: APIRequestContext, method: string, status: number, count = 1) =>
    control(request, 'fail', { method, status, count }),
  async log(request: APIRequestContext): Promise<MockLog> {
    const response = await request.get(`${MOCK_URL}/__mock/log`)
    return response.json()
  },
  async chatIdFor(request: APIRequestContext, digits: string): Promise<string> {
    const response = await request.post(
      `${MOCK_URL}/waInstance${ID_INSTANCE}/checkAccount/${API_TOKEN}`,
      { data: { phoneNumber: Number(digits) } },
    )
    const answer: { exist: boolean; chatId: string } = await response.json()
    expect(answer.exist).toBe(true)
    return answer.chatId
  },
  async contactName(request: APIRequestContext, chatId: string): Promise<string> {
    const name = (await mock.log(request)).contacts[chatId]?.name ?? ''
    expect(name, `contact name of chat ${chatId}`).not.toBe('')
    return name
  },
}

export function ui(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Новый чат' })
  const chatList = page.getByRole('list', { name: 'Список чатов' })
  const messages = page.getByRole('log', { name: 'Сообщения' })
  return {
    idInstance: page.getByLabel('idInstance', { exact: true }),
    apiToken: page.getByLabel('apiTokenInstance', { exact: true }),
    loginButton: page.getByRole('button', { name: 'Войти', exact: true }),
    newChat: page.getByRole('button', { name: 'Новый чат', exact: true }).first(),
    chatList,
    chat: (title: string) =>
      chatList.getByRole('button', { name: new RegExp(`^${escapeRegExp(title)}`) }),
    unread: (count: number) => chatList.getByLabel(`Непрочитанных: ${count}`, { exact: true }),
    themeToggle: page.getByRole('button', { name: 'Сменить тему' }).first(),
    logout: page.getByRole('button', { name: 'Выйти' }).first(),
    back: page.getByRole('button', { name: 'Назад к чатам' }),
    dialog,
    phone: dialog.getByLabel('Номер телефона'),
    startChat: dialog.getByRole('button', { name: 'Начать чат' }),
    dialogError: dialog.getByRole('alert'),
    heading: (title: string) => page.getByRole('heading', { level: 2, name: title, exact: true }),
    messages,
    message: (text: string) => messages.getByText(text),
    composer: page.getByRole('textbox', { name: 'Сообщение', exact: true }),
    send: page.getByRole('button', { name: 'Отправить', exact: true }),
    retry: messages.getByRole('button', { name: 'Повторить' }),
    tick: (label: TickLabel) => messages.getByRole('img', { name: label, exact: true }),
    banner: (text: string) => page.getByRole('status').filter({ hasText: text }),
    button: (name: string) => page.getByRole('button', { name, exact: true }),
  }
}

export async function login(page: Page, token = API_TOKEN): Promise<void> {
  const view = ui(page)
  await page.goto('/')
  await view.idInstance.fill(ID_INSTANCE)
  await view.apiToken.fill(token)
  await view.loginButton.click()
}

export async function loginToChats(page: Page): Promise<void> {
  await login(page)
  await expect(ui(page).newChat).toBeVisible()
}

export async function openNewChat(page: Page, phone: string): Promise<void> {
  const view = ui(page)
  await view.newChat.click()
  await expect(view.dialog).toBeVisible()
  await view.phone.fill(phone)
  await view.startChat.click()
}

export async function startChat(page: Page, phone: string, title: string): Promise<void> {
  const view = ui(page)
  await openNewChat(page, phone)
  await expect(view.dialog).toBeHidden()
  await expect(view.heading(title)).toBeVisible()
}

export async function sendText(page: Page, text: string): Promise<void> {
  const view = ui(page)
  await view.composer.fill(text)
  await view.send.click()
}
