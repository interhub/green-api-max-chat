import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { start } from './greenapi-mock.mjs'

const ID = '3100000001'
const TOKEN = 'poll-token'
let server

before(async () => {
  server = await start({ port: 0, silent: true, idInstance: ID, token: TOKEN, notifications: 'on' })
})

after(() => server.stop())

beforeEach(() => control('reset'))

function receive(seconds, signal) {
  const url = `${server.url}/waInstance${ID}/receiveNotification/${TOKEN}?receiveTimeout=${seconds}`
  return fetch(url, { signal })
}

function control(route, body = {}) {
  return fetch(`${server.url}/__mock/${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

test('waits receiveTimeout seconds and answers null when nothing arrives', async () => {
  const started = Date.now()
  const response = await receive(5)
  const elapsed = Date.now() - started
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'null')
  assert.ok(elapsed >= 4900 && elapsed < 7000, `waited ${elapsed} ms`)
})

test('answers a waiting request as soon as a notification arrives', async () => {
  const started = Date.now()
  const pending = receive(20)
  await sleep(200)
  await control('incoming', { chatId: '10000000', text: 'Сейчас' })
  const response = await pending
  const elapsed = Date.now() - started
  const { body } = await response.json()
  assert.equal(body.messageData.textMessageData.textMessage, 'Сейчас')
  assert.ok(elapsed >= 150 && elapsed < 2000, `answered after ${elapsed} ms`)
})

test('forgets a request whose client went away and keeps the notification', async () => {
  const controller = new AbortController()
  const pending = receive(20, controller.signal).catch((error) => error.name)
  await sleep(100)
  controller.abort()
  assert.equal(await pending, 'AbortError')
  await sleep(50)
  assert.equal(server.mock.waiters.size, 0)
  await control('incoming', { chatId: '10000000', text: 'Не потеряно' })
  const { body } = await (await receive(5)).json()
  assert.equal(body.messageData.textMessageData.textMessage, 'Не потеряно')
})

test('a receiveNotification failure releases the waiting request at once', async () => {
  const pending = receive(20)
  await sleep(100)
  await control('fail', { method: 'receiveNotification', status: 500, count: 1 })
  const released = await pending
  assert.equal(await released.text(), 'null')
  const failed = await receive(5)
  assert.equal(failed.status, 500)
  assert.equal(await failed.text(), 'Internal Server Error')
})

test('rejects receiveTimeout outside 5..60 seconds', async () => {
  for (const seconds of [4, 61, 'x']) {
    const response = await receive(seconds)
    assert.equal(response.status, 400)
    assert.match(await response.text(), /'receiveTimeout' must be an integer from 5 to 60/)
  }
})
