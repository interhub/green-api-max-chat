import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GreenApiError } from '@/api/errors'
import {
  SETTINGS_POLL_MS,
  SETTINGS_WAIT_MS,
  toSettingsStatus,
  waitForIncomingWebhook,
} from './settings'
import { createFakeClient } from './testing/fakeClient'

describe('toSettingsStatus', () => {
  it('needs incomingWebhook "yes" and an empty webhookUrl', () => {
    expect(toSettingsStatus({ webhookUrl: '', incomingWebhook: 'yes' })).toEqual({
      enabled: true,
      webhookUrlSet: false,
    })
    expect(toSettingsStatus({ webhookUrl: '', incomingWebhook: 'no' })).toEqual({
      enabled: false,
      webhookUrlSet: false,
    })
    expect(
      toSettingsStatus({ webhookUrl: 'https://example.com/hook', incomingWebhook: 'yes' }),
    ).toEqual({ enabled: false, webhookUrlSet: true })
    expect(toSettingsStatus({})).toEqual({ enabled: false, webhookUrlSet: false })
  })
})

describe('waitForIncomingWebhook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-reads the settings every 20 seconds until incoming notifications are on', async () => {
    const { client } = createFakeClient()
    client.getSettings
      .mockResolvedValueOnce({ webhookUrl: '', incomingWebhook: 'no' })
      .mockRejectedValueOnce(new GreenApiError('instance', 'Инстанс сейчас не готов.', 400))
    const result = waitForIncomingWebhook(client, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(SETTINGS_POLL_MS - 1)
    expect(client.getSettings).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1 + 2 * SETTINGS_POLL_MS)
    await expect(result).resolves.toEqual({ enabled: true, webhookUrlSet: false })
    expect(client.getSettings).toHaveBeenCalledTimes(3)
  })

  it('keeps waiting while the old webhookUrl is still set', async () => {
    const { client } = createFakeClient()
    client.getSettings.mockResolvedValueOnce({
      webhookUrl: 'https://example.com/hook',
      incomingWebhook: 'yes',
    })
    const result = waitForIncomingWebhook(client, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(2 * SETTINGS_POLL_MS)
    await expect(result).resolves.toEqual({ enabled: true, webhookUrlSet: false })
    expect(client.getSettings).toHaveBeenCalledTimes(2)
  })

  it('gives up after 15 minutes', async () => {
    const { client } = createFakeClient()
    client.getSettings.mockResolvedValue({ webhookUrl: '', incomingWebhook: 'no' })
    const result = waitForIncomingWebhook(client, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(SETTINGS_WAIT_MS)
    await expect(result).resolves.toBeNull()
    expect(client.getSettings).toHaveBeenCalledTimes(SETTINGS_WAIT_MS / SETTINGS_POLL_MS)
  })

  it('stops at once on abort', async () => {
    const { client } = createFakeClient()
    const controller = new AbortController()
    const result = waitForIncomingWebhook(client, controller.signal)
    controller.abort()
    await expect(result).resolves.toBeNull()
    expect(client.getSettings).not.toHaveBeenCalled()
  })
})
