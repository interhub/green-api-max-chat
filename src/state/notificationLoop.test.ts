import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mapNotification } from '@/api'
import { GreenApiError } from '@/api/errors'
import type { AppEvent, InstanceState } from '@/types'
import { RECEIVE_TIMEOUT_SECONDS, runNotificationLoop } from './notificationLoop'
import { createFakeClient, emptyLongPoll, type FakeClient } from './testing/fakeClient'

vi.mock('@/api', async () => {
  const errors = await import('@/api/errors')
  return { ...errors, mapNotification: vi.fn() }
})

function stateEvent(state: InstanceState): AppEvent {
  return { type: 'instanceState', state }
}

function createHandlers(log: string[] = []) {
  return {
    onEvent: vi.fn((event: AppEvent) => {
      log.push(event.type === 'instanceState' ? `event:${event.state}` : `event:${event.type}`)
    }),
    onOnline: vi.fn(),
    onOffline: vi.fn(),
    onWebhookUrlSet: vi.fn(),
    onInstanceNotReady: vi.fn(),
    onAuthError: vi.fn(),
  }
}

let fake: FakeClient
let controller: AbortController

function start(handlers = createHandlers()) {
  vi.mocked(mapNotification).mockImplementation(fake.mapNotification)
  const done = runNotificationLoop(fake.client, handlers, controller.signal)
  return { handlers, done }
}

function receiveCalls(): number {
  return fake.client.receiveNotification.mock.calls.length
}

function receiveTimeouts(): number[] {
  return fake.client.receiveNotification.mock.calls.map(([receiveTimeout]) => receiveTimeout)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(mapNotification).mockReset()
  fake = createFakeClient()
  controller = new AbortController()
})

afterEach(() => {
  controller.abort()
  vi.useRealTimers()
})

describe('runNotificationLoop', () => {
  it('handles notifications in order and deletes each one after its handler', async () => {
    const log: string[] = []
    fake.client.deleteNotification.mockImplementation(async (receiptId) => {
      log.push(`delete:${receiptId}`)
    })
    const first = fake.pushEvent(stateEvent('starting'))
    const second = fake.pushEvent(stateEvent('authorized'))
    start(createHandlers(log))
    await vi.advanceTimersByTimeAsync(0)
    expect(log).toEqual([
      `event:starting`,
      `delete:${first}`,
      `event:authorized`,
      `delete:${second}`,
    ])
    expect(fake.client.receiveNotification).toHaveBeenCalledWith(
      RECEIVE_TIMEOUT_SECONDS,
      controller.signal,
    )
    expect(fake.client.deleteNotification).toHaveBeenCalledWith(first, controller.signal)
  })

  it('polls again at once after an empty answer', async () => {
    fake.pushNotification(null)
    fake.pushNotification(null)
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(receiveCalls()).toBe(3)
    expect(handlers.onEvent).not.toHaveBeenCalled()
    expect(handlers.onOnline).not.toHaveBeenCalled()
  })

  it('does not handle a repeated receiptId again but deletes it again', async () => {
    const receiptId = fake.pushEvent(stateEvent('authorized'))
    fake.pushNotification({ receiptId, body: receiptId })
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(handlers.onEvent).toHaveBeenCalledOnce()
    expect(fake.client.deleteNotification).toHaveBeenCalledTimes(2)
  })

  it('deletes notifications the app cannot read and keeps going', async () => {
    fake.pushNotification({ receiptId: 70, body: { typeWebhook: 'somethingNew' } })
    vi.mocked(mapNotification).mockImplementationOnce(() => {
      throw new Error('broken body')
    })
    fake.pushNotification({ receiptId: 71, body: 'garbage' })
    fake.pushEvent(stateEvent('authorized'))
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.client.deleteNotification.mock.calls.map(([receiptId]) => receiptId)).toEqual([
      70, 71, 1,
    ])
    expect(handlers.onEvent).toHaveBeenCalledOnce()
    expect(handlers.onEvent).toHaveBeenCalledWith(stateEvent('authorized'))
  })

  it('retries a delete once after a network error and then gives up quietly', async () => {
    const network = new GreenApiError('network', 'Нет связи с GREEN-API.')
    fake.client.deleteNotification
      .mockRejectedValueOnce(network)
      .mockRejectedValueOnce(network)
      .mockRejectedValueOnce(
        new GreenApiError('server', 'Сервис GREEN-API временно недоступен.', 500),
      )
    fake.pushEvent(stateEvent('starting'))
    fake.pushEvent(stateEvent('authorized'))
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fake.client.deleteNotification.mock.calls.map(([receiptId]) => receiptId)).toEqual([
      1, 1, 2,
    ])
    expect(handlers.onEvent).toHaveBeenCalledTimes(2)
    expect(handlers.onOffline).not.toHaveBeenCalled()
  })

  it('backs off 1, 2, 4, 8 and then 15 seconds and resets the delay after a success', async () => {
    const offlineAt: number[] = []
    const handlers = createHandlers()
    handlers.onOffline.mockImplementation(() => {
      offlineAt.push(Date.now())
    })
    for (let index = 0; index < 6; index += 1) {
      fake.pushError(new GreenApiError('network', 'Нет связи с GREEN-API.'))
    }
    fake.pushNotification(null)
    fake.pushError(new GreenApiError('server', 'Сервис GREEN-API временно недоступен.', 502))
    fake.pushError(new GreenApiError('unknown', 'Неожиданный ответ GREEN-API (HTTP 418).', 418))
    const startedAt = Date.now()
    start(handlers)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(offlineAt.map((time) => time - startedAt)).toEqual([
      0, 1_000, 3_000, 7_000, 15_000, 30_000, 45_000, 46_000,
    ])
    expect(handlers.onOnline).toHaveBeenCalledOnce()
    expect(receiveCalls()).toBe(10)
  })

  it('polls with a 5 second timeout after any error until the first success', async () => {
    fake.pushError(new GreenApiError('network', 'Нет связи с GREEN-API.'))
    fake.pushError(
      new GreenApiError('rateLimit', 'Слишком много запросов. Подождите секунду.', 429),
    )
    fake.pushError(
      new GreenApiError('webhookUrlSet', 'В настройках инстанса указан webhookUrl.', 400),
    )
    fake.pushError(
      new GreenApiError('instance', 'Инстанс сейчас не готов: инстанс запускается.', 400),
    )
    fake.pushNotification(null)
    fake.pushNotification(null)
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(23_000)
    expect(receiveTimeouts()).toEqual([20, 5, 5, 5, 5, 20, 20])
    expect(handlers.onOnline).toHaveBeenCalledOnce()
  })

  it('reports the recovery when the first short poll ends, not after a full long poll', async () => {
    const onlineAt: number[] = []
    const handlers = createHandlers()
    handlers.onOnline.mockImplementation(() => {
      onlineAt.push(Date.now())
    })
    fake.client.receiveNotification
      .mockRejectedValueOnce(
        new GreenApiError('server', 'Сервис GREEN-API временно недоступен.', 500),
      )
      .mockRejectedValueOnce(new GreenApiError('network', 'Нет связи с GREEN-API.'))
      .mockImplementation(emptyLongPoll)
    const startedAt = Date.now()
    start(handlers)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(handlers.onOffline).toHaveBeenCalledTimes(2)
    expect(onlineAt.map((time) => time - startedAt)).toEqual([8_000])
    expect(receiveTimeouts()).toEqual([20, 5, 5, 20, 20])
  })

  it('waits 10 seconds after a webhookUrl error and reports the recovery', async () => {
    fake.pushError(
      new GreenApiError('webhookUrlSet', 'В настройках инстанса указан webhookUrl.', 400),
    )
    fake.pushNotification(null)
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(handlers.onWebhookUrlSet).toHaveBeenCalledOnce()
    expect(receiveCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(receiveCalls()).toBe(3)
    expect(handlers.onOnline).toHaveBeenCalledOnce()
    expect(handlers.onOffline).not.toHaveBeenCalled()
  })

  it.each([
    ['Инстанс сейчас не готов: инстанс запускается.', 'starting'],
    ['Инстанс сейчас не готов: инстанс запускается или не авторизован.', 'starting'],
    ['Инстанс сейчас не готов: инстанс не авторизован.', 'notAuthorized'],
  ])('reports "%s" as %s, waits 10 seconds and stays online', async (message, state) => {
    fake.pushError(new GreenApiError('instance', message, 400))
    fake.pushNotification(null)
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(9_999)
    expect(handlers.onInstanceNotReady).toHaveBeenCalledExactlyOnceWith(state)
    expect(receiveCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(receiveCalls()).toBe(3)
    expect(handlers.onOnline).toHaveBeenCalledOnce()
    expect(handlers.onOffline).not.toHaveBeenCalled()
  })

  it('waits 2 seconds after a rate limit without going offline', async () => {
    fake.pushError(
      new GreenApiError('rateLimit', 'Слишком много запросов. Подождите секунду.', 429),
    )
    const { handlers } = start()
    await vi.advanceTimersByTimeAsync(1_999)
    expect(receiveCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(receiveCalls()).toBe(2)
    expect(handlers.onOffline).not.toHaveBeenCalled()
  })

  it.each(['auth', 'forbidden'] as const)('stops on %s and reports it', async (code) => {
    fake.pushError(new GreenApiError(code, 'Неверный idInstance или apiTokenInstance.', 401))
    const { handlers, done } = start()
    await done
    expect(handlers.onAuthError).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(receiveCalls()).toBe(1)
  })

  it('returns on abort, also in the middle of a backoff pause', async () => {
    const waiting = start()
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await waiting.done
    expect(receiveCalls()).toBe(1)

    controller = new AbortController()
    fake.pushError(new GreenApiError('network', 'Нет связи с GREEN-API.'))
    const pausing = start()
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await pausing.done
    expect(receiveCalls()).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
