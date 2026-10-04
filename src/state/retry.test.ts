import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenApiError } from '@/api/errors'
import { withRateLimitRetry } from './retry'

vi.mock('@/api', () => import('@/api/errors'))

function rateLimit(): GreenApiError {
  return new GreenApiError('rateLimit', 'Слишком много запросов. Подождите секунду.', 429)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('withRateLimitRetry', () => {
  it('repeats the task after the pause while GREEN-API answers 429', async () => {
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(rateLimit())
      .mockResolvedValueOnce('ok')
    const result = withRateLimitRetry(task, 2, 1_000)
    await vi.advanceTimersByTimeAsync(999)
    expect(task).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe('ok')
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('gives up after the allowed retries', async () => {
    const task = vi.fn<() => Promise<string>>().mockRejectedValue(rateLimit())
    const assertion = expect(withRateLimitRetry(task, 1, 1_000)).rejects.toMatchObject({
      code: 'rateLimit',
    })
    await vi.advanceTimersByTimeAsync(1_000)
    await assertion
    expect(task).toHaveBeenCalledTimes(2)
  })

  it('does not retry other errors', async () => {
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(new GreenApiError('server', 'Сервис GREEN-API временно недоступен.', 500))
    await expect(withRateLimitRetry(task, 3, 1_000)).rejects.toMatchObject({ code: 'server' })
    expect(task).toHaveBeenCalledOnce()
  })
})
