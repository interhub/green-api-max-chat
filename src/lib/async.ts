/** Waits ms milliseconds. An abort ends the wait at once without an error: callers check signal.aborted afterwards. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal?.addEventListener('abort', finish, { once: true })
  })
}

let fallbackCounter = 0

/** A unique local id. crypto.randomUUID exists only in secure contexts (https, localhost), hence the fallback. */
export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackCounter += 1
  const random = Math.random().toString(36).slice(2, 10)
  return `${Date.now().toString(36)}-${fallbackCounter.toString(36)}-${random}`
}
