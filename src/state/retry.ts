import { isGreenApiError } from '@/api'
import { sleep } from '@/lib/async'

/** Runs the task and repeats it after delayMs while GREEN-API answers 429, at most `retries` more times. */
export async function withRateLimitRetry<T>(
  task: () => Promise<T>,
  retries: number,
  delayMs: number,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      if (attempt >= retries || !isGreenApiError(error) || error.code !== 'rateLimit') throw error
    }
    await sleep(delayMs, signal)
  }
}
