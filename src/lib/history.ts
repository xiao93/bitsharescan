import { peekAsset, resolveAssets } from "./directory.ts"
import { currentNetwork, networkHasEs } from "./network.ts"
import type { Amount } from "./directory.ts"
import { allOpIndexes, esSearch, esSearchDeep, esTotal, MAX_RESULT_WINDOW, monthIndex, monthIndexes, objectIndex } from "./es.ts"
import type { EsResponse } from "./es.ts"
import { parseChainTime, toFloat } from "./format.ts"
import { dedupeOps, hydrateOps, toOpView } from "./ops.ts"
import type { OpView } from "./ops.ts"

const SOURCE = ["block_data", "operation_type", "operation_id_num", "operation_history", "account_history"]

export type OpPage = {
  rows: OpView[]
  total: number
  relation: "eq" | "gte"
}

type EsOp = Parameters<typeof toOpView>[0]

function rowsFrom(data: EsResponse<EsOp>): OpView[] {
  return (data.hits?.hits ?? []).map((hit, index) => toOpView(hit._source ?? {}, index))
}

export async function fetchDailyOps(days = 14): Promise<{ date: string; ops: number }[]> {
  // Whole UTC days: today's partial count would always look like a sudden drop.
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const start = new Date(today - days * 86400000)
  const end = new Date(today - 1000)
  const data = await esSearch<EsOp>(monthIndexes(start, end), {
    size: 0,
    query: {
      range: {
        "block_data.block_time": {
          gte: start.toISOString(),
          lte: end.toISOString(),
        },
      },
    },
    aggs: {
      per_day: {
        date_histogram: {
          field: "block_data.block_time",
          calendar_interval: "day",
          min_doc_count: 0,
          extended_bounds: { min: start.toISOString(), max: end.toISOString() },
        },
        aggs: { ops: { cardinality: { field: "operation_id_num" } } },
      },
    },
  })
  const buckets = data.aggregations?.per_day?.buckets ?? []
  return buckets.map((bucket) => ({
    date: (bucket.key_as_string ?? "").slice(0, 10),
    ops: bucket.ops?.value ?? 0,
  }))
}

const TOTAL_KEY = "bitscan.op-total"

/** Cache key per network, so testnet never shows the mainnet total (or the reverse). */
function totalKey() {
  return `${TOTAL_KEY}.${currentNetwork()}`
}

export async function fetchOperationTotal(): Promise<number | null> {
  if (!networkHasEs()) return null
  const network = currentNetwork()
  try {
    // Drop the old key that was shared by both networks.
    sessionStorage.removeItem(TOTAL_KEY)
    const raw = sessionStorage.getItem(totalKey())
    if (raw) {
      const saved = JSON.parse(raw) as { at?: number; value?: number; network?: string }
      if (saved.at && saved.network === network && typeof saved.value === "number" && Date.now() - saved.at < 30 * 60_000) return saved.value
    }
  } catch {
    /* ignore a full or private session store */
  }
  const data = await esSearch<EsOp>(allOpIndexes(), {
    size: 0,
    query: { bool: { must_not: [{ term: { "operation_history.is_virtual": true } }] } },
    aggs: { ops: { cardinality: { field: "operation_id_num", precision_threshold: 40000 } } },
  })
  const value = data.aggregations?.ops?.value
  if (typeof value !== "number") return null
  try {
    sessionStorage.setItem(totalKey(), JSON.stringify({ at: Date.now(), value, network }))
  } catch {
    /* ignore */
  }
  return value
}

function operationTypeFilter(types: number[]): Record<string, unknown> | null {
  const unique = [...new Set(types.filter((type) => Number.isInteger(type) && type >= 0))]
  if (!unique.length) return null
  if (unique.length === 1) return { term: { operation_type: unique[0] } }
  return { terms: { operation_type: unique } }
}

export async function fetchLatestTransactions(limit: number, page = 1, types: number[] = []): Promise<OpPage> {
  const end = new Date()
  const start = new Date(end.getTime() - 3 * 86400000)
  const typeFilter = operationTypeFilter(types)
  const data = await esSearch<EsOp>(monthIndexes(start, end), {
    from: (page - 1) * limit,
    size: limit,
    track_total_hits: true,
    sort: [{ "block_data.block_time": "desc" }, { operation_id_num: "desc" }],
    query: {
      bool: {
        filter: [{ term: { "operation_history.is_virtual": false } }, ...(typeFilter ? [typeFilter] : [])],
        must_not: [{ term: { "block_data.trx_id.keyword": "" } }],
      },
    },
    collapse: { field: "block_data.trx_id.keyword" },
    _source: SOURCE,
  })
  const rows = dedupeOps(rowsFrom(data))
  await hydrateOps(rows)
  const total = esTotal(data)
  return { rows, total: total.value, relation: total.relation }
}

export async function fetchLatestOperations(limit: number, page = 1, types: number[] = []): Promise<OpPage> {
  const end = new Date()
  const start = new Date(end.getTime() - 3 * 86400000)
  const typeFilter = operationTypeFilter(types)
  const data = await esSearch<EsOp>(monthIndexes(start, end), {
    from: (page - 1) * limit,
    size: limit,
    track_total_hits: true,
    sort: [{ "block_data.block_time": "desc" }, { operation_id_num: "desc" }],
    query: typeFilter ? { bool: { filter: [typeFilter] } } : { match_all: {} },
    collapse: { field: "operation_id_num" },
    _source: SOURCE,
  })
  const rows = dedupeOps(rowsFrom(data))
  await hydrateOps(rows)
  const total = esTotal(data)
  return { rows, total: total.value, relation: total.relation }
}

export async function fetchAccountOps(
  accountId: string,
  page: number,
  pageSize: number,
  type: number | null,
): Promise<OpPage> {
  const filter: Record<string, unknown>[] = [{ term: { "account_history.account": accountId } }]
  if (type != null) filter.push({ term: { operation_type: type } })
  const offset = (page - 1) * pageSize
  let data: EsResponse<EsOp>
  if (offset + pageSize > MAX_RESULT_WINDOW && type == null) {
    data = await accountOpsBySequence(filter, offset, pageSize)
  } else {
    data = await esSearchDeep<EsOp>(
      allOpIndexes(),
      {
        size: pageSize,
        track_total_hits: true,
        sort: [{ "block_data.block_time": "desc" }, { operation_id_num: "desc" }],
        query: { bool: { filter } },
        _source: SOURCE,
      },
      offset,
    )
  }
  const rows = rowsFrom(data)
  await hydrateOps(rows)
  const total = esTotal(data)
  return { rows, total: total.value, relation: total.relation }
}

/**
 * Deep pages of one account's full history. `account_history.sequence` counts that
 * account's operations 1..N, so page k is a sequence range and needs no deep paging.
 */
async function accountOpsBySequence(
  filter: Record<string, unknown>[],
  offset: number,
  pageSize: number,
): Promise<EsResponse<EsOp>> {
  const top = await esSearch<{ account_history?: { sequence?: number } }>(allOpIndexes(), {
    size: 1,
    sort: [{ "account_history.sequence": "desc" }],
    query: { bool: { filter } },
    _source: ["account_history.sequence"],
  })
  const newest = Number(top.hits?.hits?.[0]?._source?.account_history?.sequence)
  const upper = newest - offset
  const [data, count] = await Promise.all([
    esSearch<EsOp>(allOpIndexes(), {
      size: pageSize,
      sort: [{ "account_history.sequence": "desc" }],
      query: {
        bool: { filter: [...filter, { range: { "account_history.sequence": { lte: upper, gt: upper - pageSize } } }] },
      },
      _source: SOURCE,
    }),
    esSearch<EsOp>(allOpIndexes(), { size: 0, track_total_hits: true, query: { bool: { filter } } }),
  ])
  if (data.hits) data.hits.total = count.hits?.total
  return data
}

export async function fetchTransactionOps(trxId: string): Promise<OpView[]> {
  const id = trxId.toLowerCase().replace(/^0x/, "")
  const query = { term: { "block_data.trx_id": id } }
  const sort = [{ operation_id_num: "asc" }]
  let data = await esSearch<EsOp>(monthIndex(new Date()), {
    size: 100,
    query,
    sort,
    _source: SOURCE,
  })
  if (!data.hits?.hits?.length) {
    data = await esSearch<EsOp>(allOpIndexes(), { size: 100, query, sort, _source: SOURCE })
  }
  const rows = dedupeOps(rowsFrom(data))
  await hydrateOps(rows)
  return rows
}

export async function fetchOperation(opId: string): Promise<OpView[]> {
  const numeric = opId.startsWith("1.11.") ? opId.slice(5) : opId
  const data = await esSearch<EsOp>(allOpIndexes(), {
    size: 20,
    query: {
      bool: {
        should: [
          { term: { "account_history.operation_id": opId.startsWith("1.11.") ? opId : `1.11.${numeric}` } },
          { term: { operation_id_num: Number(numeric) } },
        ],
        minimum_should_match: 1,
      },
    },
    sort: [{ "account_history.sequence": "asc" }],
    _source: SOURCE,
  })
  const rows = dedupeOps(rowsFrom(data))
  await hydrateOps(rows)
  return rows
}

export async function fetchBlockOps(blockNum: number, blockTime: string): Promise<OpView[]> {
  const when = Number.isFinite(parseChainTime(blockTime)) ? new Date(parseChainTime(blockTime)) : new Date()
  const data = await esSearch<EsOp>(monthIndex(when), {
    size: 400,
    query: { term: { "block_data.block_num": blockNum } },
    sort: [{ operation_id_num: "asc" }],
    _source: SOURCE,
  })
  const rows = dedupeOps(rowsFrom(data))
  await hydrateOps(rows)
  return rows
}

export type HolderRow = { owner: string; balance: string | number }

export async function fetchHolders(assetId: string, page: number, pageSize = 50): Promise<{
  rows: HolderRow[]
  total: number
  relation: "eq" | "gte"
}> {
  const data = await esSearch<{ owner_?: string; balance?: string | number }>(objectIndex("balance"), {
    from: (page - 1) * pageSize,
    size: pageSize,
    track_total_hits: true,
    query: {
      bool: {
        filter: [{ term: { asset_type: assetId } }, { range: { balance: { gt: 0 } } }],
      },
    },
    sort: [{ balance: "desc" }],
    _source: ["owner_", "balance", "asset_type"],
  })
  const total = esTotal(data)
  return {
    total: total.value,
    relation: total.relation,
    rows: (data.hits?.hits ?? []).map((hit) => ({
      owner: hit._source?.owner_ ?? "",
      balance: hit._source?.balance ?? 0,
    })),
  }
}

export type AuthorityAsset = { id: string; symbol: string; role: "whitelist" | "blacklist" }

export async function fetchAuthorityAssets(accountId: string): Promise<AuthorityAsset[]> {
  const data = await esSearch<{ id?: string; symbol?: string; options?: { whitelist_authorities?: string[]; blacklist_authorities?: string[] } }>(objectIndex("asset"), {
    size: 100,
    _source: ["id", "symbol", "options.whitelist_authorities", "options.blacklist_authorities"],
    query: {
      bool: {
        should: [
          { term: { "options.whitelist_authorities.keyword": accountId } },
          { term: { "options.blacklist_authorities.keyword": accountId } },
        ],
        minimum_should_match: 1,
      },
    },
  })
  const rows: AuthorityAsset[] = []
  for (const hit of data.hits?.hits ?? []) {
    const source = hit._source ?? {}
    const id = source.id || ""
    const symbol = source.symbol || id
    if (!id) continue
    if ((source.options?.whitelist_authorities ?? []).includes(accountId)) rows.push({ id, symbol, role: "whitelist" })
    if ((source.options?.blacklist_authorities ?? []).includes(accountId)) rows.push({ id, symbol, role: "blacklist" })
  }
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

export async function fetchWhitelistOps(accountId: string): Promise<OpView[]> {
  const data = await esSearch<EsOp>(allOpIndexes(), {
    size: 40,
    sort: [{ "block_data.block_time": "desc" }, { operation_id_num: "desc" }],
    query: {
      bool: {
        filter: [
          { term: { operation_type: 7 } },
          { term: { "account_history.account": accountId } },
        ],
      },
    },
    _source: SOURCE,
  })
  const rows = dedupeOps(rowsFrom(data))
  await hydrateOps(rows)
  return rows
}

export async function fetchAssetOps(assetId: string, limit = 50): Promise<OpView[]> {
  const fields = [
    "operation_history.op_object.amount.asset_id",
    "operation_history.op_object.amount_.asset_id",
    "operation_history.op_object.amount_to_sell.asset_id",
    "operation_history.op_object.min_to_receive.asset_id",
    "operation_history.op_object.asset_to_issue.asset_id",
    "operation_history.op_object.pays.asset_id",
    "operation_history.op_object.receives.asset_id",
    "operation_history.op_object.asset_id",
    "operation_history.op_object.delta_collateral.asset_id",
    "operation_history.op_object.delta_debt.asset_id",
    "operation_history.op_object.amount_to_reserve.asset_id",
  ]
  const end = new Date()
  const start = new Date(end.getTime() - 14 * 86400000)
  const data = await esSearch<EsOp>(monthIndexes(start, end), {
    size: limit,
    sort: [{ "block_data.block_time": "desc" }],
    query: {
      bool: {
        should: fields.map((field) => ({ term: { [field]: assetId } })),
        minimum_should_match: 1,
      },
    },
    collapse: { field: "operation_id_num" },
    _source: SOURCE,
  })
  const rows = dedupeOps(rowsFrom(data))
  await hydrateOps(rows)
  return rows
}

export type NormalizedFill = {
  id: string
  time: string
  account: string
  pays: Amount
  receives: Amount
  maker: boolean
  price: number
}

export async function fetchEsFills(baseId: string, quoteId: string, limit = 25): Promise<NormalizedFill[]> {
  await resolveAssets([baseId, quoteId])
  const end = new Date()
  const start = new Date(end.getTime() - 40 * 86400000)
  const data = await esSearch<EsOp>(monthIndexes(start, end), {
    size: limit,
    sort: [{ "block_data.block_time": "desc" }],
    query: {
      bool: {
        filter: [{ term: { operation_type: 4 } }],
        should: [
          {
            bool: {
              filter: [
                { term: { "operation_history.op_object.pays.asset_id": baseId } },
                { term: { "operation_history.op_object.receives.asset_id": quoteId } },
              ],
            },
          },
          {
            bool: {
              filter: [
                { term: { "operation_history.op_object.pays.asset_id": quoteId } },
                { term: { "operation_history.op_object.receives.asset_id": baseId } },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    },
    _source: SOURCE,
  })
  return (data.hits?.hits ?? []).map((hit, index) => {
    const op = toOpView(hit._source ?? {}, index)
    const pays = (op.body.pays as Amount) ?? { amount: 0, asset_id: baseId }
    const receives = (op.body.receives as Amount) ?? { amount: 0, asset_id: quoteId }
    return {
      id: op.opId || op.key,
      time: op.time,
      account: typeof op.body.account_id === "string" ? op.body.account_id : op.feePayer,
      pays,
      receives,
      maker: Boolean(op.body.is_maker),
      price: pairPrice(pays, receives, baseId, quoteId),
    }
  })
}

export function pairPrice(pays: Amount, receives: Amount, baseId: string, quoteId: string): number {
  const baseAmt = pays.asset_id === baseId ? pays : receives.asset_id === baseId ? receives : null
  const quoteAmt = pays.asset_id === quoteId ? pays : receives.asset_id === quoteId ? receives : null
  if (!baseAmt || !quoteAmt) return Number.NaN
  const b = toFloat(baseAmt.amount, peekAsset(baseAmt.asset_id)?.precision ?? 0)
  const q = toFloat(quoteAmt.amount, peekAsset(quoteAmt.asset_id)?.precision ?? 0)
  if (!q) return Number.NaN
  return b / q
}

export type ActivityDay = { date: string; ops: number }

/** ES `time_zone` for the user's UTC / Local time setting. */
function esZone(zone: string): string {
  return zone === "UTC" ? "+00:00" : zone
}

/**
 * Operations per calendar day for one account, from the operation index.
 * `start` and `end` are inclusive `YYYY-MM-DD` dates in `zone` (an IANA name or "UTC").
 */
export async function fetchAccountActivityDays(accountId: string, start: string, end: string, zone: string): Promise<ActivityDay[]> {
  const data = await esSearch(allOpIndexes(), {
    size: 0,
    track_total_hits: false,
    query: {
      bool: {
        filter: [
          { term: { "account_history.account": accountId } },
          { range: { "block_data.block_time": { gte: start, lte: end, format: "yyyy-MM-dd", time_zone: esZone(zone) } } },
        ],
      },
    },
    aggs: {
      per_day: {
        date_histogram: { field: "block_data.block_time", calendar_interval: "day", min_doc_count: 1, time_zone: esZone(zone) },
      },
    },
  })
  const buckets = data.aggregations?.per_day?.buckets ?? []
  return buckets.flatMap((bucket) => {
    const date = (bucket.key_as_string ?? "").slice(0, 10)
    return date ? [{ date, ops: bucket.doc_count ?? 0 }] : []
  })
}

/** Calendar years (in `zone`) in which the account has at least one indexed operation. */
export async function fetchAccountActiveYears(accountId: string, zone: string): Promise<number[]> {
  const data = await esSearch(allOpIndexes(), {
    size: 0,
    track_total_hits: false,
    query: { term: { "account_history.account": accountId } },
    aggs: {
      per_year: {
        date_histogram: { field: "block_data.block_time", calendar_interval: "year", min_doc_count: 1, time_zone: esZone(zone) },
      },
    },
  })
  const buckets = data.aggregations?.per_year?.buckets ?? []
  return buckets
    .map((bucket) => Number((bucket.key_as_string ?? "").slice(0, 4)))
    .filter((year) => Number.isFinite(year) && year > 2000)
    .sort((a, b) => b - a)
}
