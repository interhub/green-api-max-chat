import { GreenApiError } from './errors'

const GENERIC_API_URL = 'https://api.green-api.com'

/** API hosts to try for an idInstance, the most likely one first. */
export function resolveApiUrls(idInstance: string, apiUrl?: string): string[] {
  if (apiUrl?.trim()) return [normalizeApiUrl(apiUrl)]
  const envApiUrl = import.meta.env.VITE_GREEN_API_URL
  if (envApiUrl?.trim()) return [normalizeApiUrl(envApiUrl)]
  // A shard host is named after the first four digits of the id; ids without a shard live on the generic host.
  const shardApiUrl = `https://${idInstance.slice(0, 4)}.api.green-api.com`
  return [...new Set([shardApiUrl, GENERIC_API_URL])]
}

/** Trims the value and strips trailing slashes. Throws a validation error unless it is an http(s) URL. */
export function normalizeApiUrl(value: string): string {
  const apiUrl = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\/\S+$/i.test(apiUrl)) {
    throw new GreenApiError('validation', 'Укажите API URL, начинающийся с https://')
  }
  return apiUrl
}
