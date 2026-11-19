import { peekAsset, resolveAssets } from "./directory.ts"
import type { Amount } from "./directory.ts"
import { esSearch, esTotal, allOpIndexes, monthIndexes, yearOpIndexes } from "./es.ts"
import { asBig, toFloat } from "./format.ts"
import { coreSymbol, currentNetwork } from "./network.ts"
import { db } from "./node.ts"
import { dedupeOps, hydrateOps, toOpView } from "./ops.ts"
import type { OpView } from "./ops.ts"

export const CONF_TYPES = [39, 40, 41] as const

export type ConfSupply = {
  assetId: string
  symbol: string
  precision: number
  raw: string | number
}

export type ConfDay = {
  date: string
  toBlind: number
  blind: number
  fromBlind: number
}

export type ConfStats = {
  recent: number
  total: number
  byType: Record<number, number>
  supplies: ConfSupply[]
  days: ConfDay[]
}

type DayBucket = {
  key_as_string?: string
  by?: { buckets?: Array<{ key?: number; ops?: { value?: number } }> }
}

const CARD = { precision_threshold: 4000 }

export async function fetchConfidentialStats(): Promise<ConfStats> {
  const end = new Date()
  const start = new Date(end.getTime() - 30 * 86400000)
  const types = { terms: { operation_type: [...CONF_TYPES] } }
  const [recentData, allData, supplies, days] = await Promise.all([
    esSearch(monthIndexes(start, end), {
      size: 0,
      query: {
        bool: {
          filter: [types, { range: { "block_data.block_time": { gte: start.toISOString() } } }],
        },
      },
      aggs: { ops: { cardinality: { field: "operation_id_num", ...CARD } } },
    }),
    esSearch(allOpIndexes(), {
      size: 0,
      query: types,
      aggs: {
        ops: { cardinality: { field: "operation_id_num", ...CARD } },
        by: {
          terms: { field: "operation_type", size: 3 },
          aggs: { ops: { cardinality: { field: "operation_id_num", ...CARD } } },
        },
      },
    }),
    fetchConfidentialSupplies(),
    fetchConfidentialDays(),
  ])
  const byType: Record<number, number> = {}
  const typeBuckets = (allData.aggregations?.by as { buckets?: Array<{ key?: number; ops?: { value?: number } }> } | undefined)?.buckets ?? []
  for (const bucket of typeBuckets) byType[Number(bucket.key)] = bucket.ops?.value ?? 0
  return {
    recent: recentData.aggregations?.ops?.value ?? 0,
    total: allData.aggregations?.ops?.value ?? esTotal(allData).value,
    byType,
    supplies,
    days,
  }
}

export async function fetchConfidentialOps(page: number, pageSize: number, type: number | null) {
  const filter = type == null
    ? [{ terms: { operation_type: [...CONF_TYPES] } }]
    : [{ term: { operation_type: type } }]
  const data = await esSearch(allOpIndexes(), {
    from: (page - 1) * pageSize,
    size: pageSize,
    track_total_hits: true,
    sort: [{ "block_data.block_time": "desc" }, { operation_id_num: "desc" }],
    query: { bool: { filter } },
    collapse: { field: "operation_id_num" },
    _source: ["block_data", "operation_type", "operation_id_num", "operation_history", "account_history"],
  })
  const rows = dedupeOps((data.hits?.hits ?? []).map((hit, index) => toOpView((hit._source ?? {}) as Parameters<typeof toOpView>[0], index)))
  await hydrateOps(rows)
  const total = esTotal(data)
  return { rows, total: total.value, relation: total.relation }
}

async function fetchConfidentialSupplies(): Promise<ConfSupply[]> {
  let assetIds = ["1.3.0"]
  try {
    const data = await esSearch(allOpIndexes(), {
      size: 0,
      query: { terms: { operation_type: [39, 41] } },
      aggs: { assets: { terms: { field: "operation_history.op_object.amount_.asset_id.keyword", size: 80 } } },
    })
    const buckets = (data.aggregations?.assets as { buckets?: Array<{ key?: string }> } | undefined)?.buckets ?? []
    const found = buckets.map((bucket) => bucket.key).filter((id): id is string => typeof id === "string" && id.startsWith("1.3."))
    assetIds = [...new Set(["1.3.0", ...found])]
  } catch {
    assetIds = ["1.3.0"]
  }
  const dynamicIds = assetIds.map((id) => `2.3.${id.split(".")[2]}`)
  const objects: Array<{ confidential_supply?: string | number } | null> = []
  for (let i = 0; i < dynamicIds.length; i += 50) {
    const chunk = await db<Array<{ confidential_supply?: string | number } | null>>("get_objects", [dynamicIds.slice(i, i + 50)])
    objects.push(...(chunk ?? []))
  }
  const rows: ConfSupply[] = []
  for (let i = 0; i < assetIds.length; i += 1) {
    const raw = objects[i]?.confidential_supply ?? 0
    if (asBig(raw) <= 0n) continue
    rows.push({ assetId: assetIds[i]!, symbol: assetIds[i]!, precision: 0, raw })
  }
  await resolveAssets(rows.map((row) => row.assetId))
  return rows
    .map((row) => {
      const asset = peekAsset(row.assetId)
      return { ...row, symbol: asset?.symbol ?? row.assetId, precision: asset?.precision ?? 0 }
    })
    .sort((a, b) => {
      const core = coreSymbol()
      if (a.symbol === core) return -1
      if (b.symbol === core) return 1
      return (toFloat(b.raw, b.precision) ?? 0) - (toFloat(a.raw, a.precision) ?? 0)
    })
}

async function fetchConfidentialDays(): Promise<ConfDay[]> {
  const first = currentNetwork() === "testnet" ? 2016 : 2015
  const last = new Date().getUTCFullYear()
  const years = Array.from({ length: last - first + 1 }, (_, index) => first + index)
  const parts = await Promise.all(years.map((year) => yearDays(year)))
  const merged = new Map<string, ConfDay>()
  for (const day of parts.flat()) merged.set(day.date, day)
  const sparse = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date))
  if (!sparse.length) return []
  const start = Date.parse(`${sparse[0]!.date}T00:00:00Z`)
  const end = Date.parse(`${sparse[sparse.length - 1]!.date}T00:00:00Z`)
  const filled: ConfDay[] = []
  for (let time = start; time <= end; time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10)
    filled.push(merged.get(date) ?? { date, toBlind: 0, blind: 0, fromBlind: 0 })
  }
  return filled
}

async function yearDays(year: number): Promise<ConfDay[]> {
  try {
    const data = await esSearch(yearOpIndexes(year), {
      size: 0,
      query: { terms: { operation_type: [...CONF_TYPES] } },
      aggs: {
        per_day: {
          date_histogram: { field: "block_data.block_time", calendar_interval: "day", min_doc_count: 1 },
          aggs: {
            by: {
              terms: { field: "operation_type", size: 3 },
              aggs: { ops: { cardinality: { field: "operation_id_num", precision_threshold: 1000 } } },
            },
          },
        },
      },
    })
    const buckets = (data.aggregations?.per_day as { buckets?: DayBucket[] } | undefined)?.buckets ?? []
    return buckets.flatMap((bucket) => {
      const date = (bucket.key_as_string ?? "").slice(0, 10)
      if (!date) return []
      const day: ConfDay = { date, toBlind: 0, blind: 0, fromBlind: 0 }
      for (const row of bucket.by?.buckets ?? []) {
        const count = row.ops?.value ?? 0
        if (row.key === 39) day.toBlind = count
        else if (row.key === 40) day.blind = count
        else if (row.key === 41) day.fromBlind = count
      }
      return [day]
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (/index_not_found|no such index/i.test(message)) return []
    throw error
  }
}

export function publicSide(op: OpView): { account: string; amount: Amount | null; inputs: number; outputs: number } {
  const inputs = Array.isArray(op.body.inputs) ? op.body.inputs.length : 0
  const outputs = Array.isArray(op.body.outputs) ? op.body.outputs.length : 0
  if (op.type === 39) {
    return { account: typeof op.body.from === "string" ? op.body.from : op.feePayer, amount: amountOf(op.body.amount), inputs, outputs }
  }
  if (op.type === 41) {
    return { account: typeof op.body.to === "string" ? op.body.to : op.feePayer, amount: amountOf(op.body.amount), inputs, outputs }
  }
  return { account: op.feePayer, amount: null, inputs, outputs }
}

function amountOf(value: unknown): Amount | null {
  if (!value || typeof value !== "object") return null
  const amount = (value as { amount?: unknown; asset_id?: unknown }).amount
  const assetId = (value as { asset_id?: unknown }).asset_id
  if (typeof assetId !== "string") return null
  if (typeof amount !== "string" && typeof amount !== "number") return null
  return { amount, asset_id: assetId }
}
