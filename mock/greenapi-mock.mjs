import { realpathSync } from 'node:fs'
import { createServer, STATUS_CODES } from 'node:http'
import { fileURLToPath } from 'node:url'

const BASE_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET, POST, OPTIONS, DELETE',
  'access-control-allow-headers':
    'DNT, User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Content-Type, Range',
  'access-control-expose-headers': 'Content-Length, Content-Range',
  'access-control-max-age': '1728000',
  'x-content-type-options': 'nosniff',
}
const JSON_TYPE = 'application/json; charset=utf-8'
const TEXT_TYPE = 'text/plain; charset=utf-8'
const HTML_TYPE = 'text/html'
const NOT_FOUND_PAGE =
  '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>'

const API_PATH = /^\/(?:v3\/)?waInstance([^/]*)\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/
const NUMERIC_CHAT_ID = /^-?[1-9]\d{0,19}$/
const LINK = /https?:\/\/\S/i
const MAX_BODY_BYTES = 100 * 1024
const MAX_MESSAGE_LENGTH = 4000
const MAX_LOG_ENTRIES = 1000
const OWN_WID = '79991234567@c.us'
const AUTOREPLY_TEXT = 'Принято, отвечу позже.'
const CONSOLE_URL = 'https://console.green-api.com'
const CONTACT_NAMES = [
  'Анна Смирнова',
  'Иван Петров',
  'Мария Кузнецова',
  'Алексей Соколов',
  'Екатерина Попова',
  'Дмитрий Лебедев',
  'Ольга Новикова',
  'Сергей Морозов',
  'Наталья Волкова',
  'Андрей Козлов',
  'Татьяна Павлова',
  'Михаил Фёдоров',
]
const ONE_PER_SECOND_METHODS = new Set(['getStateInstance', 'getSettings', 'setSettings'])
const RATE_WINDOW_MS = 1000

const INSTANCE_STATES = [
  'notAuthorized',
  'authorized',
  'blocked',
  'starting',
  'suspended',
  'pendingPassword',
]
const NOTIFICATION_FLAGS = [
  'outgoingWebhook',
  'outgoingMessageWebhook',
  'outgoingAPIMessageWebhook',
  'stateWebhook',
  'incomingWebhook',
]
const EXTRA_FLAGS = [
  'markIncomingMessagesReaded',
  'markIncomingMessagesReadedOnReply',
  'editedMessageWebhook',
  'deletedMessageWebhook',
  'pollMessageWebhook',
  'downloadUrlJpeg',
]
const MESSAGE_FLAGS = {
  incomingMessageReceived: 'incomingWebhook',
  outgoingMessageReceived: 'outgoingMessageWebhook',
  outgoingAPIMessageReceived: 'outgoingAPIMessageWebhook',
}
const MESSAGE_KINDS = ['text', 'image', 'extended']
const ECHO_KINDS = ['text', 'extended']
const SEND_FIELDS = ['chatId', 'message', 'typingTime', 'quotedMessageId']
const CHECK_FIELDS = ['phoneNumber', 'force']
const API_METHODS = new Map(
  Object.entries({
    getStateInstance: 'GET',
    getSettings: 'GET',
    setSettings: 'POST',
    checkAccount: 'POST',
    sendMessage: 'POST',
    receiveNotification: 'GET',
    deleteNotification: 'DELETE',
  }).map(([name, verb]) => [name.toLowerCase(), { name, verb }]),
)

const DEFAULTS = {
  port: 8787,
  idInstance: '3100000001',
  token: 'mock-token',
  notifications: 'on',
  autoReply: false,
  quota: 3,
  stateInstance: 'authorized',
  rateLimit: false,
  echoKind: 'text',
  applyMs: 3000,
  echoMs: 250,
  deliveredMs: 1000,
  readMs: 2500,
  autoReplyMs: 1500,
}

const isCount = (value) => Number.isInteger(value) && value >= 0
const OPTION_CHECKS = {
  notifications: (value) => value === 'on' || value === 'off',
  autoReply: (value) => typeof value === 'boolean',
  stateInstance: (value) => INSTANCE_STATES.includes(value),
  rateLimit: (value) => typeof value === 'boolean',
  echoKind: (value) => ECHO_KINDS.includes(value),
  settings: (value) =>
    isObject(value) &&
    Object.entries(value).every(([key, item]) => settingProblem(key, item) === null),
  quota: isCount,
  applyMs: isCount,
  echoMs: isCount,
  deliveredMs: isCount,
  readMs: isCount,
  autoReplyMs: isCount,
}

export function configFromEnv(env = process.env) {
  const numberOr = (value, fallback) =>
    value !== undefined && value.trim() !== '' && Number.isFinite(Number(value))
      ? Number(value)
      : fallback
  return {
    port: numberOr(env.MOCK_PORT, DEFAULTS.port),
    idInstance: env.MOCK_ID_INSTANCE || DEFAULTS.idInstance,
    token: env.MOCK_TOKEN || DEFAULTS.token,
    notifications: env.MOCK_NOTIFICATIONS === 'off' ? 'off' : DEFAULTS.notifications,
    autoReply: env.MOCK_AUTOREPLY === '1',
    quota: numberOr(env.MOCK_QUOTA, DEFAULTS.quota),
    stateInstance: INSTANCE_STATES.includes(env.MOCK_STATE)
      ? env.MOCK_STATE
      : DEFAULTS.stateInstance,
    rateLimit: env.MOCK_RATE_LIMIT === '1',
    echoKind: env.MOCK_ECHO_KIND === 'extended' ? 'extended' : DEFAULTS.echoKind,
    applyMs: numberOr(env.MOCK_APPLY_MS, DEFAULTS.applyMs),
    echoMs: numberOr(env.MOCK_ECHO_MS, DEFAULTS.echoMs),
    deliveredMs: numberOr(env.MOCK_DELIVERED_MS, DEFAULTS.deliveredMs),
    readMs: numberOr(env.MOCK_READ_MS, DEFAULTS.readMs),
    autoReplyMs: numberOr(env.MOCK_AUTOREPLY_MS, DEFAULTS.autoReplyMs),
  }
}

function fnv1a(seed) {
  let hash = 0x811c9dc5
  for (const char of seed) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0
  }
  return hash
}

function numericId(seed) {
  return String(10_000_000 + (fnv1a(seed) % 90_000_000))
}

export function chatIdForPhone(digits) {
  return numericId(digits)
}

function newContact(chatId) {
  const name = chatId.startsWith('-')
    ? ''
    : CONTACT_NAMES[fnv1a(`contact:${chatId}`) % CONTACT_NAMES.length]
  return { name, phone: '', chatName: '' }
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const nowSeconds = () => Math.floor(Date.now() / 1000)
const isSupportedPhone = (digits) => /^7\d{10}$/.test(digits) || /^375\d{9}$/.test(digits)
const validation = (details) => [400, `Validation failed. Details: ${details}`, TEXT_TYPE]
const badRequest = (error) => [400, { error }]

function phoneDigits(value) {
  if (Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return value
  return null
}

function resolveChat(chatId) {
  if (NUMERIC_CHAT_ID.test(chatId)) return { chatId, phone: '', exists: true }
  const match = /^(\d{11,12})@c\.us$/.exec(chatId)
  if (!match || !isSupportedPhone(match[1])) return null
  return { chatId: chatIdForPhone(match[1]), phone: match[1], exists: !match[1].endsWith('0000') }
}

function unknownField(body, allowed) {
  return Object.keys(body).find((key) => !allowed.includes(key))
}

function settingProblem(key, value) {
  if (key === 'webhookUrl' || key === 'webhookUrlToken') {
    return typeof value === 'string' ? null : `'${key}' must be a string`
  }
  if (key === 'delaySendMessagesMilliseconds') {
    return isCount(value) ? null : `'${key}' must be a number`
  }
  if (NOTIFICATION_FLAGS.includes(key) || EXTRA_FLAGS.includes(key)) {
    return value === 'yes' || value === 'no' ? null : `'${key}' must be one of [yes, no]`
  }
  return `'${key}' is not allowed`
}

function optionsProblem(input) {
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(OPTION_CHECKS, key)) return `Unknown option '${key}'`
    if (!OPTION_CHECKS[key](value)) return `Invalid value of '${key}'`
  }
  return null
}

function messageProblem(input) {
  if (typeof input.chatId !== 'string' || !NUMERIC_CHAT_ID.test(input.chatId)) {
    return "'chatId' must be a numeric string such as 10000000"
  }
  if (typeof input.text !== 'string' || input.text === '')
    return "'text' must be a non-empty string"
  return null
}

function incomingProblem(input) {
  for (const key of ['senderName', 'chatName']) {
    if (input[key] !== undefined && typeof input[key] !== 'string')
      return `'${key}' must be a string`
  }
  if (input.phone !== undefined && !/^\d{11,12}$/.test(String(input.phone))) {
    return "'phone' must hold 11 or 12 digits"
  }
  if (input.kind !== undefined && !MESSAGE_KINDS.includes(input.kind)) {
    return `'kind' must be one of ${MESSAGE_KINDS.join(', ')}`
  }
  return null
}

function messageData(text, kind) {
  const type = kind ?? (LINK.test(text) ? 'extended' : 'text')
  if (type === 'image') {
    return {
      typeMessage: 'imageMessage',
      fileMessageData: {
        downloadUrl: '',
        caption: text,
        fileName: 'photo.jpg',
        jpegThumbnail: '',
        mimeType: 'image/jpeg',
        isForwarded: false,
        forwardingScore: 0,
      },
    }
  }
  if (type === 'extended') {
    return {
      typeMessage: 'extendedTextMessage',
      extendedTextMessageData: {
        text,
        description: '',
        title: '',
        jpegThumbnail: '',
        isForwarded: false,
        forwardingScore: 0,
      },
    }
  }
  return { typeMessage: 'textMessage', textMessageData: { textMessage: text } }
}

function send(res, status, body = '', type = JSON_TYPE) {
  if (res.headersSent || res.destroyed) return
  const headers = { ...BASE_HEADERS }
  if (status === 204) {
    res.writeHead(status, headers)
    res.end()
    return
  }
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  headers['content-type'] = type
  headers['content-length'] = Buffer.byteLength(payload)
  res.writeHead(status, headers)
  res.end(payload)
}

function readJson(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) chunks.push(chunk)
    })
    req.on('error', rejectBody)
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) {
        resolveBody({ error: [500, 'request entity too large', TEXT_TYPE] })
        return
      }
      const text = Buffer.concat(chunks).toString('utf8')
      if (text.trim() === '') {
        resolveBody({ value: undefined })
        return
      }
      try {
        resolveBody({ value: JSON.parse(text) })
      } catch (error) {
        resolveBody({ error: [400, error.message, TEXT_TYPE] })
      }
    })
  })
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

class GreenApiMock {
  constructor(config) {
    this.config = config
    this.timers = new Set()
    this.waiters = new Set()
    this.messageSeq = 0
    this.nextReceiptId = 1
    this.reset()
  }

  reset(overrides = {}) {
    this.dispose()
    this.options = { ...this.config, ...overrides }
    const flag = this.options.notifications === 'on' ? 'yes' : 'no'
    this.settings = {
      wid: OWN_WID,
      typeInstance: 'v3',
      webhookUrl: '',
      webhookUrlToken: '',
      delaySendMessagesMilliseconds: 0,
      markIncomingMessagesReaded: 'no',
      markIncomingMessagesReadedOnReply: 'no',
      outgoingWebhook: flag,
      outgoingMessageWebhook: flag,
      outgoingAPIMessageWebhook: flag,
      stateWebhook: flag,
      incomingWebhook: flag,
      editedMessageWebhook: 'no',
      deletedMessageWebhook: 'no',
      pollMessageWebhook: 'no',
      downloadUrlJpeg: 'no',
      ...this.options.settings,
    }
    this.pendingSettings = null
    this.applyTimer = null
    this.stateInstance = this.options.stateInstance
    this.stateAfterRestart = this.stateInstance
    this.lastCalls = new Map()
    this.queue = []
    this.chats = new Set()
    this.contacts = new Map()
    this.checkedPhones = new Set()
    this.held = []
    this.failures = new Map()
    this.requests = []
    this.sent = []
  }

  dispose() {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    this.releaseWaiters()
  }

  later(ms, task) {
    const timer = setTimeout(() => {
      this.timers.delete(timer)
      task()
    }, ms)
    this.timers.add(timer)
    return timer
  }

  releaseWaiters() {
    for (const finish of [...this.waiters]) finish(null)
  }

  flagOn(name) {
    return this.settings.webhookUrl === '' && this.settings[name] === 'yes'
  }

  anyNotifications() {
    return NOTIFICATION_FLAGS.some((name) => this.flagOn(name))
  }

  instanceData() {
    return { idInstance: Number(this.config.idInstance), wid: OWN_WID, typeInstance: 'v3' }
  }

  nextMessageId() {
    this.messageSeq = (this.messageSeq + 1) % 1000
    return `${Date.now()}${String(this.messageSeq).padStart(3, '0')}`
  }

  enqueue(body) {
    this.queue.push({ receiptId: this.nextReceiptId++, body, received: false })
    const head = this.queue[0]
    for (const finish of [...this.waiters]) finish(head)
    return true
  }

  nextNotification(timeoutMs, signal) {
    if (this.queue.length > 0 || signal.aborted) return Promise.resolve(this.queue[0] ?? null)
    return new Promise((resolveWait) => {
      const finish = (notification) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        this.waiters.delete(finish)
        resolveWait(notification)
      }
      const onAbort = () => finish(null)
      const timer = setTimeout(() => finish(this.queue[0] ?? null), timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      this.waiters.add(finish)
    })
  }

  contact(chatId) {
    return this.contacts.get(chatId) ?? newContact(chatId)
  }

  remember(chatId, details) {
    const contact = { ...this.contact(chatId) }
    for (const [key, value] of Object.entries(details)) {
      if (value) contact[key] = value
    }
    this.contacts.set(chatId, contact)
  }

  admit(chatId) {
    if (this.chats.has(chatId)) return true
    if (this.options.quota > 0 && this.chats.size >= this.options.quota) return false
    this.chats.add(chatId)
    return true
  }

  quotaStatus() {
    const chats = [...this.chats].join(', ')
    return {
      method: 'correspondents',
      used: this.chats.size,
      total: this.options.quota,
      status: 'CORRESPONDENTS_QUOTA_EXCEEDED',
      description: `Monthly quota has been exceeded. You can only send or receive messages from following chats: ${chats}. Please go to your personal account and change the tariff to business ${CONSOLE_URL}`,
    }
  }

  rejectByQuota() {
    const quotaData = this.quotaStatus()
    if (this.anyNotifications()) {
      this.enqueue({ typeWebhook: 'quotaExceeded', instanceData: this.instanceData(), quotaData })
    }
    return quotaData
  }

  messageBody(typeWebhook, { chatId, idMessage, timestamp, text, kind, senderName = '' }) {
    const contact = this.contact(chatId)
    const group = chatId.startsWith('-')
    return {
      typeWebhook,
      instanceData: this.instanceData(),
      timestamp,
      idMessage,
      senderData: {
        chatId,
        chatName: contact.chatName || (group ? '' : contact.name),
        chatType: group ? 'group' : 'user',
        sender: group ? numericId(`member:${senderName}`) : chatId,
        senderName: group ? senderName : contact.name,
        senderType: 'user',
        senderContactName: group ? '' : contact.name,
        senderPhoneNumber: group || contact.phone === '' ? 0 : Number(contact.phone),
      },
      messageData: messageData(text, kind),
    }
  }

  statusBody(chatId, idMessage, status, description) {
    const body = {
      typeWebhook: 'outgoingMessageStatus',
      chatId,
      instanceData: this.instanceData(),
      timestamp: nowSeconds(),
      idMessage,
      status,
    }
    if (description) body.description = description
    return body
  }

  queueMessage(typeWebhook, message) {
    if (!this.flagOn(MESSAGE_FLAGS[typeWebhook])) return false
    return this.enqueue(this.messageBody(typeWebhook, message))
  }

  scheduleStatuses(chatId, idMessage) {
    for (const [status, delay] of [
      ['delivered', this.options.deliveredMs],
      ['read', this.options.readMs],
    ]) {
      this.later(delay, () => {
        if (this.flagOn('outgoingWebhook')) this.enqueue(this.statusBody(chatId, idMessage, status))
      })
    }
  }

  dispatchSent(message) {
    const { chatId, idMessage, exists } = message
    if (!exists) {
      this.later(this.options.deliveredMs, () => {
        if (!this.anyNotifications()) return
        const description = 'The recipient does not have a MAX account'
        this.enqueue(this.statusBody(chatId, idMessage, 'noAccount', description))
      })
      return
    }
    const kind = this.options.echoKind === 'extended' ? 'extended' : undefined
    this.later(this.options.echoMs, () =>
      this.queueMessage('outgoingAPIMessageReceived', { ...message, kind }),
    )
    this.scheduleStatuses(chatId, idMessage)
    if (this.options.autoReply) {
      this.later(this.options.autoReplyMs, () => this.receive({ chatId, text: AUTOREPLY_TEXT }))
    }
  }

  receive({ chatId, text, senderName = '', chatName = '', phone = '', kind }) {
    const group = chatId.startsWith('-')
    this.remember(chatId, group ? { chatName } : { name: senderName, chatName, phone })
    if (!this.admit(chatId)) {
      this.rejectByQuota()
      return { queued: false, reason: 'quota' }
    }
    const idMessage = this.nextMessageId()
    const message = { chatId, idMessage, timestamp: nowSeconds(), text, kind, senderName }
    return { queued: this.queueMessage('incomingMessageReceived', message), idMessage }
  }

  phoneMessage({ chatId, text }) {
    this.remember(chatId, {})
    if (!this.admit(chatId)) {
      this.rejectByQuota()
      return { queued: false, reason: 'quota' }
    }
    const idMessage = this.nextMessageId()
    const message = { chatId, idMessage, timestamp: nowSeconds(), text }
    const queued = this.queueMessage('outgoingMessageReceived', message)
    this.scheduleStatuses(chatId, idMessage)
    return { queued, idMessage }
  }

  setState(stateInstance) {
    this.stateInstance = stateInstance
    const queued =
      this.flagOn('stateWebhook') &&
      this.enqueue({
        typeWebhook: 'stateInstanceChanged',
        instanceData: this.instanceData(),
        timestamp: nowSeconds(),
        stateInstance,
      })
    if (stateInstance === 'authorized') {
      for (const message of this.held.splice(0)) this.dispatchSent(message)
    }
    return queued
  }

  setSettings(body) {
    if (!isObject(body) || Object.keys(body).length === 0) {
      return validation('at least one setting is required')
    }
    for (const [key, value] of Object.entries(body)) {
      const problem = settingProblem(key, value)
      if (problem) return validation(problem)
    }
    this.pendingSettings = { ...this.pendingSettings, ...body }
    // The real service restarts the instance on setSettings: it is starting until the settings apply.
    if (this.applyTimer) {
      clearTimeout(this.applyTimer)
      this.timers.delete(this.applyTimer)
    } else {
      this.stateAfterRestart = this.stateInstance === 'starting' ? 'authorized' : this.stateInstance
      this.setState('starting')
    }
    const apply = () => {
      this.applyTimer = null
      Object.assign(this.settings, this.pendingSettings)
      this.pendingSettings = null
      this.setState(this.stateAfterRestart)
    }
    if (this.options.applyMs > 0) this.applyTimer = this.later(this.options.applyMs, apply)
    else apply()
    return [200, { saveSettings: true }]
  }

  checkAccount(body) {
    if (!isObject(body) || body.phoneNumber === undefined) {
      return validation("'phoneNumber' is required")
    }
    const extra = unknownField(body, CHECK_FIELDS)
    if (extra) return validation(`'${extra}' is not allowed`)
    const digits = phoneDigits(body.phoneNumber)
    if (digits === null) return validation("Wrong format. 'phoneNumber' must contain only digits")
    if (!isSupportedPhone(digits))
      return [400, 'bad phone number, valid 11 or 12 digits', TEXT_TYPE]
    if (this.stateInstance !== 'authorized') {
      return [200, { status: false, reason: 'instance is starting or not authorized' }]
    }
    const fromCache = body.force !== true && this.checkedPhones.has(digits)
    this.checkedPhones.add(digits)
    if (digits.endsWith('0000')) return [200, { exist: false, chatId: '', fromCache }]
    const chatId = chatIdForPhone(digits)
    this.remember(chatId, { phone: digits })
    return [200, { exist: true, chatId, fromCache }]
  }

  sendMessage(body) {
    if (!isObject(body) || body.chatId === undefined) return validation("'chatId' is required")
    const extra = unknownField(body, SEND_FIELDS)
    if (extra) return validation(`'${extra}' is not allowed`)
    const { chatId, message } = body
    if (typeof chatId !== 'string') return validation("'chatId' must be a string")
    if (message === undefined) return validation("'message' is required")
    if (typeof message !== 'string') return validation("'message' must be a string")
    if (message === '') return validation("'message' is not allowed to be empty")
    if (message.length > MAX_MESSAGE_LENGTH) {
      return validation("'message' length must be less than or equal to 4000 characters long")
    }
    const target = resolveChat(chatId)
    if (!target) {
      return validation("'chatId' must be one of the next formats: 'phone_number@c.us' or 'chatId'")
    }
    if (!this.admit(chatId)) return [466, { correspondentsStatus: this.rejectByQuota() }]
    this.remember(target.chatId, { phone: target.phone })
    const idMessage = this.nextMessageId()
    const timestamp = nowSeconds()
    this.sent.push({ idMessage, chatId, message, timestamp })
    const outgoing = { ...target, idMessage, timestamp, text: message }
    if (this.stateInstance === 'authorized') this.dispatchSent(outgoing)
    else this.held.push(outgoing)
    return [200, { idMessage }]
  }

  webhookUrlError() {
    const text = `Message cannot be received because custom webhook url is set. Go to cabinet, clear webhook url for instance: ${this.config.idInstance} and wait for about 1 minute for another attempt`
    return [400, text, TEXT_TYPE]
  }

  async receiveNotification(url, signal) {
    if (this.settings.webhookUrl !== '') return this.webhookUrlError()
    const raw = url.searchParams.get('receiveTimeout')
    const seconds = raw === null || raw === '' ? 5 : Number(raw)
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 60) {
      return validation("'receiveTimeout' must be an integer from 5 to 60")
    }
    const notification = await this.nextNotification(seconds * 1000, signal)
    if (!notification) return [200, 'null']
    notification.received = true
    return [200, { receiptId: notification.receiptId, body: notification.body }]
  }

  deleteNotification(receiptId) {
    if (this.settings.webhookUrl !== '') return this.webhookUrlError()
    if (!/^\d+$/.test(receiptId)) return [400, 'Parameter receiptId must be a Number!', TEXT_TYPE]
    const id = Number(receiptId)
    const index = this.queue.findIndex((item) => item.received && item.receiptId === id)
    if (index === -1) {
      return [200, { result: false, reason: `Notification with receiptId ${receiptId} not found` }]
    }
    this.queue.splice(index, 1)
    return [200, { result: true, reason: '' }]
  }

  takeFailure(method) {
    const rule = this.failures.get(method)
    if (!rule) return null
    rule.count -= 1
    if (rule.count <= 0) this.failures.delete(method)
    if (rule.body !== undefined) {
      return [rule.status, rule.body, typeof rule.body === 'string' ? TEXT_TYPE : JSON_TYPE]
    }
    switch (rule.status) {
      case 401:
        return [401, '']
      case 404:
        return [404, NOT_FOUND_PAGE, HTML_TYPE]
      case 466:
        return [466, this.quotaFailureBody(method)]
      case 469:
        return [469, 'User get contact info limit reached', TEXT_TYPE]
      default:
        return [rule.status, STATUS_CODES[rule.status] ?? 'Error', TEXT_TYPE]
    }
  }

  quotaFailureBody(method) {
    if (method !== 'checkAccount') return { correspondentsStatus: this.quotaStatus() }
    return {
      invokeStatus: {
        method,
        used: 100,
        total: 100,
        status: 'QUOTE_EXCEEDED',
        description: `Monthly quota has been exceeded. Please go to your console and change the tariff to business ${CONSOLE_URL}`,
      },
    }
  }

  addFailure(input) {
    const method =
      typeof input.method === 'string' ? API_METHODS.get(input.method.toLowerCase()) : undefined
    if (!method) {
      const names = [...API_METHODS.values()].map((item) => item.name).join(', ')
      return badRequest(`'method' must be one of ${names}`)
    }
    if (!Number.isInteger(input.status) || input.status < 400 || input.status > 599) {
      return badRequest("'status' must be an HTTP error status from 400 to 599")
    }
    const count = input.count ?? 1
    if (!isCount(count)) return badRequest("'count' must be a non-negative integer")
    if (count === 0) this.failures.delete(method.name)
    else this.failures.set(method.name, { status: input.status, count, body: input.body })
    // A poll that is already waiting would hide the failure for up to receiveTimeout seconds.
    if (method.name === 'receiveNotification') this.releaseWaiters()
    return [200, { ok: true }]
  }

  snapshot() {
    return {
      stateInstance: this.stateInstance,
      settings: this.settings,
      pendingSettings: this.pendingSettings,
      chats: [...this.chats],
      contacts: Object.fromEntries(this.contacts),
      queue: this.queue.map(({ receiptId, body }) => ({ receiptId, body })),
      requests: this.requests,
      sent: this.sent,
    }
  }

  control(pathname, input) {
    switch (pathname) {
      case '/__mock/reset': {
        const problem = optionsProblem(input)
        if (problem) return badRequest(problem)
        this.reset(input)
        return [200, { ok: true }]
      }
      case '/__mock/incoming': {
        const problem = messageProblem(input) ?? incomingProblem(input)
        if (problem) return badRequest(problem)
        const phone = input.phone === undefined ? '' : String(input.phone)
        return [200, this.receive({ ...input, phone })]
      }
      case '/__mock/phone-message': {
        const problem = messageProblem(input)
        if (problem) return badRequest(problem)
        return [200, this.phoneMessage(input)]
      }
      case '/__mock/state': {
        if (!INSTANCE_STATES.includes(input.stateInstance)) {
          return badRequest(`'stateInstance' must be one of ${INSTANCE_STATES.join(', ')}`)
        }
        return [200, { ok: true, queued: this.setState(input.stateInstance) }]
      }
      case '/__mock/fail':
        return this.addFailure(input)
      default:
        return [404, { error: `Unknown mock route POST ${pathname}` }]
    }
  }

  rateLimited(method) {
    if (!this.options.rateLimit || !ONE_PER_SECOND_METHODS.has(method)) return false
    const now = Date.now()
    if (now - (this.lastCalls.get(method) ?? -Infinity) < RATE_WINDOW_MS) return true
    this.lastCalls.set(method, now)
    return false
  }

  record(entry) {
    this.requests.push(entry)
    if (this.requests.length > MAX_LOG_ENTRIES) this.requests.shift()
  }

  async handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (req.method === 'OPTIONS') return send(res, 204)
    if (url.pathname.startsWith('/__mock/')) return this.handleControl(req, res, url)
    return this.handleApi(req, res, url)
  }

  async handleControl(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/__mock/log') {
      return send(res, 200, this.snapshot())
    }
    if (req.method !== 'POST') {
      return send(res, 404, { error: `Unknown mock route ${req.method} ${url.pathname}` })
    }
    const parsed = await readJson(req)
    if (parsed.error) return send(res, 400, { error: parsed.error[1] })
    const input = parsed.value ?? {}
    if (!isObject(input)) return send(res, 400, { error: 'Expected a JSON object' })
    const [status, body] = this.control(url.pathname, input)
    return send(res, status, body)
  }

  async handleApi(req, res, url) {
    const match = API_PATH.exec(url.pathname)
    const method = match ? API_METHODS.get(match[2].toLowerCase()) : undefined
    const entry = {
      at: new Date().toISOString(),
      method: method?.name ?? null,
      httpMethod: req.method,
      status: 0,
      query: Object.fromEntries(url.searchParams),
      receiptId: match?.[4],
      body: undefined,
    }
    const reply = ([status, body, type]) => {
      entry.status = status
      this.record(entry)
      send(res, status, body, type)
    }
    if (!match || !method) return reply([404, NOT_FOUND_PAGE, HTML_TYPE])
    const [, id, , token, receiptId] = match
    if (id !== this.config.idInstance || safeDecode(token) !== this.config.token) {
      return reply([401, ''])
    }
    const needsReceipt = method.name === 'deleteNotification'
    if (req.method !== method.verb || needsReceipt !== (receiptId !== undefined)) {
      return reply([404, NOT_FOUND_PAGE, HTML_TYPE])
    }
    let body
    if (method.verb === 'POST') {
      const parsed = await readJson(req)
      if (parsed.error) return reply(parsed.error)
      body = parsed.value
      entry.body = body
    }
    if (this.rateLimited(method.name)) return reply([429, STATUS_CODES[429], TEXT_TYPE])
    const failure = this.takeFailure(method.name)
    if (failure) return reply(failure)
    switch (method.name) {
      case 'getStateInstance':
        return reply([200, { stateInstance: this.stateInstance }])
      case 'getSettings':
        return reply([200, this.settings])
      case 'setSettings':
        return reply(this.setSettings(body))
      case 'checkAccount':
        return reply(this.checkAccount(body))
      case 'sendMessage':
        return reply(this.sendMessage(body))
      case 'receiveNotification': {
        const gone = new AbortController()
        res.on('close', () => gone.abort())
        return reply(await this.receiveNotification(url, gone.signal))
      }
      default:
        return reply(this.deleteNotification(receiptId))
    }
  }
}

export async function start(options = {}) {
  const { silent = false, ...overrides } = options
  const config = { ...configFromEnv(), ...overrides }
  config.idInstance = String(config.idInstance)
  const mock = new GreenApiMock(config)
  const server = createServer((req, res) => {
    mock.handle(req, res).catch((error) => {
      send(res, 500, `Internal Server Error: ${error.message}`, TEXT_TYPE)
    })
  })
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(config.port, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : config.port
  const url = `http://localhost:${port}`
  if (!silent) {
    console.log(
      `GREEN-API mock listening on ${url}, idInstance ${config.idInstance}, token ${config.token}`,
    )
  }
  const stop = () =>
    new Promise((resolveStop) => {
      mock.dispose()
      server.close(() => resolveStop())
      server.closeAllConnections()
    })
  return { url, port, mock, stop }
}

function isEntryPoint() {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url)
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  try {
    const instance = await start()
    const shutdown = () => instance.stop().then(() => process.exit(0))
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  } catch (error) {
    console.error(`GREEN-API mock failed to start: ${error.message}`)
    process.exitCode = 1
  }
}
