import { GreenApiError } from './errors'

const GENERIC_API_URL = 'https://api.green-api.com'
/** The MAX docs call ids such as 3000000001 on this shard, although their first four digits differ. */
const MAX_DOCS_API_URL = 'https://3100.api.green-api.com'

/** API hosts to try for an idInstance, the most likely one first. */
export function resolveApiUrls(idInstance: string, apiUrl?: string): string[] {
  if (apiUrl?.trim()) return [normalizeApiUrl(apiUrl)]
  const envApiUrl = import.meta.env.VITE_GREEN_API_URL
  if (envApiUrl?.trim()) return [normalizeApiUrl(envApiUrl)]
  // A shard host is named after the first four digits of the id; ids without a shard live on the generic host.
  const shardApiUrl = `https://${idInstance.slice(0, 4)}.api.green-api.com`
  const docsApiUrls = idInstance.startsWith('3') ? [MAX_DOCS_API_URL] : []
  return [...new Set([shardApiUrl, ...docsApiUrls, GENERIC_API_URL])]
}

/** True for an http(s) URL: the value that normalizeApiUrl accepts. */
export function isApiUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(trimApiUrl(value))
}

/** Trims the value and strips trailing slashes. Throws a validation error unless it is an http(s) URL. */
export function normalizeApiUrl(value: string): string {
  if (!isApiUrl(value)) {
    throw new GreenApiError('validation', 'Укажите API URL, начинающийся с https://')
  }
  return trimApiUrl(value)
}

function trimApiUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}
