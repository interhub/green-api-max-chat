import { useSyncExternalStore } from 'react'

const TICK_MS = 30_000

let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  now = Date.now()
  if (timer === undefined) {
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((notify) => notify())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

function getSnapshot(): number {
  return now
}

/** Current time that refreshes every 30 seconds, so "Сегодня" and "Вчера" labels roll over at midnight. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot)
}
