import type { InstanceState } from '@/types'

/** A parsed JSON object whose fields are not checked yet. */
export type JsonObject = Record<string, unknown>

const INSTANCE_STATES: readonly InstanceState[] = [
  'authorized',
  'notAuthorized',
  'starting',
  'blocked',
  'suspended',
  'pendingPassword',
]

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The parsed value, or undefined when the text is not valid JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** GREEN-API ids are numeric strings; plain numbers are accepted as well. "" when missing. */
export function readId(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : readText(value)
}

/** Unknown or missing values count as "notAuthorized". */
export function toInstanceState(value: unknown): InstanceState {
  return INSTANCE_STATES.find((state) => state === value) ?? 'notAuthorized'
}
