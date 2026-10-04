import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createId, sleep } from './async'

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves after the given time', async () => {
    const done = vi.fn()
    void sleep(1_000).then(done)
    await vi.advanceTimersByTimeAsync(999)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalledOnce()
  })

  it('resolves quietly as soon as the signal aborts and clears its timer', async () => {
    const controller = new AbortController()
    const done = vi.fn()
    void sleep(60_000, controller.signal).then(done)
    controller.abort()
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('resolves at once for a signal that is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sleep(60_000, controller.signal)).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('createId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()))
    expect(ids.size).toBe(100)
  })

  it('works without crypto.randomUUID on plain http pages', () => {
    vi.stubGlobal('crypto', {})
    const ids = new Set(Array.from({ length: 100 }, () => createId()))
    expect(ids.size).toBe(100)
    expect([...ids][0]).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]*$/)
  })
})
