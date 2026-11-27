import { fetchCounts } from "./chain.ts"
import { accountLabel, peekAsset, resolveAccounts, resolveAssets } from "./directory.ts"
import { IndexUnavailable, allOpIndexes, esSearch, esTotal, monthIndexes, objectIndex } from "./es.ts"
import { toFloat } from "./format.ts"
import { fetchHolders, type HolderRow } from "./history.ts"
import { coreSymbol, networkHasEs } from "./network.ts"
import { db } from "./node.ts"
import { isUsdStable, fetchBtsUsd } from "./usd.ts"

/** Count each operation once: the indexed account must be the fee payer. */
const PAYER = {
  script: {
    script: {
      source:
        "doc['operation_history.fee_payer.keyword'].size()!=0 && doc['account_history.account.keyword'].size()!=0 && doc['operation_history.fee_payer.keyword'].value==doc['account_history.account.keyword'].value",
    },
  },
}

const TRANSFER_SOURCE = ["block_data", "operation_type", "operation_id_num", "operation_history.op_object", "operation_history.op", "account_history"]
const MAX_TRANSFERS = 500
const LIFETIME_SINCE = "2100-01-01T00:00:00"

export type AssetOption = { id: string; symbol: string; count: number }

export type LargeTransfer = {
  key: string
  trxId: string
  opId: string
  time: string
  blockNum: number
  from: string
  to: string
  amount: string | number
  assetId: string
  amountFloat: number
  usd: number | null
}

export type LargeTransfersData = {
  rows: LargeTransfer[]
  assets: AssetOption[]
  total: number
  truncated: boolean
  btsPrice: number | null
  fetchedAt: string
  start: string
  end: string
}

export type AccountRank = { id: string; name: string; count: number }

export type AccountsOverview = {
  totalAccounts: number
  active24h: number
  new24h: number
  lifetimeMembers: number | null
  transfers: AccountRank[]
  fills: AccountRank[]
  pools: AccountRank[]
  holders: Array<HolderRow & { share: number }>
  supply: number
  transferOps: number
  fillOps: number
  poolOps: number
  start: string
  end: string
}

type OpObject = {
  from?: string
  to?: string
  amount_?: { amount?: string | number; asset_id?: string }
  amount?: { amount?: string | number; asset_id?: string }
}

type TransferHit = {
  operation_id_num?: number
  account_history?: { operation_id?: string }
  operation_history?: { op_object?: OpObject; op?: string }
  block_data?: { block_num?: number; block_time?: string; trx_id?: string }
}

function window24h() {
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return { start, end, indexes: monthIndexes(start, end) }
}

function money(object: OpObject | undefined): { amount: string | number; asset_id: string } | null {
  const direct = object?.amount_ ?? object?.amount
  if (direct?.asset_id && direct.amount != null) return { amount: direct.amount, asset_id: direct.asset_id }
  return null
}

function parseOpObject(raw: string | undefined): OpObject | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as [number, OpObject] | OpObject
    if (Array.isArray(parsed) && parsed[1] && typeof parsed[1] === "object") return parsed[1]
    if (parsed && typeof parsed === "object") return parsed as OpObject
  } catch {
    /* ignore malformed history blobs */
  }
  return null
}

function usdOf(symbol: string, amount: number, btsPrice: number | null): number | null {
  if (!Number.isFinite(amount)) return null
  if (symbol === "BTS" || symbol === coreSymbol()) return btsPrice != null ? amount * btsPrice : null
  if (symbol === "USD" || isUsdStable(symbol)) return amount
  return null
}

export async function fetchLargeTransfers(): Promise<LargeTransfersData> {
  if (!networkHasEs()) throw new IndexUnavailable()
  const { start, end, indexes } = window24h()
  const [data, quote] = await Promise.all([
    esSearch<TransferHit>(indexes || allOpIndexes(), {
      size: MAX_TRANSFERS,
      track_total_hits: true,
      sort: [
        { "operation_history.op_object.amount_.amount": "desc" },
        { "block_data.block_time": "desc" },
        { operation_id_num: "desc" },
      ],
      query: {
        bool: {
          filter: [
            { term: { operation_type: 0 } },
            PAYER,
            { range: { "block_data.block_time": { gte: start.toISOString(), lte: end.toISOString() } } },
          ],
        },
      },
      _source: TRANSFER_SOURCE,
    }),
    fetchBtsUsd().catch(() => ({ price: null })),
  ])
  const total = esTotal(data).value
  const seen = new Set<string>()
  const parsed: Array<Omit<LargeTransfer, "amountFloat" | "usd"> & { amountFloat?: number; usd?: number | null }> = []
  for (const hit of data.hits?.hits ?? []) {
    const src = hit._source ?? {}
    const object = src.operation_history?.op_object ?? parseOpObject(src.operation_history?.op) ?? {}
    const pay = money(object)
    if (!pay?.asset_id || object.from == null || object.to == null) continue
    const opNum = src.operation_id_num
    const key = src.block_data?.trx_id || (opNum != null ? String(opNum) : hit._id) || `${src.block_data?.block_num}-${object.from}-${object.to}`
    if (seen.has(key)) continue
    seen.add(key)
    const opId = src.account_history?.operation_id || (opNum != null ? `1.11.${opNum}` : "")
    parsed.push({
      key,
      trxId: src.block_data?.trx_id ?? "",
      opId,
      time: src.block_data?.block_time ?? "",
      blockNum: src.block_data?.block_num ?? 0,
      from: object.from,
      to: object.to,
      amount: pay.amount,
      assetId: pay.asset_id,
    })
  }
  await Promise.all([
    resolveAccounts(parsed.flatMap((row) => [row.from, row.to])),
    resolveAssets(parsed.map((row) => row.assetId)),
  ])
  const btsPrice = quote.price ?? null
  const counts = new Map<string, number>()
  const rows: LargeTransfer[] = parsed.map((row) => {
    const asset = peekAsset(row.assetId)
    const amountFloat = toFloat(row.amount, asset?.precision ?? 0) ?? Number.NaN
    counts.set(row.assetId, (counts.get(row.assetId) ?? 0) + 1)
    return {
      ...row,
      amountFloat,
      usd: usdOf(asset?.symbol ?? "", amountFloat, btsPrice),
    }
  })
  const assets: AssetOption[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, symbol: peekAsset(id)?.symbol ?? id, count }))
  return {
    rows,
    assets,
    total,
    truncated: total > rows.length,
    btsPrice,
    fetchedAt: end.toISOString(),
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

export function filterLargeTransfers(
  data: LargeTransfersData,
  assetId: string,
  minAmount: number,
): LargeTransfer[] {
  const rows = data.rows.filter((row) => {
    if (assetId && row.assetId !== assetId) return false
    if (!(minAmount > 0)) return true
    if (assetId) return Number.isFinite(row.amountFloat) && row.amountFloat >= minAmount
    return row.usd != null && row.usd >= minAmount
  })
  rows.sort((a, b) => {
    if (assetId) return (b.amountFloat || 0) - (a.amountFloat || 0) || b.time.localeCompare(a.time)
    const au = a.usd
    const bu = b.usd
    if (au != null && bu != null && au !== bu) return bu - au
    if (au != null && bu == null) return -1
    if (au == null && bu != null) return 1
    return (b.amountFloat || 0) - (a.amountFloat || 0)
  })
  return rows
}

export function summarizeTransfers(rows: LargeTransfer[], btsPrice: number | null) {
  let count = rows.length
  let btsVolume = 0
  let usdVolume = 0
  let usdKnown = 0
  let largest: LargeTransfer | null = null
  for (const row of rows) {
    const symbol = peekAsset(row.assetId)?.symbol
    if (symbol === "BTS" || symbol === coreSymbol()) btsVolume += row.amountFloat || 0
    if (row.usd != null) {
      usdVolume += row.usd
      usdKnown += 1
    }
    if (!largest) largest = row
    else if ((row.usd ?? -1) !== (largest.usd ?? -1)) {
      if ((row.usd ?? -1) > (largest.usd ?? -1)) largest = row
    } else if ((row.amountFloat || 0) > (largest.amountFloat || 0)) {
      largest = row
    }
  }
  const largestUsd = largest?.usd ?? (largest && (peekAsset(largest.assetId)?.symbol === "BTS" || peekAsset(largest.assetId)?.symbol === coreSymbol()) && btsPrice != null
    ? (largest.amountFloat || 0) * btsPrice
    : null)
  return { count, btsVolume, usdVolume, usdKnown, largest, largestUsd }
}

type TermsAgg = {
  buckets?: Array<{ key?: string; doc_count?: number; ops?: { value?: number } }>
}

async function topAccounts(type: number, start: Date, end: Date, size: number): Promise<{ rows: AccountRank[]; ops: number }> {
  const data = await esSearch<never>(monthIndexes(start, end) || allOpIndexes(), {
    size: 0,
    track_total_hits: false,
    query: {
      bool: {
        filter: [
          { term: { operation_type: type } },
          { range: { "block_data.block_time": { gte: start.toISOString(), lte: end.toISOString() } } },
        ],
      },
    },
    aggs: {
      accounts: {
        terms: { field: "account_history.account.keyword", size, order: { ops: "desc" } },
        aggs: { ops: { cardinality: { field: "operation_id_num" } } },
      },
      ops: { cardinality: { field: "operation_id_num" } },
    },
  })
  const buckets = (data.aggregations?.accounts as TermsAgg | undefined)?.buckets ?? []
  const rows: AccountRank[] = buckets.map((bucket) => {
    const id = String(bucket.key ?? "")
    return { id, name: id, count: Math.round(bucket.ops?.value ?? bucket.doc_count ?? 0) }
  }).filter((row) => row.id)
  const ops = Number((data.aggregations?.ops as { value?: number } | undefined)?.value ?? 0)
  return { rows, ops }
}

export async function fetchAccountsOverview(topN = 25): Promise<AccountsOverview> {
  const size = Math.min(Math.max(topN, 10), 100)
  if (!networkHasEs()) {
    const counts = await fetchCounts().catch(() => ({ accounts: 0, assets: 0 }))
    return {
      totalAccounts: counts.accounts,
      active24h: 0,
      new24h: 0,
      lifetimeMembers: null,
      transfers: [],
      fills: [],
      pools: [],
      holders: [],
      supply: 0,
      transferOps: 0,
      fillOps: 0,
      poolOps: 0,
      start: "",
      end: "",
    }
  }
  const { start, end, indexes } = window24h()
  const index = indexes || allOpIndexes()
  const [counts, holdersPage, supplyRows, lifetime, activity, transfers, fills, pools] = await Promise.all([
    fetchCounts().catch(() => ({ accounts: 0, assets: 0 })),
    fetchHolders("1.3.0", 1, size).catch(() => ({ rows: [] as HolderRow[], total: 0, relation: "eq" as const })),
    db<Array<{ current_supply?: string | number } | null>>("get_objects", [["2.3.0"]]).catch(() => []),
    esSearch(objectIndex("account"), {
      size: 0,
      track_total_hits: true,
      query: { range: { membership_expiration_date: { gte: LIFETIME_SINCE } } },
    }).catch(() => null),
    esSearch(index, {
      size: 0,
      track_total_hits: false,
      query: { bool: { filter: [{ range: { "block_data.block_time": { gte: start.toISOString(), lte: end.toISOString() } } }] } },
      aggs: {
        active: { cardinality: { field: "account_history.account.keyword", precision_threshold: 40000 } },
        new_accts: { filter: { term: { operation_type: 5 } }, aggs: { ops: { cardinality: { field: "operation_id_num" } } } },
      },
    }),
    topAccounts(0, start, end, size),
    topAccounts(4, start, end, size),
    topAccounts(63, start, end, size),
  ])
  const ranks = [...transfers.rows, ...fills.rows, ...pools.rows]
  await resolveAccounts([...ranks.map((row) => row.id), ...holdersPage.rows.map((row) => row.owner)])
  const named = (rows: AccountRank[]) => rows.map((row) => ({ ...row, name: accountLabel(row.id) }))
  const supplyRaw = supplyRows?.[0]?.current_supply ?? 0
  const supply = toFloat(supplyRaw, 5) ?? 0
  const holders = holdersPage.rows.map((row) => {
    const balance = toFloat(row.balance, 5) ?? 0
    return { ...row, share: supply > 0 ? balance / supply : 0 }
  })
  const lifetimeMembers = lifetime ? esTotal(lifetime).value : null
  const active = Number((activity.aggregations?.active as { value?: number } | undefined)?.value ?? 0)
  const new24h = Number((activity.aggregations?.new_accts as { ops?: { value?: number } } | undefined)?.ops?.value ?? 0)
  return {
    totalAccounts: counts.accounts,
    active24h: active,
    new24h,
    lifetimeMembers,
    transfers: named(transfers.rows),
    fills: named(fills.rows),
    pools: named(pools.rows),
    holders,
    supply,
    transferOps: transfers.ops,
    fillOps: fills.ops,
    poolOps: pools.ops,
    start: start.toISOString(),
    end: end.toISOString(),
  }
}
