import { sleep } from '@/lib/async'
import type { GreenApiClient, InstanceSettings } from '@/types'

export const SETTINGS_POLL_MS = 20_000
export const SETTINGS_WAIT_MS = 15 * 60_000

/** Polling instead of a webhook, plus incoming messages, echoes of outgoing ones, their statuses and instance state changes. */
export const REQUIRED_SETTINGS: InstanceSettings = {
  webhookUrl: '',
  incomingWebhook: 'yes',
  outgoingWebhook: 'yes',
  outgoingMessageWebhook: 'yes',
  outgoingAPIMessageWebhook: 'yes',
  stateWebhook: 'yes',
}

export interface SettingsStatus {
  enabled: boolean
  webhookUrlSet: boolean
}

export function toSettingsStatus(settings: Partial<InstanceSettings>): SettingsStatus {
  const webhookUrl = settings.webhookUrl ?? ''
  return {
    enabled: settings.incomingWebhook === 'yes' && webhookUrl === '',
    webhookUrlSet: webhookUrl !== '',
  }
}

/**
 * setSettings restarts the instance and applies within up to 5 minutes, so the settings are re-read every
 * SETTINGS_POLL_MS until receiving works (incoming notifications on and no webhookUrl). Resolves to null on abort
 * or when receiving is still off after SETTINGS_WAIT_MS.
 */
export async function waitForIncomingWebhook(
  client: GreenApiClient,
  signal: AbortSignal,
): Promise<SettingsStatus | null> {
  for (let waited = SETTINGS_POLL_MS; waited <= SETTINGS_WAIT_MS; waited += SETTINGS_POLL_MS) {
    await sleep(SETTINGS_POLL_MS, signal)
    if (signal.aborted) return null
    try {
      const status = toSettingsStatus(await client.getSettings(signal))
      if (status.enabled) return status
    } catch {
      // The instance is restarting: failed reads are expected for a while.
    }
  }
  return null
}
