import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connect } from './connect'
import { hang, json, reply, requestedUrls, stubFetch } from './testing'

const INPUT = { idInstance: '3100000001', apiTokenInstance: 'token' }
const SHARD_STATE_URL = 'https://3100.api.green-api.com/waInstance3100000001/getStateInstance/token'
const GENERIC_STATE_URL = 'https://api.green-api.com/waInstance3100000001/getStateInstance/token'
const NGINX_404 =
  '<html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>'
const FALLBACK_REJECTION =
  'Неверный idInstance или apiTokenInstance. Если данные верны, укажите API URL из личного кабинета.'
/** An id of the MAX docs that is served by the 3100 shard although it starts with 3000. */
const DOCS_INPUT = { idInstance: '3000000001', apiTokenInstance: 'token' }
const docsStateUrl = (host: string) => `https://${host}/waInstance3000000001/getStateInstance/token`

const authorized = () => json({ stateInstance: 'authorized' })
const unreachable = () => new TypeError('Failed to fetch')

beforeEach(() => {
  vi.stubEnv('VITE_GREEN_API_URL', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('connect: host detection', () => {
  it('connects through the shard host of the idInstance', async () => {
    const fetchMock = stubFetch(authorized())

    const { client, state } = await connect({
      idInstance: ' 3100000001 ',
      apiTokenInstance: ' token ',
    })

    expect(state).toBe('authorized')
    expect(client.credentials).toEqual({
      idInstance: '3100000001',
      apiTokenInstance: 'token',
      apiUrl: 'https://3100.api.green-api.com',
    })
    expect(requestedUrls(fetchMock)).toEqual([SHARD_STATE_URL])
  })

  it('falls back to the generic host after a 404 of the shard', async () => {
    const fetchMock = stubFetch(reply(404, NGINX_404), json({ stateInstance: 'notAuthorized' }))

    const { client, state } = await connect(INPUT)

    expect(state).toBe('notAuthorized')
    expect(client.credentials.apiUrl).toBe('https://api.green-api.com')
    expect(requestedUrls(fetchMock)).toEqual([SHARD_STATE_URL, GENERIC_STATE_URL])
  })

  it('falls back to the generic host when the shard does not resolve', async () => {
    const fetchMock = stubFetch(unreachable(), authorized())

    await expect(connect(INPUT)).resolves.toMatchObject({ state: 'authorized' })
    expect(requestedUrls(fetchMock)).toEqual([SHARD_STATE_URL, GENERIC_STATE_URL])
  })

  it('falls back to the generic host after a 403 of the shard', async () => {
    const fetchMock = stubFetch(reply(403), authorized())

    await expect(connect(INPUT)).resolves.toMatchObject({ state: 'authorized' })
    expect(requestedUrls(fetchMock)).toEqual([SHARD_STATE_URL, GENERIC_STATE_URL])
  })

  it('stops at wrong credentials on the shard host', async () => {
    const fetchMock = stubFetch(reply(401))

    await expect(connect(INPUT)).rejects.toMatchObject({
      code: 'auth',
      status: 401,
      message: 'Неверный idInstance или apiTokenInstance.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a server error', 500, 'server'],
    ['a deleted instance', 400, 'instance'],
  ])('rethrows %s of the shard without trying the next host', async (_label, status, code) => {
    const fetchMock = stubFetch(reply(status, 'Instance is deleted'))

    await expect(connect(INPUT)).rejects.toMatchObject({ code, status })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['an unreachable shard', unreachable, 401, 'auth'],
    ['a 404 of the shard', () => reply(404, NGINX_404), 401, 'auth'],
    ['an unreachable shard', unreachable, 404, 'wrongHost'],
    ['a 404 of the shard', () => reply(404, NGINX_404), 403, 'forbidden'],
  ])(
    'does not blame the data alone when the generic host rejects them after %s (HTTP %i)',
    async (_label, shardAnswer, status, code) => {
      stubFetch(shardAnswer(), reply(status))

      await expect(connect(INPUT)).rejects.toMatchObject({
        code,
        status,
        message: FALLBACK_REJECTION,
      })
    },
  )

  it('tries the 3100 shard of the MAX docs when the shard of an id starting with 3 fails', async () => {
    const fetchMock = stubFetch(unreachable(), authorized())

    const { client } = await connect(DOCS_INPUT)

    expect(client.credentials.apiUrl).toBe('https://3100.api.green-api.com')
    expect(requestedUrls(fetchMock)).toEqual([
      docsStateUrl('3000.api.green-api.com'),
      docsStateUrl('3100.api.green-api.com'),
    ])
  })

  it.each([
    ['a 404', () => reply(404, NGINX_404)],
    ['a 403', () => reply(403)],
    ['no answer', unreachable],
  ])('goes on to the generic host after %s of the 3100 shard', async (_label, answer) => {
    const fetchMock = stubFetch(unreachable(), answer(), authorized())

    const { client } = await connect(DOCS_INPUT)

    expect(client.credentials.apiUrl).toBe('https://api.green-api.com')
    expect(requestedUrls(fetchMock)).toEqual([
      docsStateUrl('3000.api.green-api.com'),
      docsStateUrl('3100.api.green-api.com'),
      docsStateUrl('api.green-api.com'),
    ])
  })

  it('stops at a 401 of the 3100 shard without blaming the data alone', async () => {
    const fetchMock = stubFetch(unreachable(), reply(401))

    await expect(connect(DOCS_INPUT)).rejects.toMatchObject({
      code: 'auth',
      status: 401,
      message: FALLBACK_REJECTION,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('suggests the API URL when none of the three hosts serves the id', async () => {
    stubFetch(unreachable(), reply(404, NGINX_404), reply(404, NGINX_404))

    await expect(connect(DOCS_INPUT)).rejects.toMatchObject({
      code: 'wrongHost',
      status: 404,
      message: FALLBACK_REJECTION,
    })
  })

  it('explains that none of the three hosts could be reached', async () => {
    stubFetch(unreachable(), unreachable(), unreachable())

    await expect(connect(DOCS_INPUT)).rejects.toMatchObject({
      code: 'network',
      message:
        'Не удалось подключиться к GREEN-API. Проверьте интернет или укажите API URL из личного кабинета.',
    })
  })

  it('keeps the last error when only some hosts were unreachable', async () => {
    stubFetch(reply(404, NGINX_404), unreachable())

    await expect(connect(INPUT)).rejects.toMatchObject({
      code: 'network',
      message: 'Нет связи с GREEN-API.',
    })
  })

  it('explains that no host could be reached', async () => {
    stubFetch(unreachable(), unreachable())

    await expect(connect(INPUT)).rejects.toMatchObject({
      code: 'network',
      status: 0,
      message:
        'Не удалось подключиться к GREEN-API. Проверьте интернет или укажите API URL из личного кабинета.',
    })
  })

  it('uses only the API URL given by the user', async () => {
    const fetchMock = stubFetch(reply(404, NGINX_404))

    await expect(
      connect({ ...INPUT, apiUrl: ' https://7103.api.green-api.com/ ' }),
    ).rejects.toMatchObject({
      code: 'wrongHost',
      message: 'Этот адрес API не обслуживает указанный idInstance.',
    })
    expect(requestedUrls(fetchMock)).toEqual([
      'https://7103.api.green-api.com/waInstance3100000001/getStateInstance/token',
    ])
  })

  it('uses only VITE_GREEN_API_URL when it is set', async () => {
    vi.stubEnv('VITE_GREEN_API_URL', 'http://localhost:8787')
    const fetchMock = stubFetch(authorized())

    const { client } = await connect(INPUT)

    expect(client.credentials.apiUrl).toBe('http://localhost:8787')
    expect(requestedUrls(fetchMock)).toEqual([
      'http://localhost:8787/waInstance3100000001/getStateInstance/token',
    ])
  })
})

describe('connect: rate limit', () => {
  it('waits 1.1 seconds and asks the same host again', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(reply(429), authorized())

    const result = connect(INPUT)
    await vi.advanceTimersByTimeAsync(1_099)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await expect(result).resolves.toMatchObject({ state: 'authorized' })
    expect(requestedUrls(fetchMock)).toEqual([SHARD_STATE_URL, SHARD_STATE_URL])
  })

  it('gives up after the second rate limit', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(reply(429), reply(429))

    const assertion = expect(connect(INPUT)).rejects.toMatchObject({ code: 'rateLimit' })
    await vi.advanceTimersByTimeAsync(1_100)

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('connect: input and abort', () => {
  it.each([
    [
      'an idInstance with letters',
      { ...INPUT, idInstance: '31000x' },
      'Введите idInstance: только цифры.',
    ],
    ['an empty idInstance', { ...INPUT, idInstance: ' ' }, 'Введите idInstance: только цифры.'],
    ['an empty token', { ...INPUT, apiTokenInstance: '  ' }, 'Введите apiTokenInstance.'],
    [
      'an API URL without a scheme',
      { ...INPUT, apiUrl: '3100.api.green-api.com' },
      'Укажите API URL, начинающийся с https://',
    ],
  ])('rejects %s before any request', async (_label, input, message) => {
    const fetchMock = stubFetch()

    await expect(connect(input)).rejects.toMatchObject({ code: 'validation', message })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stops when the caller aborts', async () => {
    const fetchMock = stubFetch(hang)
    const controller = new AbortController()

    const result = connect(INPUT, controller.signal)
    controller.abort()

    await expect(result).rejects.toMatchObject({ code: 'aborted' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops when the caller aborts during the rate limit pause', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(reply(429))
    const controller = new AbortController()

    const assertion = expect(connect(INPUT, controller.signal)).rejects.toMatchObject({
      code: 'aborted',
    })
    await vi.advanceTimersByTimeAsync(500)
    controller.abort()

    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
