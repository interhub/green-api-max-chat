import { vi } from 'vitest'
import { GreenApiError } from '@/api/errors'
import type {
  AppEvent,
  Credentials,
  GreenApiClient,
  InstanceSettings,
  ReceivedNotification,
} from '@/types'

export const testCredentials: Credentials = {
  idInstance: '3100000001',
  apiTokenInstance: 'test-token',
  apiUrl: 'https://3100.api.green-api.com',
}

export const enabledSettings: InstanceSettings = {
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  stateWebhook: 'yes',
}

type QueueItem = ReceivedNotification | GreenApiError | null

/** receiveNotification of an empty queue as GREEN-API answers it: null after receiveTimeout seconds. */
export function emptyLongPoll(receiveTimeout: number, signal?: AbortSignal): Promise<null> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new GreenApiError('aborted', ''))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve(null)
    }, receiveTimeout * 1000)
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * A GreenApiClient for tests. Every method is a vi.fn; receiveNotification serves a queue that the test fills and
 * waits (like the real long poll) until something is queued or the signal aborts.
 */
export function createFakeClient() {
  const queue: QueueItem[] = []
  const wakers = new Set<() => void>()
  const events = new Map<number, AppEvent>()
  let nextReceiptId = 1
  let sentMessages = 0
  let pendingReceives = 0

  function enqueue(item: QueueItem): void {
    queue.push(item)
    for (const wake of wakers) wake()
  }

  function waitForItem(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new GreenApiError('aborted', ''))
        return
      }
      const onAbort = () => {
        wakers.delete(wake)
        reject(new GreenApiError('aborted', ''))
      }
      const wake = () => {
        wakers.delete(wake)
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      wakers.add(wake)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  const client = {
    credentials: testCredentials,
    getStateInstance: vi.fn<GreenApiClient['getStateInstance']>(async () => 'authorized'),
    getSettings: vi.fn<GreenApiClient['getSettings']>(async () => ({ ...enabledSettings })),
    setSettings: vi.fn<GreenApiClient['setSettings']>(async () => undefined),
    checkAccount: vi.fn<GreenApiClient['checkAccount']>(async () => ({
      exists: true,
      chatId: '20000000',
    })),
    sendMessage: vi.fn<GreenApiClient['sendMessage']>(async () => {
      sentMessages += 1
      return { idMessage: `remote-${sentMessages}` }
    }),
    receiveNotification: vi.fn<GreenApiClient['receiveNotification']>(async (_timeout, signal) => {
      pendingReceives += 1
      try {
        while (queue.length === 0) await waitForItem(signal)
        const item = queue.shift() ?? null
        if (item instanceof GreenApiError) throw item
        return item
      } finally {
        pendingReceives -= 1
      }
    }),
    deleteNotification: vi.fn<GreenApiClient['deleteNotification']>(async () => undefined),
  } satisfies GreenApiClient

  return {
    client,
    /** Queues an event. Its body is the receiptId, which mapNotification below turns back into the event. */
    pushEvent(event: AppEvent): number {
      const receiptId = nextReceiptId
      nextReceiptId += 1
      events.set(receiptId, event)
      enqueue({ receiptId, body: receiptId })
      return receiptId
    },
    pushNotification(notification: ReceivedNotification | null): void {
      enqueue(notification)
    },
    pushError(error: GreenApiError): void {
      enqueue(error)
    },
    /** Implementation for the mocked mapNotification of "@/api". */
    mapNotification(body: unknown): AppEvent | null {
      return typeof body === 'number' ? (events.get(body) ?? null) : null
    },
    /** receiveNotification calls that are waiting right now: the number of live polling loops. */
    get pendingReceives(): number {
      return pendingReceives
    },
  }
}

export type FakeClient = ReturnType<typeof createFakeClient>
