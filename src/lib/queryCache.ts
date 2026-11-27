import { currentNetwork } from "./network.ts"

const TTL_MS = 10_000
const MAX_ENTRIES = 100

type Entry = { value: unknown; at: number }

const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

export function makeQueryKey(fn: () => Promise<unknown>, deps: unknown[]): string {
  let body = "fn"
  let dep = ""
  try {
    body = fn.toString()
  } catch {
    /* ignore */
  }
  try {
    dep = JSON.stringify(deps)
  } catch {
    dep = String(deps)
  }
  return `${currentNetwork()}:${body}:${dep}`
}

export function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key)
    return undefined
  }
  cache.delete(key)
  cache.set(key, entry)
  return entry.value as T
}

export function setCached(key: string, value: unknown) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, { value, at: Date.now() })
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function clearQueryCache() {
  cache.clear()
  inflight.clear()
}

export function sharedFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const request = fn().finally(() => {
    if (inflight.get(key) === request) inflight.delete(key)
  })
  inflight.set(key, request)
  return request
}
