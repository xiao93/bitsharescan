import { fetchDailyCloses, fetchGlobal } from "./chain.ts"
import { accountLabel, assetSymbol, peekAsset, resolveAccounts, resolveAssets } from "./directory.ts"
import { db } from "./node.ts"
import { fetchDefiStats } from "./defi.ts"
import { esSearch, monthIndexes, opIndexPrefix, yearOpIndexes } from "./es.ts"
import { compactNumber, toFloat } from "./format.ts"
import { coreSymbol, currentNetwork, networkHasEs } from "./network.ts"
import { fetchBtsUsd } from "./usd.ts"
import { OPERATIONS } from "./ops.ts"

export type RangeId = "1m" | "6m" | "1y" | "all"
export type Point = { date: string; value: number }
export type LineSeries = { id: string; label: string; points: Point[] }
export type RankRow = { key: string; label: string; value: number }
export type ChartData = {
  points: Point[]
  series?: LineSeries[]
  bucket: "day" | "month"
  monthlyUnique: boolean
  rows?: RankRow[]
  grid?: number[][]
  updatedAt?: string
}

export type ChartCategory = "Blockchain Data" | "Market Data" | "Network" | "DeFi"
export type ChartView = "line" | "share" | "rank" | "heatmap"

export type ChartDef = {
  id: string
  category: ChartCategory
  title: string
  description: string
  unit: string
  digits: number
  view?: ChartView
}

export const RANGES: RangeId[] = ["1m", "6m", "1y", "all"]

export const networkNotice = "This network has no public operation index. Blocks and accounts still load from the node."

export const CHARTS: ChartDef[] = [
  { id: "daily-ops", category: "Blockchain Data", title: "Daily operations", description: "Unique operations per day, counted once even when several accounts are touched.", unit: "operations", digits: 0 },
  { id: "ops-by-type", category: "Blockchain Data", title: "Operations by type", description: "Daily unique counts for transfers, limit orders, fills, pool exchanges, and accepted credit offers.", unit: "operations", digits: 0 },
  { id: "blocks-per-day", category: "Blockchain Data", title: "Blocks per day", description: "Distinct block numbers seen in the operation index each day.", unit: "blocks", digits: 0 },
  { id: "ops-per-block", category: "Blockchain Data", title: "Average operations per block", description: "Unique operations divided by distinct blocks that day.", unit: "operations", digits: 2 },
  { id: "active-accounts", category: "Network", title: "Daily active accounts", description: "Accounts that appear in at least one operation that day.", unit: "accounts", digits: 0 },
  { id: "new-accounts", category: "Network", title: "Daily new accounts", description: "Account create operations per day.", unit: "accounts", digits: 0 },
  { id: "daily-fees", category: "Network", title: "Daily BTS fees", description: "BTS fees summed once per operation, only when the indexed account is the fee payer.", unit: "BTS", digits: 2 },
  { id: "transfers", category: "Market Data", title: "Daily transfers", description: "Unique transfer operations per day.", unit: "transfers", digits: 0 },
  { id: "transfer-volume", category: "Market Data", title: "Daily BTS transfer volume", description: "Sum of transfer amounts denominated in BTS, counted once per operation.", unit: "BTS", digits: 0 },
  { id: "fills", category: "Market Data", title: "Daily DEX fills", description: "Unique fill-order operations per day.", unit: "fills", digits: 0 },
  { id: "bts-price", category: "Market Data", title: "BTS price", description: "Daily BTS price in USD from a CoinMarketCap snapshot, covering the full daily record since July 2014. The current price is also from CoinMarketCap, as of the snapshot update. CoinGecko or the on-chain DEX is used only if the snapshot is unavailable.", unit: "USD", digits: 5 },
  { id: "pool-exchanges", category: "DeFi", title: "Daily pool exchanges", description: "Unique liquidity-pool exchange operations per day.", unit: "exchanges", digits: 0 },
  { id: "credit-deals", category: "DeFi", title: "Daily credit offers accepted", description: "Unique credit-offer accept operations per day. That is when a new credit deal opens.", unit: "deals", digits: 0 },
  { id: "op-type-share", category: "Blockchain Data", title: "Operation type share", description: "Share of unique operations by type. All uses the past year.", unit: "operations", digits: 0, view: "share" },
  { id: "ops-heatmap", category: "Blockchain Data", title: "Operations by hour", description: "Unique operations per hour over the last 7 days, UTC.", unit: "operations", digits: 0, view: "heatmap" },
  { id: "top-accounts", category: "Network", title: "Top accounts by operations", description: "Accounts that appear in the most operations. All uses the past year.", unit: "operations", digits: 0, view: "rank" },
  { id: "registrars", category: "Network", title: "Account creations by registrar", description: "Account create operations grouped by registrar. All uses the past year.", unit: "accounts", digits: 0, view: "rank" },
  { id: "fees-by-type", category: "Network", title: "Fees by operation type", description: "Core-asset fees summed once per operation, only when the indexed account is the fee payer. All uses the past year.", unit: "core", digits: 2, view: "rank" },
  { id: "top-assets", category: "Market Data", title: "Top assets transferred", description: "Transfer amounts by asset, counted once for the fee payer. All uses the past year.", unit: "amount", digits: 2, view: "rank" },
  { id: "fills-by-pair", category: "Market Data", title: "Fills by market", description: "Unique fill operations by the asset paid and the asset received. All uses the past year.", unit: "fills", digits: 0, view: "rank" },
  { id: "defi-activity", category: "DeFi", title: "Pool and credit activity", description: "Liquidity pool, credit, and SameT operations. All uses the past year.", unit: "operations", digits: 0, view: "rank" },
]

export const CATEGORIES: ChartCategory[] = ["Blockchain Data", "Market Data", "Network", "DeFi"]

const TYPES = [
  { id: "transfer", label: "Transfers", type: 0 },
  { id: "order-create", label: "Limit orders created", type: 1 },
  { id: "order-cancel", label: "Limit orders canceled", type: 2 },
  { id: "fills", label: "Fills", type: 4 },
  { id: "pool", label: "Pool exchanges", type: 63 },
  { id: "credit", label: "Credit offers accepted", type: 72 },
]

const PAYER = {
  script: {
    script: {
      source:
        "doc['operation_history.fee_payer.keyword'].size()!=0 && doc['account_history.account.keyword'].size()!=0 && doc['operation_history.fee_payer.keyword'].value==doc['account_history.account.keyword'].value",
    },
  },
}

type DayBucket = {
  key_as_string?: string
  ops?: { value?: number }
  blocks?: { value?: number }
  accts?: { value?: number }
  metric?: { value?: number }
  kinds?: { buckets?: Record<string, { ops?: { value?: number } }> }
}

const memory = new Map<string, ChartData>()
const inflight = new Map<string, Promise<ChartData>>()
let activeQueries = 0
const queue: Array<() => void> = []

function withSlot<T>(run: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      activeQueries += 1
      run().then(resolve, reject).finally(() => {
        activeQueries -= 1
        queue.shift()?.()
      })
    }
    if (activeQueries < 3) start()
    else queue.push(start)
  })
}

function rangeWindow(range: RangeId) {
  const end = new Date()
  if (range === "all") return { start: new Date(currentNetwork() === "testnet" ? "2016-01-01T00:00:00Z" : "2015-10-13T00:00:00Z"), end, index: `${opIndexPrefix()}-*` }
  const days = range === "1m" ? 30 : range === "6m" ? 182 : 365
  // Whole UTC days only: today is still in progress, so a partial bucket would show as a false drop
  // (and as the period's lowest value). The window ends at the last second of yesterday, UTC.
  const today = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  const start = new Date(today - days * 86400000)
  const lastFull = new Date(today - 1000)
  return { start, end: lastFull, index: monthIndexes(start, lastFull) }
}

function cacheKey(id: string, range: RangeId) {
  return `bitscan.chart.v5.${currentNetwork()}.${id}.${range}`
}

function readCache(id: string, range: RangeId) {
  const key = cacheKey(id, range)
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ChartData
    memory.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

function writeCache(id: string, range: RangeId, value: ChartData) {
  const key = cacheKey(id, range)
  memory.set(key, value)
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

async function oneHistogram(index: string, start: Date, end: Date, interval: "day" | "month", filters: unknown[], aggs: Record<string, unknown>) {
  const data = await esSearch<unknown>(index, {
    size: 0,
    query: {
      bool: {
        filter: [
          { range: { "block_data.block_time": { gte: start.toISOString(), lte: end.toISOString() } } },
          ...filters,
        ],
      },
    },
    aggs: {
      per_day: {
        date_histogram: {
          field: "block_data.block_time",
          calendar_interval: interval,
          min_doc_count: 0,
          extended_bounds: { min: start.toISOString(), max: end.toISOString() },
        },
        aggs,
      },
    },
  })
  return ((data.aggregations as { per_day?: { buckets?: DayBucket[] } } | undefined)?.per_day?.buckets ?? []) as DayBucket[]
}

async function histogram(range: RangeId, filters: unknown[], aggs: Record<string, unknown>) {
  const window = rangeWindow(range)
  if (range !== "all") return oneHistogram(window.index, window.start, window.end, "day", filters, aggs)
  const merged: DayBucket[] = []
  const firstYear = currentNetwork() === "testnet" ? 2016 : 2015
  for (let year = firstYear; year <= window.end.getUTCFullYear(); year += 1) {
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
    let buckets: DayBucket[] | null = null
    let lastError: unknown
    for (let attempt = 0; attempt < 2 && !buckets; attempt += 1) {
      try {
        buckets = await oneHistogram(yearOpIndexes(year), start, end > window.end ? window.end : end, "month", filters, aggs)
      } catch (error) {
        const message = error instanceof Error ? error.message : ""
        if (/index_not_found|no such index/i.test(message)) {
          buckets = []
          break
        }
        lastError = error
      }
    }
    if (!buckets) throw new Error(lastError instanceof Error ? "The full history query failed. Try again." : "The full history query failed. Try again.")
    merged.push(...buckets.filter((bucket) => bucket.key_as_string))
  }
  return merged
}

function pointsFrom(buckets: DayBucket[], pick: (bucket: DayBucket) => number): Point[] {
  return buckets
    .filter((bucket) => bucket.key_as_string)
    .map((bucket) => ({ date: (bucket.key_as_string ?? "").slice(0, 10), value: pick(bucket) }))
}

function daysInBucket(date: string): number {
  const [year, month] = date.slice(0, 7).split("-").map(Number)
  const full = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const start = Date.UTC(year, month - 1, 1)
  const now = Date.now()
  if (now >= Date.UTC(year, month, 1)) return full
  return Math.max(1, Math.floor((now - start) / 86400000) + 1)
}

function trimLeadingZeros(points: Point[]): Point[] {
  const start = points.findIndex((point) => point.value > 0)
  return start <= 0 ? points : points.slice(start)
}

function finish(range: RangeId, points: Point[], divide: boolean, monthlyUnique = false, series?: LineSeries[]): ChartData {
  const monthly = range === "all"
  const scale = (rows: Point[]) => trimLeadingZeros(monthly && divide ? rows.map((row) => ({ ...row, value: row.value / daysInBucket(row.date) })) : rows)
  return { points: scale(points), series: series?.map((row) => ({ ...row, points: scale(row.points) })), bucket: monthly ? "month" : "day", monthlyUnique: monthly && monthlyUnique }
}

const card = { precision_threshold: 40000 }
const chainBuckets = new Map<string, Promise<DayBucket[]>>()

function loadChainBuckets(range: RangeId) {
  const cached = chainBuckets.get(range)
  if (cached) return cached
  const job = histogram(range, [], {
    ops: { cardinality: { field: "operation_id_num", ...card } },
    blocks: { cardinality: { field: "block_data.block_num", ...card } },
  })
  chainBuckets.set(range, job)
  job.catch(() => chainBuckets.delete(range))
  return job
}

type TermsBucket = {
  key: string | number
  doc_count?: number
  ops?: { value?: number }
  fee?: { value?: number }
  amt?: { value?: number }
  r?: { buckets?: TermsBucket[] }
}

function rankWindow(range: RangeId) {
  return range === "all" ? rangeWindow("1y") : rangeWindow(range)
}

async function termAgg(range: RangeId, filters: unknown[], aggs: Record<string, unknown>) {
  const window = rankWindow(range)
  const data = await esSearch<unknown>(window.index, {
    size: 0,
    query: {
      bool: {
        filter: [
          { range: { "block_data.block_time": { gte: window.start.toISOString(), lte: window.end.toISOString() } } },
          ...filters,
        ],
      },
    },
    aggs,
  })
  return (data.aggregations ?? {}) as Record<string, { buckets?: TermsBucket[] }>
}

function typeLabel(type: number) {
  return OPERATIONS[type]?.label ?? `Operation ${type}`
}

const DEFI_TYPES = OPERATIONS.map((op, type) => ({ type, slug: op.slug })).filter((op) => /^(liquidity_pool_|credit_|samet_)/.test(op.slug)).map((op) => op.type)

async function loadRank(id: string, range: RangeId): Promise<ChartData> {
  const empty = { points: [] as Point[], bucket: "day" as const, monthlyUnique: false }
  if (id === "ops-heatmap") {
    const end = new Date()
    const start = new Date(Date.now() - 6 * 86400000)
    const data = await esSearch<unknown>(monthIndexes(start, end), {
      size: 0,
      query: { bool: { filter: [{ range: { "block_data.block_time": { gte: start.toISOString(), lte: end.toISOString() } } }] } },
      aggs: {
        per_day: {
          date_histogram: { field: "block_data.block_time", calendar_interval: "hour", min_doc_count: 0, extended_bounds: { min: start.toISOString(), max: end.toISOString() } },
          aggs: { ops: { cardinality: { field: "operation_id_num" } } },
        },
      },
    })
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    const buckets = ((data.aggregations as { per_day?: { buckets?: DayBucket[] } } | undefined)?.per_day?.buckets ?? [])
    for (const bucket of buckets) {
      if (!bucket.key_as_string) continue
      const date = new Date(bucket.key_as_string)
      grid[date.getUTCDay()]![date.getUTCHours()]! += bucket.ops?.value ?? 0
    }
    return { ...empty, grid }
  }
  if (id === "op-type-share") {
    const data = await termAgg(range, [], { rows: { terms: { field: "operation_type", size: 8 }, aggs: { ops: { cardinality: { field: "operation_id_num" } } } } })
    const rows = (data.rows?.buckets ?? []).map((bucket) => ({
      key: String(bucket.key),
      label: typeLabel(Number(bucket.key)),
      value: bucket.ops?.value ?? 0,
    }))
    return { ...empty, rows }
  }
  if (id === "top-accounts") {
    const data = await termAgg(range, [], { rows: { terms: { field: "account_history.account.keyword", size: 10 }, aggs: { ops: { cardinality: { field: "operation_id_num" } } } } })
    const buckets = data.rows?.buckets ?? []
    await resolveAccounts(buckets.map((bucket) => String(bucket.key)))
    return { ...empty, rows: buckets.map((bucket) => ({ key: String(bucket.key), label: accountLabel(String(bucket.key)), value: bucket.ops?.value ?? bucket.doc_count ?? 0 })) }
  }
  if (id === "registrars") {
    const data = await termAgg(range, [{ term: { operation_type: 5 } }], { rows: { terms: { field: "operation_history.op_object.registrar.keyword", size: 10 } } })
    const buckets = data.rows?.buckets ?? []
    await resolveAccounts(buckets.map((bucket) => String(bucket.key)))
    return { ...empty, rows: buckets.map((bucket) => ({ key: String(bucket.key), label: accountLabel(String(bucket.key)), value: bucket.doc_count ?? 0 })) }
  }
  if (id === "fees-by-type") {
    const data = await termAgg(range, [PAYER, { term: { "operation_history.op_object.fee.asset_id": "1.3.0" } }], {
      rows: { terms: { field: "operation_type", size: 8 }, aggs: { fee: { sum: { field: "operation_history.op_object.fee.amount" } } } },
    })
    return {
      ...empty,
      rows: (data.rows?.buckets ?? []).map((bucket) => ({ key: String(bucket.key), label: typeLabel(Number(bucket.key)), value: (bucket.fee?.value ?? 0) / 1e5 })),
    }
  }
  if (id === "top-assets") {
    const data = await termAgg(range, [PAYER, { term: { operation_type: 0 } }], {
      rows: { terms: { field: "operation_history.op_object.amount_.asset_id.keyword", size: 8 }, aggs: { amt: { sum: { field: "operation_history.op_object.amount_.amount" } } } },
    })
    const buckets = data.rows?.buckets ?? []
    await resolveAssets(buckets.map((bucket) => String(bucket.key)))
    return {
      ...empty,
      rows: buckets.map((bucket) => {
        const id = String(bucket.key)
        const precision = peekAsset(id)?.precision ?? 5
        return { key: id, label: assetSymbol(id), value: (bucket.amt?.value ?? 0) / 10 ** precision }
      }),
    }
  }
  if (id === "fills-by-pair") {
    const data = await termAgg(range, [{ term: { operation_type: 4 } }], {
      rows: {
        terms: { field: "operation_history.op_object.pays.asset_id.keyword", size: 6 },
        aggs: { r: { terms: { field: "operation_history.op_object.receives.asset_id.keyword", size: 3 }, aggs: { ops: { cardinality: { field: "operation_id_num" } } } } },
      },
    })
    const pairs: RankRow[] = []
    const ids: string[] = []
    for (const pay of data.rows?.buckets ?? []) {
      for (const recv of pay.r?.buckets ?? []) {
        ids.push(String(pay.key), String(recv.key))
        pairs.push({ key: `${pay.key}/${recv.key}`, label: `${pay.key}/${recv.key}`, value: recv.ops?.value ?? recv.doc_count ?? 0 })
      }
    }
    await resolveAssets(ids)
    pairs.sort((a, b) => b.value - a.value)
    return {
      ...empty,
      rows: pairs.slice(0, 8).map((row) => {
        const [pay, recv] = row.key.split("/")
        return { ...row, label: `${assetSymbol(pay)}/${assetSymbol(recv)}` }
      }),
    }
  }
  if (id === "defi-activity") {
    const data = await termAgg(range, [{ terms: { operation_type: DEFI_TYPES } }], { rows: { terms: { field: "operation_type", size: 12 }, aggs: { ops: { cardinality: { field: "operation_id_num" } } } } })
    return {
      ...empty,
      rows: (data.rows?.buckets ?? []).map((bucket) => ({ key: String(bucket.key), label: typeLabel(Number(bucket.key)), value: bucket.ops?.value ?? 0 })),
    }
  }
  throw new Error("Unknown chart")
}

type CmcSnapshot = {
  generated_at?: string
  points?: Array<{ date: string; price: number }>
}

async function loadBtsPriceFromSnapshot(range: RangeId): Promise<ChartData | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/bts-price-history.json`)
    if (!response.ok) return null
    const body = await response.json() as CmcSnapshot
    const rows = (body.points ?? [])
      .map((row) => ({ date: row.date, value: Number(row.price) }))
      .filter((row) => typeof row.date === "string" && row.date.length >= 10 && row.value > 0)
    if (!rows.length) return null
    const start = range === "all" ? null : rangeWindow(range).start.toISOString().slice(0, 10)
    const points = start ? rows.filter((row) => row.date >= start) : rows
    if (!points.length) return null
    return { points: trimLeadingZeros(points), bucket: "day", monthlyUnique: false, updatedAt: body.generated_at }
  } catch {
    return null
  }
}

async function fetchCoinGeckoPriceHistory(days: number): Promise<Point[]> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 8_000)
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/bitshares/market_chart?vs_currency=usd&days=${days}`, {
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    if (!response.ok) return []
    const body = await response.json() as { prices?: Array<[number, number]> }
    const prices = body.prices
    if (!Array.isArray(prices) || !prices.length) return []
    const byDate = new Map<string, number>()
    for (const row of prices) {
      const ms = Number(row?.[0])
      const price = Number(row?.[1])
      if (!(ms > 0) || !(price > 0)) continue
      byDate.set(new Date(ms).toISOString().slice(0, 10), price)
    }
    return [...byDate.entries()]
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

async function loadBtsPriceFromDex(range: RangeId): Promise<ChartData> {
  const core = coreSymbol()
  const quote = await fetchBtsUsd()
  const stable = quote.anchor || "XBTSX.USDT"
  const window = rangeWindow(range)
  const raw: Point[] = []
  let cursor = window.start
  while (cursor < window.end) {
    const chunkEnd = new Date(Math.min(window.end.getTime(), cursor.getTime() + 150 * 86400000))
    const closes = await fetchDailyCloses(stable, core, cursor, chunkEnd)
    raw.push(...closes.map((row) => ({ date: row.date, value: row.price })).filter((row) => row.value > 0))
    const next = new Date(chunkEnd.getTime() + 86400000)
    if (next.getTime() <= cursor.getTime()) break
    cursor = next
  }
  const seen = new Set<string>()
  const unique = raw.filter((row) => (seen.has(row.date) ? false : seen.add(row.date)))
  const mid = unique.map((row) => row.value).sort((a, b) => a - b)[Math.floor(unique.length / 2)] ?? 0
  const points = mid > 1 ? unique.map((row) => ({ ...row, value: 1 / row.value })) : unique
  return { points: trimLeadingZeros(points), bucket: "day", monthlyUnique: false }
}

async function loadRaw(id: string, range: RangeId): Promise<ChartData> {
  if (id === "bts-price") {
    const snapshot = await loadBtsPriceFromSnapshot(range)
    if (snapshot) return snapshot
    const gecko = await fetchCoinGeckoPriceHistory(range === "1m" ? 30 : range === "6m" ? 182 : 365)
    if (gecko.length) return { points: trimLeadingZeros(gecko), bucket: "day", monthlyUnique: false }
    return loadBtsPriceFromDex(range)
  }
  if (!networkHasEs()) throw new Error("This network has no public operation index. Blocks and accounts still load from the node.")
  if (chartById(id)?.view && chartById(id)?.view !== "line") return loadRank(id, range)
  if (id === "daily-ops" || id === "blocks-per-day" || id === "ops-per-block") {
    const buckets = await loadChainBuckets(range)
    if (id === "blocks-per-day") return finish(range, pointsFrom(buckets, (bucket) => bucket.blocks?.value ?? 0), true)
    if (id === "ops-per-block") {
      return finish(range, pointsFrom(buckets, (bucket) => {
        const blocks = bucket.blocks?.value ?? 0
        const ops = bucket.ops?.value ?? 0
        return blocks ? ops / blocks : 0
      }), false)
    }
    return finish(range, pointsFrom(buckets, (bucket) => bucket.ops?.value ?? 0), true)
  }
  if (id === "ops-by-type") {
    const filters: Record<string, { term: { operation_type: number } }> = {}
    for (const row of TYPES) filters[row.id] = { term: { operation_type: row.type } }
    const buckets = await histogram(range, [], {
      kinds: { filters: { filters }, aggs: { ops: { cardinality: { field: "operation_id_num", ...card } } } },
    })
    const series = TYPES.map((row) => ({
      id: row.id,
      label: row.label,
      points: buckets.map((bucket) => ({ date: (bucket.key_as_string ?? "").slice(0, 10), value: bucket.kinds?.buckets?.[row.id]?.ops?.value ?? 0 })),
    }))
    return finish(range, series[0]?.points ?? [], true, false, series)
  }
  if (id === "active-accounts") {
    const buckets = await histogram(range, [], { accts: { cardinality: { field: "account_history.account.keyword", ...card } } })
    return finish(range, pointsFrom(buckets, (bucket) => bucket.accts?.value ?? 0), false, true)
  }
  if (id === "new-accounts") {
    const buckets = await histogram(range, [{ term: { operation_type: 5 } }], { ops: { cardinality: { field: "operation_id_num", ...card } } })
    return finish(range, pointsFrom(buckets, (bucket) => bucket.ops?.value ?? 0), true)
  }
  if (id === "transfers") {
    const buckets = await histogram(range, [{ term: { operation_type: 0 } }], { ops: { cardinality: { field: "operation_id_num", ...card } } })
    return finish(range, pointsFrom(buckets, (bucket) => bucket.ops?.value ?? 0), true)
  }
  if (id === "fills") {
    const buckets = await histogram(range, [{ term: { operation_type: 4 } }], { ops: { cardinality: { field: "operation_id_num", ...card } } })
    return finish(range, pointsFrom(buckets, (bucket) => bucket.ops?.value ?? 0), true)
  }
  if (id === "pool-exchanges") {
    const buckets = await histogram(range, [{ term: { operation_type: 63 } }], { ops: { cardinality: { field: "operation_id_num", ...card } } })
    return finish(range, pointsFrom(buckets, (bucket) => bucket.ops?.value ?? 0), true)
  }
  if (id === "credit-deals") {
    const buckets = await histogram(range, [{ term: { operation_type: 72 } }], { ops: { cardinality: { field: "operation_id_num", ...card } } })
    return finish(range, pointsFrom(buckets, (bucket) => bucket.ops?.value ?? 0), true)
  }
  if (id === "daily-fees") {
    const buckets = await histogram(
      range,
      [PAYER, { term: { "operation_history.op_object.fee.asset_id": "1.3.0" } }],
      { metric: { sum: { field: "operation_history.op_object.fee.amount" } } },
    )
    return finish(range, pointsFrom(buckets, (bucket) => (bucket.metric?.value ?? 0) / 1e5), true)
  }
  if (id === "transfer-volume") {
    const buckets = await histogram(
      range,
      [PAYER, { term: { operation_type: 0 } }, { term: { "operation_history.op_object.amount_.asset_id": "1.3.0" } }],
      { metric: { sum: { field: "operation_history.op_object.amount_.amount" } } },
    )
    return finish(range, pointsFrom(buckets, (bucket) => (bucket.metric?.value ?? 0) / 1e5), true)
  }
  throw new Error("Unknown chart")
}

export async function loadChart(id: string, range: RangeId) {
  const cached = readCache(id, range)
  if (cached) return cached
  const key = cacheKey(id, range)
  const pending = inflight.get(key)
  if (pending) return pending
  const job = withSlot(() => loadRaw(id, range))
    .then((value) => {
      writeCache(id, range, value)
      return value
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, job)
  return job
}

export function chartById(id: string) {
  return CHARTS.find((chart) => chart.id === id) ?? null
}

export type Snapshots = {
  supply: string
  accounts: string
  witnesses: string
  committee: string
  tvl: string
}

export async function loadSnapshots(): Promise<Snapshots> {
  const [supplyRaw, global, accounts, defi] = await Promise.all([
    coreSupply(),
    fetchGlobal(),
    db<number>("get_account_count", []).catch(() => 0),
    fetchDefiStats().catch(() => null),
  ])
  const supply = toFloat(supplyRaw, 5)
  return {
    supply: supply == null ? "—" : `${compactNumber(supply)} ${coreSymbol()}`,
    accounts: compactNumber(accounts || 0),
    witnesses: String(global.active_witnesses.length),
    committee: String(global.active_committee_members.length),
    tvl: defi ? `${compactNumber(defi.tvlBts)} ${coreSymbol()}` : "—",
  }
}

async function coreSupply() {
  const rows = await db<Array<{ current_supply?: string | number } | null>>("get_objects", [["2.3.0"]])
  return rows?.[0]?.current_supply ?? 0
}
