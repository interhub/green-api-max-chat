import type { GreenApiErrorCode } from '@/types'

/** Error of a GREEN-API call. The message is a short Russian sentence that can be shown to the user as is. */
export class GreenApiError extends Error {
  readonly code: GreenApiErrorCode
  /** HTTP status, 0 when there was no HTTP answer (network error, abort). */
  readonly status: number

  constructor(code: GreenApiErrorCode, message: string, status = 0) {
    super(message)
    this.name = 'GreenApiError'
    this.code = code
    this.status = status
  }
}

export function isGreenApiError(error: unknown): error is GreenApiError {
  return error instanceof GreenApiError
}
