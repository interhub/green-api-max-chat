import type { GreenApiErrorCode, InstanceSettings } from '@/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from './client'
import { hang, json, reply, requestAt, stubFetch } from './testing'

const credentials = {
  idInstance: '3100000001',
  apiTokenInstance: 'token',
  apiUrl: 'https://3100.api.green-api.com',
}
const BASE_URL = 'https://3100.api.green-api.com/waInstance3100000001'
const NGINX_404 =
  '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>'

/** contract.txt 3.2, verbatim. */
const SETTINGS_SAMPLE = {
  wid: '79991234567@c.us',
  typeInstance: 'v3',
  webhookUrl: '',
  webhookUrlToken: '',
  delaySendMessagesMilliseconds: 0,
  markIncomingMessagesReaded: 'no',
  markIncomingMessagesReadedOnReply: 'no',
  outgoingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  stateWebhook: 'yes',
  incomingWebhook: 'yes',
  editedMessageWebhook: 'no',
  deletedMessageWebhook: 'no',
  pollMessageWebhook: 'no',
  downloadUrlJpeg: 'no',
}

/** contract.txt 5.2, verbatim. */
const RECEIVE_SAMPLE = {
  receiptId: 1234567,
  body: {
    typeWebhook: 'incomingMessageReceived',
    instanceData: { idInstance: 310000001, wid: '79991234567@c.us', typeInstance: 'v3' },
    timestamp: 1763115112,
    idMessage: '126543123451133331119',
    senderData: {
      chatId: '10000000',
      chatName: 'Ходабрыш Пробешёлов',
      chatType: 'user',
      sender: '10000000',
      senderName: 'Ходабрыш Пробешёлов',
      senderType: 'user',
      senderContactName: 'Ходабрыш Пробешёлов',
      senderPhoneNumber: 79876543210,
    },
    messageData: {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'Привет от Green-API!' },
    },
  },
}

type ApiCall = 'getStateInstance' | 'sendMessage' | 'checkAccount'

function invoke(apiCall: ApiCall): Promise<unknown> {
  const client = createClient(credentials)
  switch (apiCall) {
    case 'sendMessage':
      return client.sendMessage('10000000', 'Привет')
    case 'checkAccount':
      return client.checkAccount(79991234567)
    default:
      return client.getStateInstance()
  }
}

function settle(promise: Promise<unknown>) {
  let settled = false
  const outcome = promise
    .catch((error: unknown) => error)
    .finally(() => {
      settled = true
    })
  return { outcome, isSettled: () => settled }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('request format', () => {
  it('builds GET urls from encoded path segments, without headers or body', async () => {
    const fetchMock = stubFetch(json({ stateInstance: 'authorized' }))
    const client = createClient({
      ...credentials,
      apiTokenInstance: 'a/b?c d',
      apiUrl: 'https://3100.api.green-api.com/',
    })

    await client.getStateInstance()

    const { url, init } = requestAt(fetchMock)
    expect(url).toBe(`${BASE_URL}/getStateInstance/a%2Fb%3Fc%20d`)
    expect(init.method).toBe('GET')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toBeUndefined()
    expect(init.body).toBeUndefined()
  })

  it('posts JSON with the Content-Type header only', async () => {
    const fetchMock = stubFetch(json({ idMessage: '1763115112345' }))

    const result = await createClient(credentials).sendMessage('10000000', 'Привет')

    expect(result).toEqual({ idMessage: '1763115112345' })
    const { url, init } = requestAt(fetchMock)
    expect(url).toBe(`${BASE_URL}/sendMessage/token`)
    expect(init.method).toBe('POST')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"chatId":"10000000","message":"Привет"}')
  })

  it('puts receiveTimeout into the query and receiptId into the path', async () => {
    const fetchMock = stubFetch(reply(200), json({ result: true, reason: '' }))
    const client = createClient(credentials)

    await client.receiveNotification(20)
    await client.deleteNotification(1234567)

    expect(requestAt(fetchMock, 0).url).toBe(
      `${BASE_URL}/receiveNotification/token?receiveTimeout=20`,
    )
    expect(requestAt(fetchMock, 0).init.method).toBe('GET')
    expect(requestAt(fetchMock, 1).url).toBe(`${BASE_URL}/deleteNotification/token/1234567`)
    expect(requestAt(fetchMock, 1).init.method).toBe('DELETE')
    expect(requestAt(fetchMock, 1).init.headers).toBeUndefined()
    expect(requestAt(fetchMock, 1).init.body).toBeUndefined()
  })
})

describe('answers', () => {
  it.each(['authorized', 'notAuthorized', 'starting', 'blocked', 'suspended', 'pendingPassword'])(
    'getStateInstance returns %s',
    async (stateInstance) => {
      stubFetch(json({ stateInstance }))
      await expect(createClient(credentials).getStateInstance()).resolves.toBe(stateInstance)
    },
  )

  it('getStateInstance treats an unknown or missing state as notAuthorized', async () => {
    stubFetch(json({ stateInstance: 'sleeping' }), reply(200))
    const client = createClient(credentials)

    await expect(client.getStateInstance()).resolves.toBe('notAuthorized')
    await expect(client.getStateInstance()).resolves.toBe('notAuthorized')
  })

  it('getSettings keeps the known settings and tolerates extra fields', async () => {
    stubFetch(json(SETTINGS_SAMPLE))

    await expect(createClient(credentials).getSettings()).resolves.toStrictEqual({
      webhookUrl: '',
      incomingWebhook: 'yes',
      outgoingWebhook: 'yes',
      outgoingMessageWebhook: 'yes',
      outgoingAPIMessageWebhook: 'yes',
      stateWebhook: 'yes',
    })
  })

  it('getSettings drops values of an unexpected type and rejects a non-object', async () => {
    stubFetch(json({ webhookUrl: null, incomingWebhook: true, stateWebhook: 'no' }), json([]))
    const client = createClient(credentials)

    await expect(client.getSettings()).resolves.toStrictEqual({ stateWebhook: 'no' })
    await expect(client.getSettings()).rejects.toMatchObject({ code: 'unknown', status: 200 })
  })

  it('setSettings posts the settings and resolves on saveSettings true', async () => {
    const fetchMock = stubFetch(json({ saveSettings: true }))
    const settings: Partial<InstanceSettings> = {
      webhookUrl: '',
      incomingWebhook: 'yes',
      stateWebhook: 'yes',
    }

    await createClient(credentials).setSettings(settings)

    const { url, init } = requestAt(fetchMock)
    expect(url).toBe(`${BASE_URL}/setSettings/token`)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify(settings))
  })

  it('setSettings maps saveSettings false to validation and other answers to unknown', async () => {
    stubFetch(json({ saveSettings: false }), json({}))
    const client = createClient(credentials)

    await expect(client.setSettings({ incomingWebhook: 'yes' })).rejects.toMatchObject({
      code: 'validation',
      message: 'GREEN-API не принял новые настройки.',
    })
    await expect(client.setSettings({ incomingWebhook: 'yes' })).rejects.toMatchObject({
      code: 'unknown',
    })
  })

  it('checkAccount posts the number and returns the chatId', async () => {
    const fetchMock = stubFetch(json({ exist: true, chatId: '10000000', fromCache: true }))

    await expect(createClient(credentials).checkAccount(79991234567)).resolves.toEqual({
      exists: true,
      chatId: '10000000',
    })
    const { url, init } = requestAt(fetchMock)
    expect(url).toBe(`${BASE_URL}/checkAccount/token`)
    expect(init.body).toBe('{"phoneNumber":79991234567}')
  })

  it('checkAccount turns a numeric chatId into a string', async () => {
    stubFetch(json({ exist: true, chatId: 10000000 }))

    await expect(createClient(credentials).checkAccount(79991234567)).resolves.toEqual({
      exists: true,
      chatId: '10000000',
    })
  })

  it('checkAccount reports a number without a MAX account', async () => {
    stubFetch(json({ exist: false, chatId: '', fromCache: false }))

    await expect(createClient(credentials).checkAccount(79990000000)).resolves.toEqual({
      exists: false,
      chatId: '',
    })
  })

  it('checkAccount maps {status: false, reason} answers', async () => {
    stubFetch(
      json({ status: false, reason: 'instance is starting or not authorized' }),
      json({ status: false, reason: 'User get contact info limit reached' }),
    )
    const client = createClient(credentials)

    await expect(client.checkAccount(79991234567)).rejects.toMatchObject({
      code: 'instance',
      status: 200,
      message: 'Инстанс сейчас не готов: инстанс запускается или не авторизован.',
    })
    await expect(client.checkAccount(79991234567)).rejects.toMatchObject({
      code: 'checkLimit',
      message: 'MAX временно ограничил проверку номеров. Подождите около 2 часов.',
    })
  })

  it('checkAccount rejects an answer without exist or without the chatId', async () => {
    stubFetch(json({ chatId: '10000000' }), json({ exist: true, chatId: '' }))
    const client = createClient(credentials)

    await expect(client.checkAccount(79991234567)).rejects.toMatchObject({ code: 'unknown' })
    await expect(client.checkAccount(79991234567)).rejects.toMatchObject({ code: 'unknown' })
  })

  it('sendMessage requires idMessage in the answer', async () => {
    stubFetch(json({}))

    await expect(createClient(credentials).sendMessage('10000000', 'Привет')).rejects.toMatchObject(
      {
        code: 'unknown',
        status: 200,
        message: 'Неожиданный ответ GREEN-API (HTTP 200).',
      },
    )
  })

  it.each([
    ['an empty body', ''],
    ['the text null', 'null'],
    ['an object without receiptId', '{"body":{}}'],
  ])('receiveNotification returns null for %s', async (_label, body) => {
    stubFetch(reply(200, body))

    await expect(createClient(credentials).receiveNotification(5)).resolves.toBeNull()
  })

  it('receiveNotification returns the receiptId and the raw body', async () => {
    stubFetch(json(RECEIVE_SAMPLE))

    await expect(createClient(credentials).receiveNotification(20)).resolves.toEqual(RECEIVE_SAMPLE)
  })

  it.each([
    ['a missing body', '{"receiptId":5}', undefined],
    ['a body that is not an object', '{"receiptId":5,"body":"garbage"}', 'garbage'],
  ])(
    'receiveNotification passes %s through, so the notification can be deleted',
    async (_label, text, body) => {
      stubFetch(reply(200, text))

      await expect(createClient(credentials).receiveNotification(20)).resolves.toStrictEqual({
        receiptId: 5,
        body,
      })
    },
  )

  it('receiveNotification accepts a receiptId sent as a numeric string', async () => {
    stubFetch(json({ receiptId: '42', body: { typeWebhook: 'quotaExceeded' } }))

    await expect(createClient(credentials).receiveNotification(20)).resolves.toEqual({
      receiptId: 42,
      body: { typeWebhook: 'quotaExceeded' },
    })
  })

  it.each([
    ['200 result true', 200, '{"result":true,"reason":""}'],
    ['200 result false', 200, '{"result":false,"reason":"notification not found"}'],
    ['500 Internal Server Error', 500, 'Internal Server Error'],
  ])('deleteNotification treats %s as done', async (_label, status, body) => {
    stubFetch(reply(status, body))

    await expect(createClient(credentials).deleteNotification(1234567)).resolves.toBeUndefined()
  })

  it('deleteNotification still reports other errors', async () => {
    stubFetch(reply(401), reply(502))
    const client = createClient(credentials)

    await expect(client.deleteNotification(1)).rejects.toMatchObject({ code: 'auth' })
    await expect(client.deleteNotification(1)).rejects.toMatchObject({ code: 'server' })
  })
})

interface ErrorCase {
  label: string
  status: number
  body?: string
  apiCall?: ApiCall
  code: GreenApiErrorCode
  message: string
}

const ERROR_CASES: ErrorCase[] = [
  {
    label: '401 with an empty body',
    status: 401,
    code: 'auth',
    message: 'Неверный idInstance или apiTokenInstance.',
  },
  {
    label: '403 from nginx',
    status: 403,
    body: '<html><head><title>403 Forbidden</title></head></html>',
    code: 'forbidden',
    message: 'Неверный idInstance или адрес API.',
  },
  {
    label: '403 suspended account on sendMessage',
    status: 403,
    body: 'Your account is suspended',
    apiCall: 'sendMessage',
    code: 'instance',
    message: 'Инстанс сейчас не готов: аккаунт MAX временно ограничен.',
  },
  {
    label: '404 from a shard that does not serve the id',
    status: 404,
    body: NGINX_404,
    code: 'wrongHost',
    message: 'Этот адрес API не обслуживает указанный idInstance.',
  },
  {
    label: '400 custom webhook url',
    status: 400,
    body: 'Message cannot be received because custom webhook url is set. Go to cabinet, clear webhook url for instance: ХХХХХХХХХХ and wait for about 1 minute for another attempt',
    code: 'webhookUrlSet',
    message: 'В настройках инстанса указан webhookUrl, поэтому сообщения не приходят.',
  },
  {
    label: '400 expired instance',
    status: 400,
    body: 'Instance account is expired. Renew your instance from personal area',
    code: 'instance',
    message: 'Инстанс сейчас не готов: срок тарифа истёк.',
  },
  {
    label: '400 deleted instance',
    status: 400,
    body: 'Instance is deleted',
    code: 'instance',
    message: 'Инстанс сейчас не готов: инстанс удалён.',
  },
  {
    label: '400 starting instance',
    status: 400,
    body: 'instance in starting process try later',
    code: 'instance',
    message: 'Инстанс сейчас не готов: инстанс запускается.',
  },
  {
    label: '400 starting or not authorized instance',
    status: 400,
    body: 'instance is starting or not authorized',
    apiCall: 'sendMessage',
    code: 'instance',
    message: 'Инстанс сейчас не готов: инстанс запускается или не авторизован.',
  },
  {
    label: '400 not authorized instance in a JSON body',
    status: 400,
    body: '{"message":"Instance is not authorized"}',
    code: 'instance',
    message: 'Инстанс сейчас не готов: инстанс не авторизован.',
  },
  {
    label: '400 bad phone number',
    status: 400,
    body: 'bad phone number, valid 11 or 12 digits',
    apiCall: 'checkAccount',
    code: 'validation',
    message: 'Неверный запрос: bad phone number, valid 11 or 12 digits',
  },
  {
    label: '400 validation with a JSON body',
    status: 400,
    body: JSON.stringify({
      message: 'Validation failed.',
      description: "Details: 'message' length must be less than or equal to 4000 characters long",
    }),
    apiCall: 'sendMessage',
    code: 'validation',
    message:
      "Неверный запрос: Validation failed. Details: 'message' length must be less than or equal to 4000 characters long",
  },
  {
    label: '400 with a long text',
    status: 400,
    body: 'x'.repeat(300),
    code: 'validation',
    message: `Неверный запрос: ${'x'.repeat(200)}`,
  },
  {
    label: '400 with an empty body',
    status: 400,
    code: 'validation',
    message: 'Неверный запрос.',
  },
  {
    label: '429',
    status: 429,
    code: 'rateLimit',
    message: 'Слишком много запросов. Подождите секунду.',
  },
  {
    label: '466 on sendMessage',
    status: 466,
    apiCall: 'sendMessage',
    code: 'chatQuota',
    message: 'Тариф Developer позволяет общаться только с 3 чатами.',
  },
  {
    label: '466 on checkAccount',
    status: 466,
    body: JSON.stringify({
      invokeStatus: {
        method: 'checkAccount',
        used: 100,
        total: 100,
        status: 'QUOTE_EXCEEDED',
        description:
          'Monthly quota has been exceeded. Please go to your console and change the tariff to business https://console.green-api.com',
      },
    }),
    apiCall: 'checkAccount',
    code: 'checkLimit',
    message: 'Исчерпан месячный лимит проверки номеров на тарифе Developer.',
  },
  {
    label: '469 on checkAccount',
    status: 469,
    body: 'User get contact info limit reached',
    apiCall: 'checkAccount',
    code: 'checkLimit',
    message: 'MAX временно ограничил проверку номеров. Подождите около 2 часов.',
  },
  {
    label: '500',
    status: 500,
    body: 'Internal Server Error',
    code: 'server',
    message: 'Сервис GREEN-API временно недоступен.',
  },
  {
    label: '502',
    status: 502,
    body: 'Bad Gateway',
    apiCall: 'sendMessage',
    code: 'server',
    message: 'Сервис GREEN-API временно недоступен.',
  },
  {
    label: '418 that no rule covers',
    status: 418,
    code: 'unknown',
    message: 'Неожиданный ответ GREEN-API (HTTP 418).',
  },
]

describe('error mapping', () => {
  it.each(ERROR_CASES)(
    '$label',
    async ({ status, body = '', apiCall = 'getStateInstance', code, message }) => {
      stubFetch(reply(status, body))

      await expect(invoke(apiCall)).rejects.toMatchObject({
        name: 'GreenApiError',
        code,
        status,
        message,
      })
    },
  )

  it('maps a failed fetch to a network error without an HTTP status', async () => {
    stubFetch(new TypeError('Failed to fetch'))

    await expect(invoke('getStateInstance')).rejects.toMatchObject({
      code: 'network',
      status: 0,
      message: 'Нет связи с GREEN-API.',
    })
  })

  it('never lets a JSON SyntaxError escape', async () => {
    stubFetch(reply(200, '<html>captive portal</html>'))

    await expect(createClient(credentials).getSettings()).rejects.toMatchObject({
      name: 'GreenApiError',
      code: 'unknown',
      status: 200,
      message: 'Неожиданный ответ GREEN-API (HTTP 200).',
    })
  })
})

describe('abort and time limits', () => {
  it('reports an abort by the caller as aborted', async () => {
    stubFetch(hang)
    const controller = new AbortController()

    const result = createClient(credentials).sendMessage('10000000', 'Привет', controller.signal)
    controller.abort()

    await expect(result).rejects.toMatchObject({ code: 'aborted', status: 0, message: '' })
  })

  it('reports an already aborted signal as aborted', async () => {
    stubFetch(hang)

    await expect(
      createClient(credentials).getStateInstance(AbortSignal.abort()),
    ).rejects.toMatchObject({ code: 'aborted' })
  })

  it('gives a call 15 seconds, then reports a network error', async () => {
    vi.useFakeTimers()
    stubFetch(hang)

    const call = settle(createClient(credentials).getSettings())
    await vi.advanceTimersByTimeAsync(14_999)
    expect(call.isSettled()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(await call.outcome).toMatchObject({
      code: 'network',
      status: 0,
      message: 'GREEN-API не ответил вовремя.',
    })
  })

  it('gives receiveNotification receiveTimeout plus 15 seconds, also with a caller signal', async () => {
    vi.useFakeTimers()
    stubFetch(hang)

    const signal = new AbortController().signal
    const call = settle(createClient(credentials).receiveNotification(20, signal))
    await vi.advanceTimersByTimeAsync(34_999)
    expect(call.isSettled()).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(await call.outcome).toMatchObject({
      code: 'network',
      status: 0,
      message: 'GREEN-API не ответил вовремя.',
    })
  })

  it.each([
    ['an answer', () => json({ stateInstance: 'authorized' })],
    ['an HTTP error', () => reply(502)],
    ['a failed fetch', () => new TypeError('Failed to fetch')],
  ])('clears the time limit after %s', async (_label, answer) => {
    vi.useFakeTimers()
    stubFetch(answer())

    await createClient(credentials)
      .getStateInstance()
      .catch(() => undefined)

    expect(vi.getTimerCount()).toBe(0)
  })

  it('links the caller signal without AbortSignal.any and releases it after the call', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'any').mockImplementation(() => {
      throw new TypeError('AbortSignal.any is not a function')
    })
    stubFetch(json({ stateInstance: 'authorized' }), hang)
    const controller = new AbortController()
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')
    const client = createClient(credentials)

    await expect(client.getStateInstance(controller.signal)).resolves.toBe('authorized')
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)

    const pending = client.receiveNotification(20, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'aborted' })
  })
})
