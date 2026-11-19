import { resolveAccounts, resolveAssets } from "./directory.ts"
import { translate } from "./i18n.tsx"
import type { Amount } from "./directory.ts"
import { allOpIndexes, esSearch, esTotal, monthIndexes } from "./es.ts"
import { asBig, toFloat } from "./format.ts"
import { dedupeOps, hydrateOps, toOpView } from "./ops.ts"
import type { OpView } from "./ops.ts"
import { db, hist } from "./node.ts"

export type Pool = {
  id: string
  asset_a: string
  asset_b: string
  balance_a: string | number
  balance_b: string | number
  share_asset: string
  taker_fee_percent: number
  withdrawal_fee_percent: number
  virtual_value: string | number
}

export type CreditOffer = {
  id: string
  owner_account: string
  asset_type: string
  total_balance: string | number
  current_balance: string | number
  fee_rate: number
  max_duration_seconds: number
  min_deal_amount: string | number
  enabled: boolean
  auto_disable_time: string
  acceptable_collateral: Array<[string, { base: Amount; quote: Amount }]>
  acceptable_borrowers: Array<[string, number] | string>
}

export type CreditDeal = {
  id: string
  borrower: string
  offer_id: string
  offer_owner: string
  debt_asset: string
  debt_amount: string | number
  collateral_asset: string
  collateral_amount: string | number
  fee_rate: number
  latest_repay_time: string
  auto_repay: number | string
}

export type SametFund = {
  id: string
  owner_account: string
  asset_type: string
  balance: string | number
  fee_rate: number
  unpaid_amount: string | number
}

export type Ticket = {
  id: string
  account: string
  target_type: string
  amount: Amount
  current_type: string
  status: string
  value: string | number
  next_auto_update_time: string
  next_type_downgrade_time: string
}

export const LOCKS: Record<string, { label: string; power: string }> = {
  liquid: { label: "Liquid", power: "1×" },
  lock_180_days: { label: "180 days", power: "2×" },
  lock_360_days: { label: "360 days", power: "4×" },
  lock_720_days: { label: "720 days", power: "8×" },
  lock_forever: { label: "Forever", power: "8×" },
}

export function lockInfo(type: string | undefined): { label: string; power: string } {
  if (!type) return { label: "—", power: "—" }
  const known = LOCKS[type]
  if (!known) return { label: translate(type.replaceAll("_", " ")), power: "—" }
  return { label: translate(known.label), power: known.power }
}

export type PoolEvent = {
  id: string
  time: string
  opType: number
  body: Record<string, unknown>
  result: unknown
}

async function loadAll<T extends { id: string }>(method: string): Promise<T[]> {
  const out: T[] = []
  let start: string | undefined
  for (let page = 0; page < 40; page += 1) {
    const rows = await db<T[]>(method, start ? [100, start] : [100])
    if (!rows?.length) break
    const fresh = start && rows[0]?.id === start ? rows.slice(1) : rows
    out.push(...fresh)
    if (rows.length < 100) break
    const next = rows[rows.length - 1]?.id
    if (!next || next === start) break
    start = next
  }
  return out
}

let poolsCache: Promise<Pool[]> | null = null
let offersCache: Promise<CreditOffer[]> | null = null
let dealsCache: Promise<CreditDeal[]> | null = null
let fundsCache: Promise<SametFund[]> | null = null
let ticketsCache: Promise<Ticket[]> | null = null

function cached<T>(slot: Promise<T> | null, set: (value: Promise<T> | null) => void, load: () => Promise<T>): Promise<T> {
  if (!slot) {
    const pending = load().catch((error: unknown) => {
      set(null)
      throw error
    })
    set(pending)
    return pending
  }
  return slot
}

export function fetchAllPools() {
  return cached(poolsCache, (value) => { poolsCache = value }, () => loadAll<Pool>("list_liquidity_pools"))
}
export function fetchAllOffers() {
  return cached(offersCache, (value) => { offersCache = value }, () => loadAll<CreditOffer>("list_credit_offers"))
}
export function fetchAllDeals() {
  return cached(dealsCache, (value) => { dealsCache = value }, () => loadAll<CreditDeal>("list_credit_deals"))
}
export function fetchAllFunds() {
  return cached(fundsCache, (value) => { fundsCache = value }, () => loadAll<SametFund>("list_samet_funds"))
}
export function fetchAllTickets() {
  return cached(ticketsCache, (value) => { ticketsCache = value }, () => loadAll<Ticket>("list_tickets"))
}

/** Constant-product estimate: both sides are equal value, so TVL is twice the BTS side. */
export function poolTvlBts(pool: Pool): number | null {
  if (pool.asset_a === "1.3.0") return 2 * toFloat(pool.balance_a, 5)
  if (pool.asset_b === "1.3.0") return 2 * toFloat(pool.balance_b, 5)
  return null
}

export function poolPrice(pool: Pool, precA: number, precB: number): number | null {
  const a = toFloat(pool.balance_a, precA)
  const b = toFloat(pool.balance_b, precB)
  if (!a || !b) return null
  return a / b
}

export type DefiStats = {
  pools: number
  tvlBts: number
  pricedPools: number
  offers: number
  enabledOffers: number
  deals: number
  funds: number
  tickets: number
  lockedBts: number
  votingPower: number
  byLock: Array<{ type: string; count: number; amount: number; power: number }>
}

export async function fetchDefiStats(): Promise<DefiStats> {
  const [pools, offers, deals, funds, tickets] = await Promise.all([
    fetchAllPools(),
    fetchAllOffers(),
    fetchAllDeals(),
    fetchAllFunds(),
    fetchAllTickets(),
  ])
  const byType = new Map<string, { count: number; amount: number; power: number }>()
  let lockedBts = 0
  let votingPower = 0
  for (const ticket of tickets) {
    const asset = ticket.amount?.asset_id
    const amount = asset === "1.3.0" ? toFloat(ticket.amount.amount, 5) : 0
    const power = toFloat(ticket.value, 5)
    lockedBts += amount
    votingPower += power
    const row = byType.get(ticket.current_type) ?? { count: 0, amount: 0, power: 0 }
    row.count += 1
    row.amount += amount
    row.power += power
    byType.set(ticket.current_type, row)
  }
  const tvlBts = pools.reduce((sum, pool) => sum + (poolTvlBts(pool) ?? 0), 0)
  return {
    pools: pools.length,
    tvlBts,
    pricedPools: pools.filter((pool) => poolTvlBts(pool) != null).length,
    offers: offers.length,
    enabledOffers: offers.filter((offer) => offer.enabled).length,
    deals: deals.length,
    funds: funds.length,
    tickets: tickets.length,
    lockedBts,
    votingPower,
    byLock: [...byType.entries()]
      .map(([type, row]) => ({ type, ...row }))
      .sort((a, b) => b.amount - a.amount),
  }
}

export async function fetchPool(id: string): Promise<Pool | null> {
  const rows = await db<Array<Pool | null>>("get_objects", [[id]])
  const pool = rows?.[0]
  if (!pool?.asset_a) return null
  await resolveAssets([pool.asset_a, pool.asset_b, pool.share_asset])
  return pool
}

export async function fetchOffer(id: string): Promise<CreditOffer | null> {
  const rows = await db<Array<CreditOffer | null>>("get_objects", [[id]])
  const offer = rows?.[0]
  if (!offer?.owner_account) return null
  const collateral = (offer.acceptable_collateral ?? []).map((row) => row[0])
  await Promise.all([
    resolveAccounts([offer.owner_account, ...borrowerIds(offer)]),
    resolveAssets([offer.asset_type, ...collateral]),
  ])
  return offer
}

export function borrowerIds(offer: CreditOffer): string[] {
  return (offer.acceptable_borrowers ?? [])
    .map((row) => (Array.isArray(row) ? row[0] : row))
    .filter((id): id is string => typeof id === "string")
}

export async function fetchDealsForOffer(offerId: string): Promise<CreditDeal[]> {
  const rows = await db<CreditDeal[]>("get_credit_deals_by_offer_id", [offerId])
  const deals = rows ?? []
  await Promise.all([
    resolveAccounts(deals.flatMap((deal) => [deal.borrower, deal.offer_owner])),
    resolveAssets(deals.flatMap((deal) => [deal.debt_asset, deal.collateral_asset])),
  ])
  return deals
}

export async function fetchDeal(id: string): Promise<CreditDeal | null> {
  const rows = await db<Array<CreditDeal | null>>("get_objects", [[id]])
  const deal = rows?.[0]
  if (!deal?.borrower) return null
  await Promise.all([
    resolveAccounts([deal.borrower, deal.offer_owner]),
    resolveAssets([deal.debt_asset, deal.collateral_asset]),
  ])
  return deal
}

export async function fetchFund(id: string): Promise<SametFund | null> {
  const rows = await db<Array<SametFund | null>>("get_objects", [[id]])
  const fund = rows?.[0]
  if (!fund?.owner_account) return null
  await Promise.all([resolveAccounts([fund.owner_account]), resolveAssets([fund.asset_type])])
  return fund
}

export async function fetchTicket(id: string): Promise<Ticket | null> {
  const rows = await db<Array<Ticket | null>>("get_objects", [[id]])
  const ticket = rows?.[0]
  if (!ticket?.account) return null
  await Promise.all([resolveAccounts([ticket.account]), resolveAssets([ticket.amount?.asset_id])])
  return ticket
}

export async function fetchPoolHistory(id: string, limit = 30): Promise<PoolEvent[]> {
  const now = new Date().toISOString().slice(0, 19)
  const rows = await hist<Array<Record<string, unknown>>>("get_liquidity_pool_history", [id, now, "2019-01-01T00:00:00", limit])
  if (!Array.isArray(rows)) return []
  const events = rows.map((row) => {
    const wrapped = row.op as { op?: [number, Record<string, unknown>]; result?: [number, unknown] } | undefined
    return {
      id: String(row.id ?? ""),
      time: String(row.time ?? ""),
      opType: Number(row.op_type ?? wrapped?.op?.[0] ?? -1),
      body: wrapped?.op?.[1] ?? {},
      result: wrapped?.result?.[1],
    }
  })
  const accounts = new Set<string>()
  const assets = new Set<string>()
  for (const event of events) {
    for (const value of Object.values(event.body)) {
      if (typeof value === "string" && /^1\.2\.\d+$/.test(value)) accounts.add(value)
      const amount = value as Amount
      if (amount && typeof amount === "object" && typeof amount.asset_id === "string") assets.add(amount.asset_id)
    }
  }
  await Promise.all([resolveAccounts([...accounts]), resolveAssets([...assets])])
  return events
}

export async function fetchRecentOps(types: number[], limit = 12): Promise<OpView[]> {
  const end = new Date()
  const start = new Date(end.getTime() - 120 * 86400000)
  const body = {
    size: limit,
    sort: [{ "block_data.block_time": "desc" }, { operation_id_num: "desc" }],
    query: { terms: { operation_type: types } },
    collapse: { field: "operation_id_num" },
    _source: ["block_data", "operation_type", "operation_id_num", "operation_history", "account_history"],
  }
  let data = await esSearch<Parameters<typeof toOpView>[0]>(monthIndexes(start, end), body)
  if (!data.hits?.hits?.length) {
    data = await esSearch(allOpIndexes(), body)
  }
  const rows = dedupeOps((data.hits?.hits ?? []).map((hit, index) => toOpView(hit._source ?? {}, index)))
  await hydrateOps(rows)
  return rows
}

export async function countPoolSwaps(poolId: string): Promise<number | null> {
  try {
    const end = new Date()
    const start = new Date(end.getTime() - 7 * 86400000)
    const data = await esSearch(monthIndexes(start, end), {
      size: 0,
      track_total_hits: true,
      query: {
        bool: {
          filter: [
            { term: { operation_type: 63 } },
            { term: { "operation_history.op_object.pool": poolId } },
            { range: { "block_data.block_time": { gte: start.toISOString() } } },
          ],
        },
      },
    })
    return esTotal(data).value
  } catch {
    return null
  }
}

export async function fetchAccountPools(account: string) {
  const rows = await db<Pool[]>("get_liquidity_pools_by_owner", [account])
  await resolveAssets((rows ?? []).flatMap((pool) => [pool.asset_a, pool.asset_b, pool.share_asset]))
  return rows ?? []
}

export async function fetchAccountOffers(account: string) {
  const rows = await db<CreditOffer[]>("get_credit_offers_by_owner", [account])
  await Promise.all([
    resolveAccounts((rows ?? []).map((row) => row.owner_account)),
    resolveAssets((rows ?? []).map((row) => row.asset_type)),
  ])
  return rows ?? []
}

export async function fetchAccountDeals(account: string) {
  const [borrowed, lent] = await Promise.all([
    db<CreditDeal[]>("get_credit_deals_by_borrower", [account]).catch(() => [] as CreditDeal[]),
    db<CreditDeal[]>("get_credit_deals_by_offer_owner", [account]).catch(() => [] as CreditDeal[]),
  ])
  const map = new Map<string, CreditDeal & { role: string }>()
  for (const deal of borrowed ?? []) map.set(deal.id, { ...deal, role: "Borrower" })
  for (const deal of lent ?? []) {
    const existing = map.get(deal.id)
    map.set(deal.id, { ...deal, role: existing ? "Borrower and lender" : "Lender" })
  }
  const rows = [...map.values()]
  await Promise.all([
    resolveAccounts(rows.flatMap((row) => [row.borrower, row.offer_owner])),
    resolveAssets(rows.flatMap((row) => [row.debt_asset, row.collateral_asset])),
  ])
  return rows
}

export async function fetchAccountFunds(account: string) {
  const rows = await db<SametFund[]>("get_samet_funds_by_owner", [account])
  await Promise.all([
    resolveAccounts((rows ?? []).map((row) => row.owner_account)),
    resolveAssets((rows ?? []).map((row) => row.asset_type)),
  ])
  return rows ?? []
}

export async function fetchAccountTickets(account: string) {
  const rows = await db<Ticket[]>("get_tickets_by_account", [account])
  await Promise.all([
    resolveAccounts((rows ?? []).map((row) => row.account)),
    resolveAssets((rows ?? []).map((row) => row.amount?.asset_id)),
  ])
  return rows ?? []
}

export function coreAmount(value: string | number | bigint | undefined): number {
  return toFloat(asBig(value ?? 0), 5)
}
