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
      if (error.code === 'auth' && failures.length > 0) throw asFallbackRejection(error)
      if (!NEXT_HOST_CODES.has(error.code)) throw error
      failures.push(error)
    }
  }
  const lastFailure = failures.at(-1)
  if (!lastFailure || failures.every((failure) => failure.code === 'network')) {
    throw new GreenApiError('network', UNREACHABLE_MESSAGE)
  }
  if (failures.length > 1 && lastFailure.code !== 'network') throw asFallbackRejection(lastFailure)
  throw lastFailure
}

/**
 * A host tried after a failed one may reject an id it does not serve (the generic host answers 401 to any id), so
 * its rejection proves neither a wrong token nor a wrong id.
 */
function asFallbackRejection(error: GreenApiError): GreenApiError {
  return new GreenApiError(error.code, FALLBACK_REJECTION_MESSAGE, error.status)
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
