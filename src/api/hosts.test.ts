import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeApiUrl, resolveApiUrls } from './hosts'

beforeEach(() => {
  vi.stubEnv('VITE_GREEN_API_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('resolveApiUrls', () => {
  it.each([
    ['3100000001', 'https://3100.api.green-api.com'],
    ['1101000001', 'https://1101.api.green-api.com'],
    ['7103123456', 'https://7103.api.green-api.com'],
  ])('tries the shard of %s first, then the generic host', (idInstance, shardApiUrl) => {
    expect(resolveApiUrls(idInstance)).toEqual([shardApiUrl, 'https://api.green-api.com'])
  })

  it('uses only the API URL given by the user', () => {
    expect(resolveApiUrls('3100000001', '  https://7103.api.green-api.com//  ')).toEqual([
      'https://7103.api.green-api.com',
    ])
  })

  it('ignores a blank API URL', () => {
    expect(resolveApiUrls('3100000001', '   ')).toEqual([
      'https://3100.api.green-api.com',
      'https://api.green-api.com',
    ])
  })

  it('uses only VITE_GREEN_API_URL when it is set', () => {
    vi.stubEnv('VITE_GREEN_API_URL', 'http://localhost:8787/')

    expect(resolveApiUrls('3100000001')).toEqual(['http://localhost:8787'])
  })

  it('prefers the API URL of the user over VITE_GREEN_API_URL', () => {
    vi.stubEnv('VITE_GREEN_API_URL', 'http://localhost:8787')

    expect(resolveApiUrls('3100000001', 'https://3100.api.green-api.com')).toEqual([
      'https://3100.api.green-api.com',
    ])
  })
})

describe('normalizeApiUrl', () => {
  it('accepts http and https URLs, with a path too', () => {
    expect(normalizeApiUrl('HTTPS://3100.api.green-api.com/v3/')).toBe(
      'HTTPS://3100.api.green-api.com/v3',
    )
    expect(normalizeApiUrl('http://localhost:8787')).toBe('http://localhost:8787')
  })

  it.each([
    '3100.api.green-api.com',
    'ftp://3100.api.green-api.com',
    'https://',
    'https://3100 api',
  ])('rejects %s with a validation error', (value) => {
    expect(() => normalizeApiUrl(value)).toThrow(
      expect.objectContaining({
        name: 'GreenApiError',
        code: 'validation',
        message: 'Укажите API URL, начинающийся с https://',
      }),
    )
  })
})
