import {
  accountLabel,
  assetSymbol,
  peekAsset,
  resolveAccounts,
  resolveAssets,
} from "./directory.ts"
import type { Amount, AssetInfo } from "./directory.ts"
import { esSearch, objectIndex } from "./es.ts"
import { asBig, formatRaw, parseChainTime, toFloat } from "./format.ts"
import { fetchEsFills } from "./history.ts"
import type { NormalizedFill } from "./history.ts"
import { coreSymbol } from "./network.ts"
import { db, hist } from "./node.ts"
import { fromSignedOp, hydrateOps } from "./ops.ts"
import type { OpView, SignedOp } from "./ops.ts"
import { pool } from "./utils.ts"

export type DynamicGlobal = {
  head_block_number: number
  head_block_id: string
  time: string
  current_witness: string
  next_maintenance_time: string
  last_irreversible_block_num: number
  witness_budget?: string | number
  recently_missed_count?: number
  accounts_registered_this_interval?: number
}

export type GlobalProps = {
  id: string
  parameters: {
    block_interval: number
    maintenance_interval: number
    witness_pay_per_block: string | number
    worker_budget_per_day: string | number
    current_fees: { parameters: Array<[number, Record<string, unknown>]>; scale: number }
    [key: string]: unknown
  }
  active_witnesses: string[]
  active_committee_members: string[]
}

export type SignedBlock = {
  previous: string
  timestamp: string
  witness: string
  transaction_merkle_root: string
  extensions: unknown[]
  witness_signature: string
  transactions: Array<{
    ref_block_num: number
    ref_block_prefix: number
    expiration: string
    operations: SignedOp[]
    extensions: unknown[]
    signatures?: string[]
  }>
}

export type BlockRow = {
  num: number
  time: string
  witness: string
  witnessName: string
  txCount: number
  previous: string
  merkle: string
  signature: string
  transactions: SignedBlock["transactions"]
  /** Sum of every operation's fee, in raw core units. An operation paid in another asset counts the BTS fee its type requires. */
  feeCore: bigint
  /** True when part of feeCore came from a non-core fee asset, so the total is an estimate. */
  feeConverted: boolean
}

export type Ticker = {
  time?: string
  base: string
  quote: string
  latest: string
  lowest_ask: string
  highest_bid: string
  percent_change: string
  base_volume: string
  quote_volume: string
}

export type OrderLevel = {
  price: string
  quote: string
  base: string
  id?: string
  owner_id?: string
  owner_name?: string
}

export type OrderBook = { base: string; quote: string; bids: OrderLevel[]; asks: OrderLevel[] }

const witnessAccounts = new Map<string, string>()

async function witnessNames(ids: string[]): Promise<Map<string, string>> {
  const missing = [...new Set(ids.filter((id) => id && !witnessAccounts.has(id)))]
  if (missing.length) {
    const objs = await db<Array<{ id: string; witness_account: string } | null>>("get_objects", [missing])
    const accounts: string[] = []
    for (const obj of objs ?? []) {
      if (obj?.id && obj.witness_account) {
        witnessAccounts.set(obj.id, obj.witness_account)
        accounts.push(obj.witness_account)
      }
    }
    await resolveAccounts(accounts)
  }
  const map = new Map<string, string>()
  for (const id of ids) {
    const account = witnessAccounts.get(id)
    map.set(id, account ? accountLabel(account) : id || "—")
  }
  return map
}

export async function fetchDynamic(): Promise<DynamicGlobal> {
  return db<DynamicGlobal>("get_dynamic_global_properties", [])
}

export async function fetchGlobal(): Promise<GlobalProps> {
  return db<GlobalProps>("get_global_properties", [])
}

let countsPromise: Promise<{ accounts: number; assets: number }> | null = null

export function fetchCounts() {
  countsPromise ??= Promise.all([db<number>("get_account_count", []), db<number>("get_asset_count", [])])
    .then(([accounts, assets]) => ({ accounts, assets }))
    .catch((error: unknown) => {
      countsPromise = null
      throw error
    })
  return countsPromise
}

export async function fetchChainId(): Promise<string> {
  return db<string>("get_chain_id", [])
}

const CORE_ID = "1.3.0"

type FeeSchedule = { scale: bigint; byOp: Map<number, Record<string, unknown>> }
let scheduleCache: { at: number; value: Promise<FeeSchedule> } | null = null

/** The current fee schedule, loaded once and kept for ten minutes (it only changes at maintenance). */
function feeSchedule(): Promise<FeeSchedule> {
  if (scheduleCache && Date.now() - scheduleCache.at < 600_000) return scheduleCache.value
  const value = fetchGlobal().then((props) => {
    const fees = props.parameters.current_fees
    return { scale: asBig(fees.scale ?? 10000), byOp: new Map(fees.parameters.map(([index, fields]) => [index, fields])) }
  })
  scheduleCache = { at: Date.now(), value }
  value.catch(() => {
    if (scheduleCache?.value === value) scheduleCache = null
  })
  return value
}

type PaidOp = { type: number; body: Record<string, unknown> }

/** Core fee total for ops paid in BTS, plus the ops paid in another asset (priced from the schedule below). */
function sumBlockFees(block: SignedBlock | null): { core: bigint; others: PaidOp[] } {
  let core = 0n
  const others: PaidOp[] = []
  for (const tx of block?.transactions ?? []) {
    for (const op of tx.operations ?? []) {
      const body = op[1] as { fee?: Amount } | undefined
      const fee = body?.fee
      if (!fee?.asset_id) continue
      if (fee.asset_id === CORE_ID) core += asBig(fee.amount)
      else others.push({ type: Number(op[0]), body: body as Record<string, unknown> })
    }
  }
  return { core, others }
}

function raw(value: unknown): bigint {
  return typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value)) ? asBig(value) : 0n
}

/**
 * The BTS fee the chain requires for one operation: the schedule entry for its type (scaled),
 * as the node computes it. Size-based parts are added where the size is known (a transfer's memo);
 * other per-kilobyte parts need the packed size and are left out, so those ops use the base fee.
 */
function requiredCoreFee(schedule: FeeSchedule, { type, body }: PaidOp): bigint {
  const fields = schedule.byOp.get(type) ?? {}
  let fee: bigint
  if (type === 5) fee = raw(fields.basic_fee)
  else if (type === 8) fee = raw(body.upgrade_to_lifetime_member ? fields.membership_lifetime_fee : fields.membership_annual_fee)
  else if (type === 10) {
    const length = String(body.symbol ?? "").length
    fee = raw(length === 3 ? fields.symbol3 : length === 4 ? fields.symbol4 : fields.long_symbol)
  } else fee = raw(fields.fee)
  if (type === 0 && body.memo && typeof body.memo === "object") {
    // optional<memo_data>: flag byte, two 33-byte keys, 8-byte nonce, then the length-prefixed message.
    const message = String((body.memo as { message?: unknown }).message ?? "")
    const bytes = Math.floor(message.length / 2)
    const prefix = bytes < 128 ? 1 : bytes < 16384 ? 2 : 3
    const size = 1 + 33 + 33 + 8 + prefix + bytes
    fee += (BigInt(size) * raw(fields.price_per_kbyte)) / 1024n
  }
  return (fee * schedule.scale) / 10000n
}

async function blockFeeTotals(sums: Array<{ core: bigint; others: PaidOp[] }>): Promise<Array<{ feeCore: bigint; feeConverted: boolean }>> {
  const needs = sums.some((sum) => sum.others.length)
  const schedule = needs ? await feeSchedule().catch(() => null) : null
  return sums.map((sum) => {
    let total = sum.core
    if (schedule) for (const op of sum.others) total += requiredCoreFee(schedule, op)
    return { feeCore: total, feeConverted: sum.others.length > 0 }
  })
}

export function blockFeeText(block: Pick<BlockRow, "feeCore" | "feeConverted">): string {
  const precision = peekAsset(CORE_ID)?.precision ?? 5
  return `${block.feeConverted ? "≈ " : ""}${formatRaw(block.feeCore, precision)} ${coreSymbol()}`
}

export async function fetchBlocks(nums: number[]): Promise<BlockRow[]> {
  const blocks = await pool(nums, 6, async (num) => {
    try {
      const block = await db<SignedBlock | null>("get_block", [num])
      return { num, block }
    } catch {
      return { num, block: null }
    }
  })
  const names = await witnessNames(blocks.map((row) => row.block?.witness ?? ""))
  const feeTotals = await blockFeeTotals(blocks.map(({ block }) => sumBlockFees(block)))
  return blocks.map(({ num, block }, index) => ({
    ...feeTotals[index]!,
    num,
    time: block?.timestamp ?? "",
    witness: block?.witness ?? "",
    witnessName: names.get(block?.witness ?? "") ?? "—",
    txCount: block?.transactions?.length ?? 0,
    previous: block?.previous ?? "",
    merkle: block?.transaction_merkle_root ?? "",
    signature: block?.witness_signature ?? "",
    transactions: block?.transactions ?? [],
  }))
}

export async function fetchBlock(num: number): Promise<BlockRow | null> {
  const [row] = await fetchBlocks([num])
  if (!row?.time) return null
  return row
}

export async function fetchTicker(base: string, quote: string): Promise<Ticker> {
  return db<Ticker>("get_ticker", [base, quote])
}

const tickerCache = new Map<string, { at: number; ticker: Ticker | null }>()

export async function fetchTickerCached(base: string, quote: string): Promise<Ticker | null> {
  const key = `${base}/${quote}`
  const hit = tickerCache.get(key)
  if (hit && Date.now() - hit.at < 60_000) return hit.ticker
  try {
    const ticker = await fetchTicker(base, quote)
    tickerCache.set(key, { at: Date.now(), ticker })
    return ticker
  } catch {
    tickerCache.set(key, { at: Date.now(), ticker: null })
    return null
  }
}

export async function priceOfAssetInBts(symbol: string): Promise<number | null> {
  const core = coreSymbol()
  if (symbol === core) return 1
  const ticker = await fetchTickerCached(core, symbol)
  const value = Number(ticker?.latest)
  return Number.isFinite(value) && value > 0 ? value : null
}

export type FullAccount = {
  account: {
    id: string
    name: string
    registrar: string
    referrer: string
    lifetime_referrer: string
    membership_expiration_date: string
    owner: Authority
    active: Authority
    options: {
      memo_key: string
      voting_account: string
      votes: string[]
      num_witness?: number
      num_committee?: number
    }
    creation_time?: string
    creation_block_num?: number
    whitelisting_accounts?: string[]
    blacklisting_accounts?: string[]
    whitelisted_accounts?: string[]
    blacklisted_accounts?: string[]
    owner_special_authority?: [number, { asset?: string; num_top_holders?: number }]
    active_special_authority?: [number, { asset?: string; num_top_holders?: number }]
  }
  statistics?: {
    total_ops?: number
    lifetime_fees_paid?: string | number
    most_recent_op?: string
    core_in_balance?: string | number
  }
  registrar_name?: string
  referrer_name?: string
  lifetime_referrer_name?: string
  balances: Array<{ asset_type: string; balance: string | number }>
  limit_orders: LimitOrder[]
  call_orders?: Array<{ id?: string; collateral?: { amount: string | number | bigint; asset_id: string }; debt?: { amount: string | number | bigint; asset_id: string } }>
  vesting_balances?: Array<{ id: string; balance?: { amount: string | number | bigint; asset_id: string }; policy?: [number, { vesting_seconds?: number }] }>
  votes?: unknown[]
  assets?: string[]
  proposals?: unknown[]
  more_data_available?: boolean | Record<string, boolean>
}

export type Authority = {
  weight_threshold: number
  account_auths: Array<[string, number]>
  key_auths: Array<[string, number]>
  address_auths?: Array<[string, number]>
}

export type LimitOrder = {
  id: string
  expiration: string
  seller: string
  for_sale: string | number
  sell_price: { base: Amount; quote: Amount }
  filled_amount?: string | number
}

export async function fetchFullAccount(nameOrId: string): Promise<FullAccount> {
  let rows: Array<[string, FullAccount | null]> | null = null
  try {
    rows = await db<Array<[string, FullAccount | null]>>("get_full_accounts", [[nameOrId], false])
  } catch {
    rows = await db<Array<[string, FullAccount | null]>>("get_full_accounts", [[nameOrId]])
  }
  const full = rows?.[0]?.[1]
  if (!full?.account) throw new Error(`Account ${nameOrId} was not found`)
  const ids = [
    ...full.balances.map((row) => row.asset_type),
    ...full.limit_orders.flatMap((order) => [order.sell_price.base.asset_id, order.sell_price.quote.asset_id]),
    full.account.registrar,
    full.account.referrer,
    full.account.lifetime_referrer,
    ...(full.account.whitelisting_accounts ?? []),
    ...(full.account.blacklisting_accounts ?? []),
  ]
  await Promise.all([resolveAssets(ids), resolveAccounts(ids)])
  return full
}

export async function fetchAccountOrders(nameOrId: string): Promise<LimitOrder[]> {
  const rows = await db<LimitOrder[]>("get_limit_orders_by_account", [nameOrId])
  const ids = rows.flatMap((order) => [order.sell_price.base.asset_id, order.sell_price.quote.asset_id])
  await resolveAssets(ids)
  return rows
}

export function moreFlag(more: FullAccount["more_data_available"], key: string): boolean {
  if (more === true) return true
  if (more && typeof more === "object") return Boolean(more[key])
  return false
}

export async function listAssets(start: string, limit: number): Promise<AssetInfo[]> {
  const rows = await db<AssetInfo[]>("list_assets", [start, limit])
  await resolveAssets(rows.map((row) => row.id))
  return rows
}

export async function fetchAssetBundle(idOrSymbol: string): Promise<{
  asset: AssetInfo
  supply: string | number
  maxSupply: string | number
  bitasset: Record<string, unknown> | null
  issuerName: string
}> {
  await resolveAssets([idOrSymbol])
  let asset = peekAsset(idOrSymbol)
  if (!asset?.id) {
    const byName = await db<Array<AssetInfo | null>>("lookup_asset_symbols", [[idOrSymbol]])
    const row = byName?.[0]
    if (row?.id) await resolveAssets([row.id])
    asset = peekAsset(row?.id || idOrSymbol) ?? row ?? undefined
  }
  if (!asset?.id) throw new Error(`Asset ${idOrSymbol} was not found`)
  const ids = [asset.dynamic_asset_data_id, asset.bitasset_data_id].filter((id): id is string => !!id)
  const objects = ids.length ? await db<Array<Record<string, unknown> | null>>("get_objects", [ids]) : []
  const dynamic = objects.find((row) => row?.id === asset!.dynamic_asset_data_id)
  const bitasset = objects.find((row) => row?.id === asset!.bitasset_data_id) ?? null
  await resolveAccounts([asset.issuer])
  return {
    asset,
    supply: (dynamic?.current_supply as string | number | undefined) ?? 0,
    maxSupply: asset.options.max_supply ?? 0,
    bitasset,
    issuerName: accountLabel(asset.issuer),
  }
}

export type WitnessRow = {
  id: string
  account: string
  name: string
  votes: string | number
  missed: number
  lastBlock: number
  url: string
  signingKey: string
  active: boolean
  voteId: string
}

export async function fetchWitnesses(): Promise<{ rows: WitnessRow[]; activeCount: number; total: number }> {
  const [global, count] = await Promise.all([fetchGlobal(), db<number>("get_witness_count", [])])
  const ids = Array.from({ length: count }, (_, index) => `1.6.${index + 1}`)
  const objects: Array<Record<string, unknown> | null> = []
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = await db<Array<Record<string, unknown> | null>>("get_objects", [ids.slice(i, i + 50)])
    objects.push(...chunk)
  }
  const active = new Set(global.active_witnesses)
  const accounts = objects
    .map((row) => (typeof row?.witness_account === "string" ? row.witness_account : ""))
    .filter(Boolean)
  await resolveAccounts(accounts)
  const rows = objects
    .filter((row): row is Record<string, unknown> => !!row && typeof row.id === "string")
    .map((row) => {
      const account = String(row.witness_account ?? "")
      return {
        id: String(row.id),
        account,
        name: accountLabel(account),
        votes: (row.total_votes as string | number) ?? 0,
        missed: Number(row.total_missed ?? 0),
        lastBlock: Number(row.last_confirmed_block_num ?? 0),
        url: typeof row.url === "string" ? row.url : "",
        signingKey: typeof row.signing_key === "string" ? row.signing_key : "",
        active: active.has(String(row.id)),
        voteId: typeof row.vote_id === "string" ? row.vote_id : "",
      }
    })
    .sort((a, b) => (asBig(b.votes) > asBig(a.votes) ? 1 : -1))
  return { rows, activeCount: global.active_witnesses.length, total: count }
}

export type CommitteeRow = {
  id: string
  account: string
  name: string
  votes: string | number
  url: string
  active: boolean
  voteId: string
}

export async function fetchCommittee(): Promise<{ rows: CommitteeRow[]; activeCount: number; total: number }> {
  const [global, count] = await Promise.all([fetchGlobal(), db<number>("get_committee_count", [])])
  const ids = Array.from({ length: count }, (_, index) => `1.5.${index + 1}`)
  const objects: Array<Record<string, unknown> | null> = []
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = await db<Array<Record<string, unknown> | null>>("get_objects", [ids.slice(i, i + 50)])
    objects.push(...(chunk ?? []))
  }
  const active = new Set(global.active_committee_members)
  await resolveAccounts(objects.map((row) => (typeof row?.committee_member_account === "string" ? row.committee_member_account : "")))
  const rows = (objects ?? [])
    .filter((row): row is Record<string, unknown> => !!row && typeof row.id === "string")
    .map((row) => {
      const account = String(row.committee_member_account ?? "")
      return {
        id: String(row.id),
        account,
        name: accountLabel(account),
        votes: (row.total_votes as string | number) ?? 0,
        url: typeof row.url === "string" ? row.url : "",
        active: active.has(String(row.id)),
        voteId: typeof row.vote_id === "string" ? row.vote_id : "",
      }
    })
    .sort((a, b) => (asBig(b.votes) > asBig(a.votes) ? 1 : -1))
  return { rows, activeCount: global.active_committee_members.length, total: count }
}

export type WorkerRow = {
  id: string
  account: string
  name: string
  title: string
  url: string
  dailyPay: string | number
  votesFor: string | number
  votesAgainst: string | number
  net: bigint
  begin: string
  end: string
  type: string
  state: "active" | "pending" | "expired"
  funding: "funded" | "partial" | "unfunded"
  funded: boolean
  vestingId: string
  voteFor: string
  voteAgainst: string
}

export type WorkerPage = {
  rows: WorkerRow[]
  dailyBudget: bigint
  intervalBudget: bigint
  intervalSec: number
  leftover: bigint
  threshold: bigint | null
  totalDailyPay: bigint
  activeCount: number
}

const WORKER_TYPES = ["Refund", "Vesting", "Burn"]

async function latestWorkerBudget(dailyBudget: bigint): Promise<{ intervalBudget: bigint; intervalSec: number; leftover: bigint }> {
  try {
    const data = await esSearch<{ record?: { worker_budget?: string | number; time_since_last_budget?: number; leftover_worker_funds?: string | number } }>(objectIndex("budget"), {
      size: 1,
      sort: [{ block_number: "desc" }],
      _source: ["record.worker_budget", "record.time_since_last_budget", "record.leftover_worker_funds"],
    })
    const record = data.hits?.hits?.[0]?._source?.record
    if (!record) throw new Error("no budget")
    return {
      intervalBudget: asBig(record.worker_budget ?? 0),
      intervalSec: Number(record.time_since_last_budget) || 3600,
      leftover: asBig(record.leftover_worker_funds ?? 0),
    }
  } catch {
    return { intervalBudget: dailyBudget, intervalSec: 86400, leftover: 0n }
  }
}

async function fetchWorkerObjects(): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = []
  const size = 50
  for (let start = 0; ; start += size) {
    const ids = Array.from({ length: size }, (_, index) => `1.14.${start + index}`)
    const chunk = await db<Array<Record<string, unknown> | null>>("get_objects", [ids])
    let ended = false
    for (const row of chunk ?? []) {
      if (!row || typeof row.id !== "string") {
        ended = true
        break
      }
      rows.push(row)
    }
    if (ended || (chunk ?? []).length < size) break
  }
  return rows
}

export async function fetchWorkers(): Promise<WorkerPage> {
  const [workers, global] = await Promise.all([
    fetchWorkerObjects(),
    fetchGlobal(),
  ])
  await resolveAccounts(workers.map((row) => String(row.worker_account ?? "")))
  const now = Date.now()
  const dailyBudget = asBig(global.parameters.worker_budget_per_day)
  const budget = await latestWorkerBudget(dailyBudget)
  const mapped = workers.map((row) => {
    const begin = String(row.work_begin_date ?? "")
    const end = String(row.work_end_date ?? "")
    const beginMs = parseChainTime(begin)
    const endMs = parseChainTime(end)
    const state: WorkerRow["state"] = now < beginMs ? "pending" : now > endMs ? "expired" : "active"
    const variant = Array.isArray(row.worker) ? Number(row.worker[0]) : 0
    const body = Array.isArray(row.worker) ? (row.worker[1] as { balance?: string } | undefined) : undefined
    const net = asBig(row.total_votes_for as string | number) - asBig(row.total_votes_against as string | number)
    return {
      id: String(row.id),
      account: String(row.worker_account ?? ""),
      name: accountLabel(String(row.worker_account ?? "")),
      title: String(row.name ?? ""),
      url: typeof row.url === "string" ? row.url : "",
      dailyPay: (row.daily_pay as string | number) ?? 0,
      votesFor: (row.total_votes_for as string | number) ?? 0,
      votesAgainst: (row.total_votes_against as string | number) ?? 0,
      net,
      begin,
      end,
      type: WORKER_TYPES[variant] ?? `Type ${variant}`,
      state,
      funding: "unfunded" as WorkerRow["funding"],
      funded: false,
      vestingId: typeof body?.balance === "string" ? body.balance : "",
      voteFor: typeof row.vote_for === "string" ? row.vote_for : "",
      voteAgainst: typeof row.vote_against === "string" ? row.vote_against : "",
    }
  })
  const active = mapped
    .filter((row) => row.state === "active" && row.net > 0n)
    .sort((a, b) => (a.net > b.net ? -1 : a.net < b.net ? 1 : 0))
  let remaining = budget.intervalBudget
  let threshold: bigint | null = null
  let totalDailyPay = 0n
  for (const row of active) {
    const intervalPay = asBig(row.dailyPay) * BigInt(budget.intervalSec) / 86400n
    if (remaining <= 0n || intervalPay <= 0n) continue
    if (remaining >= intervalPay) {
      row.funding = "funded"
      row.funded = true
      remaining -= intervalPay
      totalDailyPay += asBig(row.dailyPay)
      threshold = row.net
    } else {
      row.funding = "partial"
      row.funded = true
      totalDailyPay += remaining * 86400n / BigInt(budget.intervalSec)
      remaining = 0n
      threshold = row.net
    }
  }
  mapped.sort((a, b) => (a.net > b.net ? -1 : a.net < b.net ? 1 : 0))
  return {
    rows: mapped,
    dailyBudget,
    intervalBudget: budget.intervalBudget,
    intervalSec: budget.intervalSec,
    leftover: budget.leftover,
    threshold,
    totalDailyPay,
    activeCount: mapped.filter((row) => row.state === "active" && row.funding !== "unfunded").length,
  }
}

export type VoteInfo = {
  voteId: string
  kind: "Witness" | "Committee" | "Worker"
  name: string
  account: string
  objectId: string
}

let voteMapPromise: Promise<Map<string, VoteInfo>> | null = null

export function fetchVoteMap() {
  voteMapPromise ??= buildVoteMap().catch((error: unknown) => {
    voteMapPromise = null
    throw error
  })
  return voteMapPromise
}

async function buildVoteMap() {
  const [witnesses, committee, workers] = await Promise.all([fetchWitnesses(), fetchCommittee(), fetchWorkers()])
  const map = new Map<string, VoteInfo>()
  for (const row of witnesses.rows) {
    if (!row.voteId) continue
    map.set(row.voteId, { voteId: row.voteId, kind: "Witness", name: row.name, account: row.account, objectId: row.id })
  }
  for (const row of committee.rows) {
    if (!row.voteId) continue
    map.set(row.voteId, { voteId: row.voteId, kind: "Committee", name: row.name, account: row.account, objectId: row.id })
  }
  for (const row of workers.rows) {
    if (row.voteFor) {
      map.set(row.voteFor, {
        voteId: row.voteFor,
        kind: "Worker",
        name: `${row.title} (for)`,
        account: row.account,
        objectId: row.id,
      })
    }
    if (row.voteAgainst) {
      map.set(row.voteAgainst, {
        voteId: row.voteAgainst,
        kind: "Worker",
        name: `${row.title} (against)`,
        account: row.account,
        objectId: row.id,
      })
    }
  }
  return map
}

export async function fetchOrderBook(base: string, quote: string, limit = 20): Promise<OrderBook> {
  return db<OrderBook>("get_order_book", [base, quote, limit])
}

type RawFill = {
  id?: string
  time: string
  op: {
    account_id?: string
    pays: Amount
    receives: Amount
    is_maker?: boolean
  }
}

export async function fetchFills(base: string, quote: string, limit = 25): Promise<NormalizedFill[]> {
  await resolveAssets([base, quote])
  const baseAsset = peekAsset(base)
  const quoteAsset = peekAsset(quote)
  try {
    const rows = await hist<RawFill[]>("get_fill_order_history", [base, quote, limit])
    if (Array.isArray(rows)) {
      const ids = rows.map((row) => row.op.account_id).filter((id): id is string => !!id)
      await resolveAccounts(ids)
      return rows.map((row) => ({
        id: row.id ?? row.time,
        time: row.time,
        account: row.op.account_id ?? "",
        pays: row.op.pays,
        receives: row.op.receives,
        maker: Boolean(row.op.is_maker),
        price: tradePrice(row.op.pays, row.op.receives, baseAsset?.id ?? "", quoteAsset?.id ?? ""),
      }))
    }
  } catch {
    /* Elasticsearch keeps the same fill_order history when the node socket is down. */
  }
  if (!baseAsset?.id || !quoteAsset?.id) return []
  const fills = await fetchEsFills(baseAsset.id, quoteAsset.id, limit)
  await resolveAccounts(fills.map((row) => row.account))
  return fills
}

function tradePrice(pays: Amount, receives: Amount, baseId: string, quoteId: string): number {
  const baseAmt = pays.asset_id === baseId ? pays : receives.asset_id === baseId ? receives : null
  const quoteAmt = pays.asset_id === quoteId ? pays : receives.asset_id === quoteId ? receives : null
  if (!baseAmt || !quoteAmt) return Number.NaN
  const b = toFloat(baseAmt.amount, peekAsset(baseAmt.asset_id)?.precision ?? 0)
  const q = toFloat(quoteAmt.amount, peekAsset(quoteAmt.asset_id)?.precision ?? 0)
  if (!q) return Number.NaN
  return b / q
}

export type CandlePoint = { date: string; price: number }

type MarketBucket = {
  key: { base: string; quote: string; open: string }
  close_base: string | number
  close_quote: string | number
}

export async function fetchDailyCloses(base: string, quote: string, start: Date, end: Date): Promise<CandlePoint[]> {
  await resolveAssets([base, quote])
  const baseAsset = peekAsset(base)
  const quoteAsset = peekAsset(quote)
  if (!baseAsset?.id || !quoteAsset?.id) return []
  const rows = await hist<MarketBucket[]>("get_market_history", [
    baseAsset.id,
    quoteAsset.id,
    86400,
    start.toISOString().slice(0, 19),
    end.toISOString().slice(0, 19),
  ])
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => ({ date: row.key.open.slice(0, 10), price: candlePrice(row, baseAsset, quoteAsset) }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0)
}

export async function fetchCandles(base: string, quote: string): Promise<CandlePoint[]> {
  const end = new Date()
  const start = new Date(Date.now() - 30 * 86400000)
  return fetchDailyCloses(base, quote, start, end)
}

function candlePrice(row: MarketBucket, base: AssetInfo, quote: AssetInfo): number {
  const histBase = row.key.base
  const histQuote = row.key.quote
  const bPrec = histBase === base.id ? base.precision : quote.precision
  const qPrec = histQuote === quote.id ? quote.precision : base.precision
  const b = toFloat(row.close_base, bPrec)
  const q = toFloat(row.close_quote, qPrec)
  if (!b || !q) return Number.NaN
  if (histBase === base.id && histQuote === quote.id) return b / q
  if (histBase === quote.id && histQuote === base.id) return q / b
  return b / q
}

type TopMarket = { base: string; quote: string; base_volume?: string; quote_volume?: string }

const SMARTCOIN_PAIRS: Array<[string, string]> = [
  ["USD", "BTS"],
  ["CNY", "BTS"],
  ["EUR", "BTS"],
  ["BTC", "BTS"],
  ["GOLD", "BTS"],
  ["SILVER", "BTS"],
  ["RUB", "BTS"],
  ["HONEST.USD", "BTS"],
]

function btsVolume(row: TopMarket): number {
  if (row.quote === "BTS") return Number(row.quote_volume) || 0
  if (row.base === "BTS") return Number(row.base_volume) || 0
  return 0
}

function otherAsset(row: TopMarket): string {
  if (row.base === "BTS") return row.quote
  if (row.quote === "BTS") return row.base
  return ""
}

async function featuredPairs(): Promise<Array<[string, string]>> {
  const core = coreSymbol()
  if (core !== "BTS") return ["USD", "CNY", "BTC", "BTS"].map((base) => [base, core] as [string, string])
  const top = await db<TopMarket[]>("get_top_markets", [100]).catch(() => [])
  const xbtsx = top
    .map((row) => ({ symbol: otherAsset(row), volume: btsVolume(row) }))
    .filter((row) => row.symbol.startsWith("XBTSX.") && row.volume > 0)
    .sort((a, b) => b.volume - a.volume)
    .map((row) => row.symbol)
  const gateway = [...new Set(["XBTSX.USDT", "XBTSX.BTC", "XBTSX.ETH", ...xbtsx])].slice(0, 8)
  const pairs: Array<[string, string]> = [
    ...SMARTCOIN_PAIRS,
    ...gateway.map((symbol) => ["BTS", symbol] as [string, string]),
    ["BTS", "DEFI"],
  ]
  return pairs.filter((pair) => !pair[0].startsWith("OPEN.") && !pair[1].startsWith("OPEN."))
}

export async function fetchFeaturedMarkets(): Promise<Array<{ base: string; quote: string; ticker: Ticker | null }>> {
  const pairs = await featuredPairs()
  await resolveAssets([...new Set(pairs.flat())])
  const live = pairs.filter(([base, quote]) => peekAsset(base)?.id && peekAsset(quote)?.id)
  return pool(live, 4, async ([base, quote]) => ({
    base,
    quote,
    ticker: await fetchTickerCached(base, quote),
  }))
}

export async function fetchObject(id: string): Promise<unknown> {
  const rows = await db<unknown[]>("get_objects", [[id]])
  return rows?.[0] ?? null
}

export async function signedOpsForBlock(block: BlockRow, esOps: OpView[]): Promise<{
  transactions: Array<{ trxId: string; index: number; expiration: string; signatures: string[]; ops: OpView[] }>
  virtuals: OpView[]
}> {
  const idByIndex = new Map<number, string>()
  for (const op of esOps) {
    if (op.trxId && !op.virtual) idByIndex.set(op.trxInBlock, op.trxId)
  }
  const transactions = block.transactions.map((tx, index) => {
    const trxId = idByIndex.get(index) ?? ""
    const ops = tx.operations.map((op, opIndex) => fromSignedOp(block.num, block.time, trxId, index, opIndex, op))
    return { trxId, index, expiration: tx.expiration, signatures: tx.signatures ?? [], ops }
  })
  await hydrateOps(transactions.flatMap((tx) => tx.ops))
  const virtuals = esOps.filter((op) => op.virtual || !op.trxId)
  return { transactions, virtuals }
}

export function feedPriceText(feed: unknown): string {
  if (!feed || typeof feed !== "object") return "—"
  const settlement = (feed as { settlement_price?: { base?: Amount; quote?: Amount } }).settlement_price
  const base = settlement?.base
  const quote = settlement?.quote
  if (!base || !quote) return "—"
  const b = toFloat(base.amount, peekAsset(base.asset_id)?.precision ?? 0)
  const q = toFloat(quote.amount, peekAsset(quote.asset_id)?.precision ?? 0)
  if (!q) return "—"
  return `1 ${assetSymbol(quote.asset_id)} = ${(b / q).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${assetSymbol(base.asset_id)}`
}

export async function lookupAccountPrefix(prefix: string, limit = 12): Promise<Array<[string, string]>> {
  const rows = await db<Array<[string, string]>>("lookup_accounts", [prefix.toLowerCase(), limit])
  return rows ?? []
}

export async function lookupAssetPrefix(prefix: string, limit = 12): Promise<AssetInfo[]> {
  const rows = await db<AssetInfo[]>("list_assets", [prefix.toUpperCase(), limit])
  return (rows ?? []).filter((row) => row.symbol.toUpperCase().startsWith(prefix.toUpperCase()))
}

export async function lookupKey(key: string): Promise<string[]> {
  const rows = await db<string[][]>("get_key_references", [[key]])
  const ids = rows?.[0] ?? []
  await resolveAccounts(ids)
  return ids
}
