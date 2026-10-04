import { vi } from 'vitest'

/** The part of Response that the client reads. */
export interface FakeResponse {
  status: number
  text(): Promise<string>
}

export type FetchReply = FakeResponse | Error | ((init: RequestInit) => Promise<FakeResponse>)

export function reply(status: number, body = ''): FakeResponse {
  return { status, text: () => Promise.resolve(body) }
}

export function json(body: unknown, status = 200): FakeResponse {
  return reply(status, JSON.stringify(body))
}

/** A request that never gets an answer: it ends only when its signal aborts. */
export function hang(init: RequestInit): Promise<FakeResponse> {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
    if (init.signal?.aborted) abort()
    else init.signal?.addEventListener('abort', abort)
  })
}

/** Replaces the global fetch with a stub that answers the requests with the replies in order. */
export function stubFetch(...replies: FetchReply[]) {
  const queue = [...replies]
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const next = queue.shift()
    if (next === undefined) throw new Error(`Unexpected request: ${url}`)
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next(init) : next
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export type FetchMock = ReturnType<typeof stubFetch>

export function requestAt(fetchMock: FetchMock, index = 0): { url: string; init: RequestInit } {
  const call = fetchMock.mock.calls[index]
  if (!call) throw new Error(`Request ${index} was not sent`)
  return { url: call[0], init: call[1] ?? {} }
}

export function requestedUrls(fetchMock: FetchMock): string[] {
  return fetchMock.mock.calls.map(([url]) => url)
}
