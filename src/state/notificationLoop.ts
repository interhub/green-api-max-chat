import { isGreenApiError, mapNotification } from '@/api'
import { sleep } from '@/lib/async'
import type { AppEvent, GreenApiClient, ReceivedNotification } from '@/types'

export const RECEIVE_TIMEOUT_SECONDS = 20
const REMEMBERED_RECEIPTS = 50
const WEBHOOK_URL_PAUSE_MS = 10_000
const INSTANCE_PAUSE_MS = 10_000
const RATE_LIMIT_PAUSE_MS = 2_000
const FIRST_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 15_000

export interface NotificationHandlers {
  onEvent(event: AppEvent): void
  /** The first successful receive after errors. */
  onOnline(): void
  onOffline(): void
  onWebhookUrlSet(): void
  /** GREEN-API answered, but the instance is starting or not authorized (HTTP 400): not a connection problem. */
  onInstanceNotReady(state: 'starting' | 'notAuthorized'): void
  /** Wrong apiTokenInstance or idInstance: the loop has stopped. */
  onAuthError(): void
}

/** Receives and deletes notifications one by one until the signal aborts or the credentials are rejected. Never throws. */
export async function runNotificationLoop(
  client: GreenApiClient,
  handlers: NotificationHandlers,
  signal: AbortSignal,
): Promise<void> {
  const recentReceipts: number[] = []
  let failedAttempts = 0
  let failing = false

  while (!signal.aborted) {
    let notification: ReceivedNotification | null
    try {
      notification = await client.receiveNotification(RECEIVE_TIMEOUT_SECONDS, signal)
    } catch (error) {
      const code = isGreenApiError(error) ? error.code : 'unknown'
      if (signal.aborted || code === 'aborted') return
      if (code === 'auth' || code === 'forbidden') {
        handlers.onAuthError()
        return
      }
      failing = true
      if (code === 'webhookUrlSet') {
        handlers.onWebhookUrlSet()
        await sleep(WEBHOOK_URL_PAUSE_MS, signal)
      } else if (code === 'instance') {
        // The client words the reason in Russian: "инстанс запускается" or "не авторизован" and the like.
        const starting = isGreenApiError(error) && error.message.includes('запускается')
        handlers.onInstanceNotReady(starting ? 'starting' : 'notAuthorized')
        await sleep(INSTANCE_PAUSE_MS, signal)
      } else if (code === 'rateLimit') {
        await sleep(RATE_LIMIT_PAUSE_MS, signal)
      } else {
        handlers.onOffline()
        await sleep(Math.min(FIRST_BACKOFF_MS * 2 ** failedAttempts, MAX_BACKOFF_MS), signal)
        failedAttempts += 1
      }
      continue
    }

    if (signal.aborted) return
    if (failing) {
      failing = false
      failedAttempts = 0
      handlers.onOnline()
    }
    if (!notification) continue

    const { receiptId, body } = notification
    if (!recentReceipts.includes(receiptId)) {
      recentReceipts.push(receiptId)
      if (recentReceipts.length > REMEMBERED_RECEIPTS) recentReceipts.shift()
      handleBody(body, handlers)
    }
    await deleteWithRetry(client, receiptId, signal)
  }
}

function handleBody(body: unknown, handlers: NotificationHandlers): void {
  try {
    const event = mapNotification(body)
    if (event) handlers.onEvent(event)
  } catch {
    // A body the app cannot read must not block the queue: it is deleted like any other.
  }
}

/** The queue hands out the next notification only after this one is deleted, so a network error gets one more try. */
async function deleteWithRetry(
  client: GreenApiClient,
  receiptId: number,
  signal: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await client.deleteNotification(receiptId, signal)
      return
    } catch (error) {
      if (!isGreenApiError(error) || error.code !== 'network') return
    }
  }
}
