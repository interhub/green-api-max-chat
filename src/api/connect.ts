import type { GreenApiClient, GreenApiErrorCode, InstanceState } from '@/types'
import { createClient } from './client'
import { GreenApiError, isGreenApiError } from './errors'
import { resolveApiUrls } from './hosts'

export interface ConnectInput {
  idInstance: string
  apiTokenInstance: string
  /** Optional API host. Detected from idInstance when empty. */
  apiUrl?: string
}

export interface Connection {
  client: GreenApiClient
  state: InstanceState
}

const RATE_LIMIT_PAUSE_MS = 1100
/** Answers of a host that may not serve this idInstance: the next candidate can still work. */
const NEXT_HOST_CODES = new Set<GreenApiErrorCode>(['wrongHost', 'network', 'forbidden'])
/**
 * The generic host also answers 401 for an id it does not serve, so after a failed shard host its rejection
 * proves neither a wrong token nor a wrong id.
 */
const FALLBACK_REJECTION_CODES = new Set<GreenApiErrorCode>(['auth', 'forbidden', 'wrongHost'])
const FALLBACK_REJECTION_MESSAGE =
  'Неверный idInstance или apiTokenInstance. Если данные верны, укажите API URL из личного кабинета.'
const UNREACHABLE_MESSAGE =
  'Не удалось подключиться к GREEN-API. Проверьте интернет или укажите API URL из личного кабинета.'

/** Checks the credentials with getStateInstance and finds the host that serves the instance. */
export async function connect(input: ConnectInput, signal?: AbortSignal): Promise<Connection> {
  const idInstance = input.idInstance.trim()
  const apiTokenInstance = input.apiTokenInstance.trim()
  if (!/^\d+$/.test(idInstance)) {
    throw new GreenApiError('validation', 'Введите idInstance: только цифры.')
  }
  if (!apiTokenInstance) throw new GreenApiError('validation', 'Введите apiTokenInstance.')

  const failures: GreenApiError[] = []
  for (const apiUrl of resolveApiUrls(idInstance, input.apiUrl)) {
    const client = createClient({ idInstance, apiTokenInstance, apiUrl })
    try {
      return { client, state: await readState(client, signal) }
    } catch (error) {
      if (!isGreenApiError(error)) throw error
      if (failures.length > 0 && FALLBACK_REJECTION_CODES.has(error.code)) {
        throw new GreenApiError(error.code, FALLBACK_REJECTION_MESSAGE, error.status)
      }
      if (!NEXT_HOST_CODES.has(error.code)) throw error
      failures.push(error)
    }
  }
  const lastFailure = failures.at(-1)
  if (lastFailure && failures.some((failure) => failure.code !== 'network')) throw lastFailure
  throw new GreenApiError('network', UNREACHABLE_MESSAGE)
}

async function readState(client: GreenApiClient, signal?: AbortSignal): Promise<InstanceState> {
  try {
    return await client.getStateInstance(signal)
  } catch (error) {
    if (!isGreenApiError(error) || error.code !== 'rateLimit') throw error
    await pause(RATE_LIMIT_PAUSE_MS, signal)
    return client.getStateInstance(signal)
  }
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(new GreenApiError('aborted', ''))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    if (signal?.aborted) onAbort()
    else signal?.addEventListener('abort', onAbort, { once: true })
  })
}
