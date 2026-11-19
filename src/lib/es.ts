import { loadConfig } from "./config.ts"
import { parseChainJson } from "./json.ts"
import { currentNetwork } from "./network.ts"

export class IndexUnavailable extends Error {
  constructor() {
    super("This network has no public operation index. Blocks and accounts still load from the node.")
    this.name = "IndexUnavailable"
  }
}

export function isIndexUnavailable(error: unknown) {
  return error instanceof IndexUnavailable
}

export type EsHit<T> = { _id?: string; _source?: T; sort?: unknown[] }

export type EsTotal = { value: number; relation: "eq" | "gte" }

export type EsResponse<T> = {
  hits?: {
    total?: EsTotal | number
    hits?: EsHit<T>[]
  }
  aggregations?: Record<string, { buckets?: EsBucket[]; value?: number }>
}

export type EsBucket = {
  key_as_string?: string
  key?: number
  doc_count?: number
  ops?: { value?: number }
}

export async function esSearch<T>(
  index: string,
  body: Record<string, unknown>,
  extraParams = "",
): Promise<EsResponse<T>> {
  const base = loadConfig().es.replace(/\/$/, "")
  if (!base) throw new IndexUnavailable()
  const response = await fetch(`${base}/${index}/_search?ignore_unavailable=true${extraParams}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = parseChainJson(await response.text()) as EsResponse<T> & {
    error?: { reason?: string; root_cause?: { reason?: string }[] }
  }
  if (!response.ok || data.error) {
    const reason = data.error?.reason || data.error?.root_cause?.[0]?.reason || `Elasticsearch HTTP ${response.status}`
    throw new Error(reason)
  }
  return data
}

export function esTotal(data: EsResponse<unknown>): EsTotal {
  const total = data.hits?.total
  if (typeof total === "number") return { value: total, relation: "eq" }
  return { value: total?.value ?? 0, relation: total?.relation === "gte" ? "gte" : "eq" }
}

export function opIndexPrefix() {
  return currentNetwork() === "testnet" ? "testnet" : "bitshares"
}

export function objectIndex(kind: string) {
  return `${currentNetwork() === "testnet" ? "testnetobjs" : "objects"}-${kind}`
}

export function allOpIndexes() {
  return `${opIndexPrefix()}-*`
}

export function yearOpIndexes(year: number) {
  return `${opIndexPrefix()}-${year}-*`
}

export function monthIndex(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${opIndexPrefix()}-${date.getUTCFullYear()}-${month}`
}

export function monthIndexes(start: Date, end: Date): string {
  const names: string[] = []
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)
  while (cursor.getTime() <= last) {
    names.push(monthIndex(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return names.join(",") || monthIndex(end)
}

/** Elasticsearch refuses `from + size` beyond this window. */
export const MAX_RESULT_WINDOW = 10_000

/**
 * Like esSearch with `from`, but able to go past the 10,000-hit window: it walks the
 * sort keys with `search_after` in chunks (only the sort values are fetched) and then
 * asks for the requested page after the last key.
 */
export async function esSearchDeep<T>(
  index: string,
  body: Record<string, unknown> & { size: number; sort: unknown[]; query: unknown },
  offset: number,
): Promise<EsResponse<T>> {
  if (offset + body.size <= MAX_RESULT_WINDOW) return esSearch<T>(index, { ...body, from: offset })
  let after: unknown[] | null = null
  let remaining = offset
  while (remaining > 0) {
    const chunk = Math.min(remaining, MAX_RESULT_WINDOW)
    const keys: EsResponse<never> = await esSearch<never>(
      index,
      {
        size: chunk,
        sort: body.sort,
        query: body.query,
        _source: false,
        track_total_hits: false,
        ...(after ? { search_after: after } : {}),
      },
      "&filter_path=hits.hits.sort",
    )
    const hits: EsHit<never>[] = keys.hits?.hits ?? []
    if (!hits.length) break
    after = hits[hits.length - 1].sort ?? null
    remaining -= hits.length
    if (hits.length < chunk || !after) break
  }
  if (remaining > 0) {
    // Past the end: keep the total, return no rows.
    const head = await esSearch<T>(index, { ...body, size: 0 })
    return { ...head, hits: { ...(head.hits ?? {}), hits: [] } }
  }
  return esSearch<T>(index, { ...body, search_after: after })
}
