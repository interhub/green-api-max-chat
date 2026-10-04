import type { Credentials, GreenApiClient, GreenApiErrorCode, InstanceSettings } from '@/types'
import { GreenApiError, isGreenApiError } from './errors'
import { isRecord, parseJson, readId, readText, toInstanceState, type JsonObject } from './parse'

const REQUEST_TIMEOUT_MS = 15_000
const ERROR_DETAIL_MAX_LENGTH = 200

const SETTINGS_FLAGS = [
  'incomingWebhook',
  'outgoingWebhook',
  'outgoingMessageWebhook',
  'outgoingAPIMessageWebhook',
  'stateWebhook',
] as const satisfies ReadonlyArray<keyof InstanceSettings>

/** English reasons of GREEN-API in words for the user. The first match wins. */
const INSTANCE_REASONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/expired/i, 'срок тарифа истёк'],
  [/deleted/i, 'инстанс удалён'],
  [/starting or not authorized/i, 'инстанс запускается или не авторизован'],
  [/starting/i, 'инстанс запускается'],
  [/not authorized/i, 'инстанс не авторизован'],
  [/suspended/i, 'аккаунт MAX временно ограничен'],
]

const MESSAGES = {
  // GREEN-API answers 401 for a wrong token and also for a wrong idInstance on a host that exists.
  auth: 'Неверный idInstance или apiTokenInstance.',
  forbidden: 'Неверный idInstance или адрес API.',
  wrongHost: 'Этот адрес API не обслуживает указанный idInstance.',
  webhookUrlSet: 'В настройках инстанса указан webhookUrl, поэтому сообщения не приходят.',
  rateLimit: 'Слишком много запросов. Подождите секунду.',
  chatQuota: 'Тариф Developer позволяет общаться только с 3 чатами.',
  checkQuota: 'Исчерпан месячный лимит проверки номеров на тарифе Developer.',
  checkThrottled: 'MAX временно ограничил проверку номеров. Подождите около 2 часов.',
  server: 'Сервис GREEN-API временно недоступен.',
  network: 'Нет связи с GREEN-API.',
  timeout: 'GREEN-API не ответил вовремя.',
  settingsRejected: 'GREEN-API не принял новые настройки.',
} as const

interface RequestOptions {
  httpMethod?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  receiptId?: number
  query?: Record<string, string>
  timeoutMs?: number
  signal?: AbortSignal
}

interface ApiAnswer {
  httpStatus: number
  /** Parsed JSON, null for an empty body. */
  data: unknown
}

export function createClient(credentials: Credentials): GreenApiClient {
  const call = (method: string, options: RequestOptions = {}) =>
    request(credentials, method, options)

  return {
    credentials,

    async getStateInstance(signal) {
      const { data } = await call('getStateInstance', { signal })
      return toInstanceState(isRecord(data) ? data.stateInstance : undefined)
    },

    async getSettings(signal) {
      const { httpStatus, data } = await call('getSettings', { signal })
      if (!isRecord(data)) throw unexpectedAnswer(httpStatus)
      return pickSettings(data)
    },

    async setSettings(settings, signal) {
      const { httpStatus, data } = await call('setSettings', {
        httpMethod: 'POST',
        body: settings,
        signal,
      })
      const saved = isRecord(data) ? data.saveSettings : undefined
      if (saved === false) {
        throw new GreenApiError('validation', MESSAGES.settingsRejected, httpStatus)
      }
      if (saved !== true) throw unexpectedAnswer(httpStatus)
    },

    async checkAccount(phoneNumber, signal) {
      const { httpStatus, data } = await call('checkAccount', {
        httpMethod: 'POST',
        body: { phoneNumber },
        signal,
      })
      if (!isRecord(data)) throw unexpectedAnswer(httpStatus)
      if (data.status === false) throw checkRefused(readText(data.reason), httpStatus)
      const exists = data.exist
      const chatId = readId(data.chatId)
      if (typeof exists !== 'boolean' || (exists && !chatId)) throw unexpectedAnswer(httpStatus)
      return { exists, chatId: exists ? chatId : '' }
    },

    async sendMessage(chatId, message, signal) {
      const { httpStatus, data } = await call('sendMessage', {
        httpMethod: 'POST',
        body: { chatId, message },
        signal,
      })
      const idMessage = readId(isRecord(data) ? data.idMessage : undefined)
      if (!idMessage) throw unexpectedAnswer(httpStatus)
      return { idMessage }
    },

    async receiveNotification(receiveTimeout, signal) {
      const { data } = await call('receiveNotification', {
        query: { receiveTimeout: String(receiveTimeout) },
        timeoutMs: receiveTimeout * 1000 + REQUEST_TIMEOUT_MS,
        signal,
      })
      if (!isRecord(data)) return null
      const receiptId = readReceiptId(data.receiptId)
      return receiptId === null ? null : { receiptId, body: data.body }
    },

    async deleteNotification(receiptId, signal) {
      try {
        await call('deleteNotification', { httpMethod: 'DELETE', receiptId, signal })
      } catch (error) {
        // GREEN-API answers 500 when the notification is already gone.
        if (!isGreenApiError(error) || error.status !== 500) throw error
      }
    },
  }
}

async function request(
  credentials: Credentials,
  method: string,
  options: RequestOptions,
): Promise<ApiAnswer> {
  const { httpMethod = 'GET', body, receiptId, query, signal } = options
  const url = buildUrl(credentials, method, receiptId, query)
  const init: RequestInit = { method: httpMethod, cache: 'no-store' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }

  // One controller for the caller's signal and the time limit: AbortSignal.any is missing in older browsers.
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = setTimeout(abort, options.timeoutMs ?? REQUEST_TIMEOUT_MS)
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })

  let httpStatus: number
  let text: string
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    httpStatus = response.status
    text = await response.text()
  } catch {
    if (signal?.aborted) throw new GreenApiError('aborted', '')
    throw new GreenApiError(
      'network',
      controller.signal.aborted ? MESSAGES.timeout : MESSAGES.network,
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }

  if (httpStatus < 200 || httpStatus > 299) throw toError(httpStatus, method, text)
  if (!text.trim()) return { httpStatus, data: null }
  const data = parseJson(text)
  if (data === undefined) throw unexpectedAnswer(httpStatus)
  return { httpStatus, data }
}

function buildUrl(
  { apiUrl, idInstance, apiTokenInstance }: Credentials,
  method: string,
  receiptId?: number,
  query?: Record<string, string>,
): string {
  const segments = [`waInstance${idInstance}`, method, apiTokenInstance]
  if (receiptId !== undefined) segments.push(String(receiptId))
  const path = segments.map((segment) => encodeURIComponent(segment)).join('/')
  const search = query ? `?${new URLSearchParams(query).toString()}` : ''
  return `${apiUrl.replace(/\/+$/, '')}/${path}${search}`
}

function toError(httpStatus: number, method: string, text: string): GreenApiError {
  const error = (code: GreenApiErrorCode, message: string) =>
    new GreenApiError(code, message, httpStatus)
  switch (httpStatus) {
    case 400:
      return badRequest(text, httpStatus)
    case 401:
      return error('auth', MESSAGES.auth)
    case 403:
      // sendMessage answers 403 "Your account is suspended" although the credentials are right.
      return /suspended/i.test(text)
        ? instanceError(text, httpStatus)
        : error('forbidden', MESSAGES.forbidden)
    case 404:
      return error('wrongHost', MESSAGES.wrongHost)
    case 429:
      return error('rateLimit', MESSAGES.rateLimit)
    case 466:
      return method === 'checkAccount'
        ? error('checkLimit', MESSAGES.checkQuota)
        : error('chatQuota', MESSAGES.chatQuota)
    case 469:
      return error('checkLimit', MESSAGES.checkThrottled)
    default:
      return httpStatus >= 500 && httpStatus <= 599
        ? error('server', MESSAGES.server)
        : unexpectedAnswer(httpStatus)
  }
}

function badRequest(text: string, httpStatus: number): GreenApiError {
  if (/custom webhook url/i.test(text)) {
    return new GreenApiError('webhookUrlSet', MESSAGES.webhookUrlSet, httpStatus)
  }
  if (/expired|deleted|starting|not authorized/i.test(text)) return instanceError(text, httpStatus)
  const detail = errorDetail(text)
  const message = detail ? `Неверный запрос: ${detail}` : 'Неверный запрос.'
  return new GreenApiError('validation', message, httpStatus)
}

function instanceError(text: string, httpStatus: number): GreenApiError {
  const known = INSTANCE_REASONS.find(([pattern]) => pattern.test(text))
  const reason = known ? known[1] : errorDetail(text) || 'причина не указана'
  return new GreenApiError('instance', `Инстанс сейчас не готов: ${reason}.`, httpStatus)
}

/** checkAccount may answer {"status": false, "reason": ...} instead of an HTTP error. */
function checkRefused(reason: string, httpStatus: number): GreenApiError {
  return /limit/i.test(reason)
    ? new GreenApiError('checkLimit', MESSAGES.checkThrottled, httpStatus)
    : instanceError(reason, httpStatus)
}

/** The message fields of a JSON error body, otherwise the raw text; cut to a readable length. */
function errorDetail(text: string): string {
  const data = parseJson(text)
  const fields = isRecord(data) ? [data.message, data.description, data.reason] : []
  const parts = fields.map(readText).filter(Boolean)
  return (parts.length > 0 ? parts.join(' ') : text.trim()).slice(0, ERROR_DETAIL_MAX_LENGTH)
}

function unexpectedAnswer(httpStatus: number): GreenApiError {
  return new GreenApiError(
    'unknown',
    `Неожиданный ответ GREEN-API (HTTP ${httpStatus}).`,
    httpStatus,
  )
}

function pickSettings(data: JsonObject): Partial<InstanceSettings> {
  const settings: Partial<InstanceSettings> = {}
  if (typeof data.webhookUrl === 'string') settings.webhookUrl = data.webhookUrl
  for (const flag of SETTINGS_FLAGS) {
    const value = readText(data[flag])
    if (value === 'yes' || value === 'no') settings[flag] = value
  }
  return settings
}

/** receiptId is an integer; a numeric string is accepted too, so a notification can always be deleted. */
function readReceiptId(value: unknown): number | null {
  const receiptId = readId(value)
  return /^\d+$/.test(receiptId) && Number.isSafeInteger(Number(receiptId))
    ? Number(receiptId)
    : null
}
