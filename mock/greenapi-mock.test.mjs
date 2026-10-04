import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { chatIdForPhone, configFromEnv, start } from './greenapi-mock.mjs'

const ID = '3100000001'
const TOKEN = 'test-token'
const INSTANCE_DATA = { idInstance: Number(ID), wid: '79991234567@c.us', typeInstance: 'v3' }
let server

before(async () => {
  server = await start({
    port: 0,
    silent: true,
    idInstance: ID,
    token: TOKEN,
    notifications: 'on',
    autoReply: false,
    quota: 3,
    stateInstance: 'authorized',
    rateLimit: false,
    echoKind: 'text',
    applyMs: 50,
    echoMs: 10,
    deliveredMs: 20,
    readMs: 30,
    autoReplyMs: 15,
  })
})

after(() => server.stop())

beforeEach(() => control('reset'))

function api(method, { verb = 'GET', body, token = TOKEN, id = ID, tail = '', prefix = '' } = {}) {
  const init = { method: verb }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  return fetch(`${server.url}${prefix}/waInstance${id}/${method}/${token}${tail}`, init)
}

async function control(route, body = {}) {
  const response = await fetch(`${server.url}/__mock/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

async function readLog() {
  const response = await fetch(`${server.url}/__mock/log`)
  return response.json()
}

async function receive() {
  const response = await api('receiveNotification', { tail: '?receiveTimeout=5' })
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.notEqual(text, 'null', 'a notification was expected')
  return JSON.parse(text)
}

async function remove(receiptId) {
  const response = await api('deleteNotification', { verb: 'DELETE', tail: `/${receiptId}` })
  return response.json()
}

async function take() {
  const notification = await receive()
  assert.deepEqual(await remove(notification.receiptId), { result: true, reason: '' })
  return notification.body
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const isNowSeconds = (value) => Number.isInteger(value) && Math.abs(value - Date.now() / 1000) < 5

describe('transport', () => {
  test('answers 401 with an empty JSON body for a wrong token or idInstance', async () => {
    const started = Date.now()
    const responses = await Promise.all([
      api('getStateInstance', { token: 'wrong' }),
      api('getStateInstance', { id: '3100000002' }),
      api('receiveNotification', { token: 'wrong', tail: '?receiveTimeout=60' }),
      api('sendMessage', { verb: 'POST', token: 'wrong', body: { chatId: '1', message: 'x' } }),
    ])
    assert.ok(Date.now() - started < 1000, 'auth is checked before the long poll')
    for (const response of responses) {
      assert.equal(response.status, 401)
      assert.match(response.headers.get('content-type'), /application\/json/)
      assert.equal(response.headers.get('content-length'), '0')
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
      assert.equal(await response.text(), '')
    }
  })

  test('answers the CORS preflight with 204 and the headers of the MAX host', async () => {
    const response = await fetch(`${server.url}/waInstance${ID}/sendMessage/${TOKEN}`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), '*')
    assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS, DELETE')
    assert.match(response.headers.get('access-control-allow-headers'), /Content-Type/)
    assert.equal(response.headers.get('access-control-max-age'), '1728000')
    assert.equal(await response.text(), '')
  })

  test('routes methods case-insensitively with and without the /v3 prefix', async () => {
    for (const response of [
      await api('getStateInstance'),
      await api('GetStateInstance', { prefix: '/v3' }),
    ]) {
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { stateInstance: 'authorized' })
    }
  })

  test('answers 404 with the nginx page for unknown methods and wrong verbs', async () => {
    for (const response of [await api('getChats'), await api('sendMessage')]) {
      assert.equal(response.status, 404)
      assert.match(await response.text(), /nginx/)
    }
  })
})

describe('settings', () => {
  test('getSettings returns the MAX settings with string flags', async () => {
    const settings = await (await api('getSettings')).json()
    assert.equal(settings.typeInstance, 'v3')
    assert.equal(settings.webhookUrl, '')
    assert.equal(settings.incomingWebhook, 'yes')
    assert.equal(settings.outgoingAPIMessageWebhook, 'yes')
  })

  test('setSettings answers at once and applies the flags after the delay', async () => {
    await control('reset', { notifications: 'off', applyMs: 100 })
    assert.equal((await (await api('getSettings')).json()).incomingWebhook, 'no')
    const response = await api('setSettings', {
      verb: 'POST',
      body: { webhookUrl: '', incomingWebhook: 'yes', outgoingWebhook: 'yes' },
    })
    assert.deepEqual(await response.json(), { saveSettings: true })
    assert.equal((await (await api('getSettings')).json()).incomingWebhook, 'no')
    await sleep(150)
    const settings = await (await api('getSettings')).json()
    assert.equal(settings.incomingWebhook, 'yes')
    assert.equal(settings.outgoingWebhook, 'yes')
    assert.equal(settings.stateWebhook, 'no')
  })

  test('setSettings restarts the instance and holds deliveries until it is authorized', async () => {
    await control('reset', { applyMs: 500 })
    const saved = await api('setSettings', { verb: 'POST', body: { webhookUrl: '' } })
    assert.deepEqual(await saved.json(), { saveSettings: true })
    assert.deepEqual(await (await api('getStateInstance')).json(), { stateInstance: 'starting' })
    const check = await api('checkAccount', { verb: 'POST', body: { phoneNumber: 79001234567 } })
    assert.deepEqual(await check.json(), {
      status: false,
      reason: 'instance is starting or not authorized',
    })
    const sent = await api('sendMessage', {
      verb: 'POST',
      body: { chatId: '10000000', message: 'во время перезапуска' },
    })
    const { idMessage } = await sent.json()
    assert.match(idMessage, /^\d+$/)
    const starting = await take()
    assert.ok(isNowSeconds(starting.timestamp))
    assert.deepEqual(starting, {
      typeWebhook: 'stateInstanceChanged',
      instanceData: INSTANCE_DATA,
      timestamp: starting.timestamp,
      stateInstance: 'starting',
    })
    await sleep(100)
    assert.deepEqual((await readLog()).queue, [])
    assert.equal((await take()).stateInstance, 'authorized')
    const echo = await take()
    assert.equal(echo.typeWebhook, 'outgoingAPIMessageReceived')
    assert.equal(echo.idMessage, idMessage)
    assert.equal((await take()).status, 'delivered')
    assert.deepEqual(await (await api('getStateInstance')).json(), { stateInstance: 'authorized' })
  })

  test('the restart reports a state change only while stateWebhook is on at that moment', async () => {
    const stateChanges = async () => (await readLog()).queue.map((item) => item.body.stateInstance)
    await control('reset', { notifications: 'off', applyMs: 0 })
    await api('setSettings', { verb: 'POST', body: { stateWebhook: 'yes' } })
    assert.deepEqual(await stateChanges(), ['authorized'])
    await control('reset', { applyMs: 0 })
    await api('setSettings', { verb: 'POST', body: { stateWebhook: 'no' } })
    assert.deepEqual(await stateChanges(), ['starting'])
  })

  test('setSettings rejects unknown fields, bad flags and empty bodies', async () => {
    const cases = [
      [{ foo: 'yes' }, "'foo' is not allowed"],
      [{ incomingWebhook: true }, "'incomingWebhook' must be one of [yes, no]"],
      [{}, 'at least one setting is required'],
    ]
    for (const [body, details] of cases) {
      const response = await api('setSettings', { verb: 'POST', body })
      assert.equal(response.status, 400)
      assert.equal(await response.text(), `Validation failed. Details: ${details}`)
    }
  })

  test('receiving answers 400 while a webhookUrl is set', async () => {
    await control('reset', { applyMs: 0 })
    await api('setSettings', { verb: 'POST', body: { webhookUrl: 'https://example.com/hook' } })
    for (const response of [
      await api('receiveNotification', { tail: '?receiveTimeout=5' }),
      await api('deleteNotification', { verb: 'DELETE', tail: '/1' }),
    ]) {
      assert.equal(response.status, 400)
      assert.match(await response.text(), /custom webhook url is set/)
    }
  })
})

describe('checkAccount', () => {
  const check = (body) => api('checkAccount', { verb: 'POST', body })

  test('maps RU and BY numbers to stable numeric chatIds', async () => {
    const first = await (await check({ phoneNumber: 79001234567 })).json()
    assert.deepEqual(first, {
      exist: true,
      chatId: chatIdForPhone('79001234567'),
      fromCache: false,
    })
    assert.match(first.chatId, /^\d{8}$/)
    const second = await (await check({ phoneNumber: 79001234567 })).json()
    assert.deepEqual(second, { ...first, fromCache: true })
    const belarus = await (await check({ phoneNumber: 375291234567 })).json()
    assert.equal(belarus.exist, true)
    assert.notEqual(belarus.chatId, first.chatId)
  })

  test('reports numbers ending with 0000 as missing', async () => {
    const answer = await (await check({ phoneNumber: 79001230000 })).json()
    assert.deepEqual(answer, { exist: false, chatId: '', fromCache: false })
  })

  test('rejects numbers that are not RU or BY and malformed bodies', async () => {
    const cases = [
      [{ phoneNumber: 4915112345678 }, 'bad phone number, valid 11 or 12 digits'],
      [{ phoneNumber: 7900123 }, 'bad phone number, valid 11 or 12 digits'],
      [{ phoneNumber: '+7 900' }, /must contain only digits/],
      [{}, /'phoneNumber' is required/],
    ]
    for (const [body, expected] of cases) {
      const response = await check(body)
      assert.equal(response.status, 400)
      const text = await response.text()
      if (typeof expected === 'string') assert.equal(text, expected)
      else assert.match(text, expected)
    }
  })

  test('answers status false while the instance is not authorized', async () => {
    await control('state', { stateInstance: 'notAuthorized' })
    const answer = await (await check({ phoneNumber: 79001234567 })).json()
    assert.deepEqual(answer, { status: false, reason: 'instance is starting or not authorized' })
  })
})

describe('sendMessage and the notification queue', () => {
  const sendMessage = (body) => api('sendMessage', { verb: 'POST', body })

  test('returns idMessage, then queues the API echo and the delivered and read statuses', async () => {
    const response = await sendMessage({ chatId: '10000000', message: 'Привет' })
    assert.equal(response.status, 200)
    const { idMessage } = await response.json()
    assert.match(idMessage, /^\d+$/)
    const echo = await take()
    assert.equal(echo.typeWebhook, 'outgoingAPIMessageReceived')
    assert.equal(echo.idMessage, idMessage)
    assert.equal(echo.senderData.chatId, '10000000')
    assert.equal(echo.instanceData.typeInstance, 'v3')
    assert.deepEqual(echo.messageData, {
      typeMessage: 'textMessage',
      textMessageData: { textMessage: 'Привет' },
    })
    for (const status of ['delivered', 'read']) {
      const body = await take()
      assert.ok(isNowSeconds(body.timestamp))
      assert.deepEqual(body, {
        typeWebhook: 'outgoingMessageStatus',
        chatId: '10000000',
        instanceData: INSTANCE_DATA,
        timestamp: body.timestamp,
        idMessage,
        status,
      })
    }
  })

  test('names every private chat after a stable contact, as in the documented samples', async () => {
    const chatId = chatIdForPhone('79001234567')
    await sendMessage({ chatId: '79001234567@c.us', message: 'по номеру' })
    const echo = await take()
    const name = echo.senderData.chatName
    assert.match(name, /^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+$/)
    assert.deepEqual(echo.senderData, {
      chatId,
      chatName: name,
      chatType: 'user',
      sender: chatId,
      senderName: name,
      senderType: 'user',
      senderContactName: name,
      senderPhoneNumber: 79001234567,
    })
    assert.equal((await readLog()).contacts[chatId].name, name)
    await control('reset')
    await control('incoming', { chatId, text: 'снова' })
    assert.equal((await take()).senderData.senderName, name)
  })

  test('receiptIds keep growing across resets', async () => {
    await control('incoming', { chatId: '10000000', text: 'до сброса' })
    const first = await receive()
    await control('reset')
    await control('incoming', { chatId: '10000000', text: 'после сброса' })
    const second = await receive()
    assert.ok(second.receiptId > first.receiptId)
  })

  test('returns the same notification until it is deleted, in FIFO order', async () => {
    await control('incoming', { chatId: '10000000', text: 'Первое' })
    await control('incoming', { chatId: '10000000', text: 'Второе' })
    const first = await receive()
    const again = await receive()
    assert.equal(again.receiptId, first.receiptId)
    assert.equal(first.body.messageData.textMessageData.textMessage, 'Первое')
    assert.deepEqual(await remove(first.receiptId), { result: true, reason: '' })
    assert.equal((await remove(first.receiptId)).result, false)
    const second = await receive()
    assert.equal(second.body.messageData.textMessageData.textMessage, 'Второе')
    assert.ok(second.receiptId > first.receiptId)
  })

  test('queues nothing while notifications are off', async () => {
    await control('reset', { notifications: 'off' })
    assert.equal((await sendMessage({ chatId: '10000000', message: 'Тихо' })).status, 200)
    const incoming = await control('incoming', { chatId: '10000001', text: 'Тоже тихо' })
    assert.equal(incoming.body.queued, false)
    await sleep(60)
    assert.deepEqual((await readLog()).queue, [])
  })

  test('validates chatId and message like the real API', async () => {
    const cases = [
      [{ message: 'x' }, "'chatId' is required"],
      [{ chatId: 'abc', message: 'x' }, "'chatId' must be one of the next formats"],
      [{ chatId: '10000000', message: '' }, "'message' is not allowed to be empty"],
      [{ chatId: '10000000', message: 'x'.repeat(4001) }, 'less than or equal to 4000'],
      [{ chatId: '10000000', message: 'x', foo: 1 }, "'foo' is not allowed"],
    ]
    for (const [body, details] of cases) {
      const response = await sendMessage(body)
      assert.equal(response.status, 400)
      assert.ok((await response.text()).includes(details), details)
    }
  })

  test('allows three chats and answers the fourth with 466 and quotaExceeded', async () => {
    for (const chatId of ['10000001', '10000002', '10000003']) {
      assert.equal((await sendMessage({ chatId, message: 'ok' })).status, 200)
    }
    const response = await sendMessage({ chatId: '10000004', message: 'too many' })
    assert.equal(response.status, 466)
    const { correspondentsStatus } = await response.json()
    assert.equal(correspondentsStatus.status, 'CORRESPONDENTS_QUOTA_EXCEEDED')
    assert.equal(correspondentsStatus.used, 3)
    assert.equal(correspondentsStatus.total, 3)
    const quota = (await readLog()).queue.find((item) => item.body.typeWebhook === 'quotaExceeded')
    assert.deepEqual(quota?.body, {
      typeWebhook: 'quotaExceeded',
      instanceData: INSTANCE_DATA,
      quotaData: {
        method: 'correspondents',
        used: 3,
        total: 3,
        status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
        description:
          'Monthly quota has been exceeded. You can only send or receive messages from following chats: 10000001, 10000002, 10000003. Please go to your personal account and change the tariff to business https://console.green-api.com',
      },
    })
    assert.equal((await sendMessage({ chatId: '10000002', message: 'still ok' })).status, 200)
    const incoming = await control('incoming', { chatId: '10000005', text: 'blocked' })
    assert.deepEqual(incoming.body, { queued: false, reason: 'quota' })
  })

  test('sends phone@c.us to the chatId of that number and reports noAccount for 0000', async () => {
    await sendMessage({ chatId: '79001234567@c.us', message: 'по номеру' })
    const echo = await take()
    assert.equal(echo.senderData.chatId, chatIdForPhone('79001234567'))
    assert.equal(echo.senderData.senderPhoneNumber, 79001234567)
    await control('reset')
    await sendMessage({ chatId: '79001230000@c.us', message: 'никому' })
    const status = await take()
    assert.equal(status.typeWebhook, 'outgoingMessageStatus')
    assert.equal(status.status, 'noAccount')
  })

  test('replies automatically when autoReply is on', async () => {
    await control('reset', { autoReply: true })
    await sendMessage({ chatId: '10000000', message: 'Есть кто?' })
    const bodies = [await take(), await take(), await take(), await take()]
    const reply = bodies.find((body) => body.typeWebhook === 'incomingMessageReceived')
    assert.equal(reply?.messageData.textMessageData.textMessage, 'Принято, отвечу позже.')
  })

  test('holds messages while the instance is not authorized', async () => {
    await control('state', { stateInstance: 'notAuthorized' })
    assert.equal((await take()).stateInstance, 'notAuthorized')
    const { idMessage } = await (await sendMessage({ chatId: '10000000', message: 'позже' })).json()
    await sleep(60)
    assert.deepEqual((await readLog()).queue, [])
    await control('state', { stateInstance: 'authorized' })
    assert.equal((await take()).typeWebhook, 'stateInstanceChanged')
    const echo = await take()
    assert.equal(echo.typeWebhook, 'outgoingAPIMessageReceived')
    assert.equal(echo.idMessage, idMessage)
  })
})

describe('notification flags', () => {
  async function produceEverything() {
    await api('sendMessage', { verb: 'POST', body: { chatId: '10000000', message: 'через API' } })
    await control('phone-message', { chatId: '10000000', text: 'с телефона' })
    await control('incoming', { chatId: '10000000', text: 'входящее' })
    await control('state', { stateInstance: 'authorized' })
    await sleep(80)
    return (await readLog()).queue.map((item) => item.body.typeWebhook).sort()
  }

  test('each flag switches on only its own notification type', async () => {
    const cases = [
      ['incomingWebhook', ['incomingMessageReceived']],
      ['outgoingMessageWebhook', ['outgoingMessageReceived']],
      ['outgoingAPIMessageWebhook', ['outgoingAPIMessageReceived']],
      ['outgoingWebhook', Array(4).fill('outgoingMessageStatus')],
      ['stateWebhook', ['stateInstanceChanged']],
    ]
    for (const [flag, expected] of cases) {
      await control('reset', { notifications: 'off', settings: { [flag]: 'yes' } })
      assert.deepEqual(await produceEverything(), expected, flag)
    }
  })

  test('a webhookUrl keeps the queue empty whatever the flags say', async () => {
    await control('reset', { settings: { webhookUrl: 'https://example.com/hook' } })
    assert.deepEqual(await produceEverything(), [])
    const statuses = []
    for (const chatId of ['79001230000@c.us', '10000001', '10000002']) {
      const body = { chatId, message: 'тишина' }
      statuses.push((await api('sendMessage', { verb: 'POST', body })).status)
    }
    assert.deepEqual(statuses, [200, 200, 466])
    await sleep(60)
    assert.deepEqual((await readLog()).queue, [])
  })
})

describe('optional behaviour', () => {
  test('reads the optional switches from the environment', () => {
    const config = configFromEnv({ MOCK_RATE_LIMIT: '1', MOCK_ECHO_KIND: 'extended' })
    assert.deepEqual([config.rateLimit, config.echoKind], [true, 'extended'])
    const defaults = configFromEnv({})
    assert.deepEqual([defaults.rateLimit, defaults.echoKind], [false, 'text'])
  })

  test('rateLimit answers 429 to a 1 per second method called again within a second', async () => {
    await control('reset', { rateLimit: true })
    assert.equal((await api('getStateInstance')).status, 200)
    const limited = await api('getStateInstance')
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('access-control-allow-origin'), '*')
    assert.equal((await api('getSettings')).status, 200)
    assert.equal((await api('getSettings')).status, 429)
    const body = { chatId: '10000000', message: 'без лимита' }
    assert.equal((await api('sendMessage', { verb: 'POST', body })).status, 200)
    await sleep(1000)
    assert.equal((await api('getStateInstance')).status, 200)
  })

  test('echoKind extended sends the API echo as extendedTextMessage', async () => {
    await control('reset', { echoKind: 'extended' })
    await api('sendMessage', { verb: 'POST', body: { chatId: '10000000', message: 'Привет' } })
    const echo = await take()
    assert.equal(echo.typeWebhook, 'outgoingAPIMessageReceived')
    assert.deepEqual(echo.messageData, {
      typeMessage: 'extendedTextMessage',
      extendedTextMessageData: {
        text: 'Привет',
        description: '',
        title: '',
        jpegThumbnail: '',
        isForwarded: false,
        forwardingScore: 0,
      },
    })
  })
})

describe('control API', () => {
  test('incoming builds the documented private chat body', async () => {
    const answer = await control('incoming', {
      chatId: '10000000',
      text: 'Привет от Green-API!',
      senderName: 'Анна',
      phone: '79876543210',
    })
    assert.equal(answer.body.queued, true)
    const body = await take()
    assert.equal(body.typeWebhook, 'incomingMessageReceived')
    assert.equal(body.idMessage, answer.body.idMessage)
    assert.deepEqual(body.senderData, {
      chatId: '10000000',
      chatName: 'Анна',
      chatType: 'user',
      sender: '10000000',
      senderName: 'Анна',
      senderType: 'user',
      senderContactName: 'Анна',
      senderPhoneNumber: 79876543210,
    })
    assert.equal(body.messageData.textMessageData.textMessage, 'Привет от Green-API!')
  })

  test('incoming supports links, explicit kinds and group chats', async () => {
    await control('incoming', { chatId: '10000000', text: 'См. https://green-api.com/' })
    assert.equal((await take()).messageData.typeMessage, 'extendedTextMessage')
    await control('incoming', { chatId: '10000000', text: 'подпись', kind: 'image' })
    const image = await take()
    assert.equal(image.messageData.typeMessage, 'imageMessage')
    assert.equal(image.messageData.fileMessageData.caption, 'подпись')
    await control('incoming', {
      chatId: '-10000000000000',
      text: 'Всем привет',
      chatName: 'Команда',
      senderName: 'Иван',
    })
    const group = await take()
    assert.equal(group.senderData.chatType, 'group')
    assert.equal(group.senderData.chatName, 'Команда')
    assert.equal(group.senderData.senderName, 'Иван')
    assert.equal(group.senderData.senderPhoneNumber, 0)
    assert.notEqual(group.senderData.sender, group.senderData.chatId)
  })

  test('phone-message queues outgoingMessageReceived with statuses', async () => {
    const answer = await control('phone-message', { chatId: '10000000', text: 'С телефона' })
    const echo = await take()
    assert.equal(echo.typeWebhook, 'outgoingMessageReceived')
    assert.equal(echo.idMessage, answer.body.idMessage)
    assert.equal((await take()).status, 'delivered')
  })

  test('state changes getStateInstance and queues stateInstanceChanged', async () => {
    await control('state', { stateInstance: 'blocked' })
    assert.deepEqual(await (await api('getStateInstance')).json(), { stateInstance: 'blocked' })
    assert.equal((await take()).stateInstance, 'blocked')
    assert.equal((await control('state', { stateInstance: 'sent' })).status, 400)
  })

  test('fail answers the next calls with the given status, then works again', async () => {
    await control('fail', { method: 'SendMessage', status: 500, count: 2 })
    const body = { chatId: '10000000', message: 'x' }
    const statuses = []
    for (let attempt = 0; attempt < 3; attempt += 1) {
      statuses.push((await api('sendMessage', { verb: 'POST', body })).status)
    }
    assert.deepEqual(statuses, [500, 500, 200])
    await control('fail', { method: 'getStateInstance', status: 401 })
    const unauthorized = await api('getStateInstance')
    assert.equal(unauthorized.status, 401)
    assert.equal(await unauthorized.text(), '')
    await control('fail', { method: 'checkAccount', status: 466 })
    const quota = await api('checkAccount', { verb: 'POST', body: { phoneNumber: 79001234567 } })
    assert.equal((await quota.json()).invokeStatus.status, 'QUOTE_EXCEEDED')
    assert.equal((await control('fail', { method: 'nope', status: 500 })).status, 400)
  })

  test('log lists requests and sent messages and reset clears them', async () => {
    await api('sendMessage', { verb: 'POST', body: { chatId: '10000000', message: 'в журнал' } })
    const log = await readLog()
    assert.equal(log.sent.length, 1)
    assert.equal(log.sent[0].message, 'в журнал')
    const entry = log.requests.find((item) => item.method === 'sendMessage')
    assert.equal(entry.status, 200)
    assert.deepEqual(entry.body, { chatId: '10000000', message: 'в журнал' })
    await control('reset')
    const cleared = await readLog()
    assert.deepEqual([cleared.sent, cleared.requests, cleared.queue], [[], [], []])
  })

  test('reset rejects unknown options', async () => {
    const answer = await control('reset', { notification: 'off' })
    assert.equal(answer.status, 400)
    assert.match(answer.body.error, /Unknown option 'notification'/)
  })
})
