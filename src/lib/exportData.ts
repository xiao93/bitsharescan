import { fetchFullAccount } from "./chain.ts"
import type { FullAccount } from "./chain.ts"
import { peekAsset, resolveAssets } from "./directory.ts"
import { allOpIndexes, esSearch, esTotal } from "./es.ts"
import { formatRaw, formatTime } from "./format.ts"
import { fetchRelatedAccounts, proxyStake } from "./relations.ts"
import { opLabel, opSummary, OPERATIONS, toOpView } from "./ops.ts"
import { getTimeMode, localOffsetLabel, localTimeZoneName } from "./timePref.ts"
import type { OpView } from "./ops.ts"
import type { EsResponse } from "./es.ts"

function rowsFrom(data: EsResponse<Parameters<typeof toOpView>[0]>) {
  return (data.hits?.hits ?? []).map((hit, index) => toOpView(hit._source ?? {} as Parameters<typeof toOpView>[0], index))
}

const SOURCE = ["block_data", "operation_type", "operation_id_num", "operation_history", "account_history"]

function typeIds(slugs: string[]): number[] {
  return slugs.map((slug) => OPERATIONS.findIndex((op) => op.slug === slug)).filter((id) => id >= 0)
}

export const EXPORT_TYPES = [
  { id: "operations", label: "Operations (all)", kinds: "ops" as const, types: null },
  { id: "transfers", label: "Transfers", kinds: "ops" as const, types: typeIds(["transfer", "override_transfer"]) },
  { id: "orders", label: "Limit orders created/cancelled", kinds: "ops" as const, types: typeIds(["limit_order_create", "limit_order_cancel", "limit_order_update"]) },
  { id: "fills", label: "Fills (DEX trades)", kinds: "ops" as const, types: typeIds(["fill_order"]) },
  { id: "pools", label: "Liquidity pool ops (deposit/withdraw/exchange)", kinds: "ops" as const, types: typeIds(["liquidity_pool_deposit", "liquidity_pool_withdraw", "liquidity_pool_exchange"]) },
  { id: "credit", label: "Credit offers/deals (lending)", kinds: "ops" as const, types: typeIds(["credit_offer_create", "credit_offer_delete", "credit_offer_update", "credit_offer_accept", "credit_deal_repay", "credit_deal_expired", "credit_deal_update"]) },
  { id: "samet", label: "SameT fund / flash loan ops", kinds: "ops" as const, types: typeIds(["samet_fund_create", "samet_fund_delete", "samet_fund_update", "samet_fund_borrow", "samet_fund_repay"]) },
  { id: "tickets", label: "Tickets (locking)", kinds: "ops" as const, types: typeIds(["ticket_create", "ticket_update"]) },
  { id: "votes", label: "Votes/account update", kinds: "ops" as const, types: typeIds(["account_update"]) },
  { id: "balances", label: "Balances snapshot", kinds: "balances" as const, types: null },
  { id: "vesting", label: "Vesting balances", kinds: "vesting" as const, types: null },
  { id: "registered", label: "Registered accounts", kinds: "registrar" as const, types: null },
  { id: "referred", label: "Referred accounts", kinds: "referrer" as const, types: null },
  { id: "proxies", label: "Vote proxies", kinds: "proxies" as const, types: null },
]

export type ExportType = (typeof EXPORT_TYPES)[number]

export function exportType(id: string): ExportType {
  return EXPORT_TYPES.find((item) => item.id === id) ?? EXPORT_TYPES[0]!
}

export async function resolveExportAccount(nameOrId: string): Promise<{ id: string; name: string } | null> {
  const trimmed = nameOrId.trim()
  if (!trimmed) return null
  const full = await fetchFullAccount(trimmed)
  if (!full?.account) return null
  return { id: full.account.id, name: full.account.name }
}

function filters(accountId: string, spec: ExportType, range: { fromDate: string; toDate: string; fromBlock: string; toBlock: string }) {
  const filter: Record<string, unknown>[] = [{ term: { "account_history.account": accountId } }]
  if (spec.types?.length) filter.push({ terms: { operation_type: spec.types } })
  if (range.fromDate || range.toDate) {
    const bounds: Record<string, string> = {}
    if (range.fromDate) bounds.gte = `${range.fromDate}T00:00:00`
    if (range.toDate) bounds.lte = `${range.toDate}T23:59:59`
    filter.push({ range: { "block_data.block_time": bounds } })
  }
  if (range.fromBlock || range.toBlock) {
    const bounds: Record<string, number> = {}
    if (range.fromBlock) bounds.gte = Number(range.fromBlock)
    if (range.toBlock) bounds.lte = Number(range.toBlock)
    filter.push({ range: { "block_data.block_num": bounds } })
  }
  return filter
}

export async function countOps(accountId: string, spec: ExportType, range: { fromDate: string; toDate: string; fromBlock: string; toBlock: string }) {
  const data = await esSearch<unknown>(allOpIndexes(), {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: filters(accountId, spec, range) } },
  })
  return esTotal(data).value
}

export async function loadOps(accountId: string, spec: ExportType, range: { fromDate: string; toDate: string; fromBlock: string; toBlock: string }, cap: number) {
  const rows: OpView[] = []
  const size = 200
  for (let page = 0; rows.length < cap && page * size < 10000; page += 1) {
    const data = await esSearch<Parameters<typeof toOpView>[0]>(allOpIndexes(), {
      from: page * size,
      size,
      sort: [{ "block_data.block_time": "desc" }, { operation_id_num: "desc" }],
      query: { bool: { filter: filters(accountId, spec, range) } },
      _source: SOURCE,
    })
    const batch = rowsFrom(data)
    rows.push(...batch)
    if (batch.length < size) break
  }
  return rows.slice(0, cap)
}

function amountFields(body: Record<string, unknown>) {
  const keys = ["amount", "amount_to_sell", "min_to_receive", "borrow_amount", "repay_amount", "share_amount", "amount_a", "amount_b", "delta_amount", "total_claimed"]
  for (const key of keys) {
    const value = body[key]
    if (!value || typeof value !== "object" || !("amount" in value) || !("asset_id" in value)) continue
    const assetId = String((value as { asset_id: string }).asset_id)
    const asset = peekAsset(assetId)
    return { amount: formatRaw((value as { amount: string | number }).amount, asset?.precision ?? 5), asset: asset?.symbol ?? assetId }
  }
  return { amount: "", asset: "" }
}

function textField(body: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = body[key]
    if (typeof value === "string" && value) return value
  }
  return ""
}

function timeColumn(): string {
  if (getTimeMode() === "utc") return "time (UTC)"
  return `time (${localTimeZoneName()}, ${localOffsetLabel()})`
}

export function opsToCsv(rows: OpView[]) {
  return [
    [timeColumn(), "block", "tx", "operation", "from", "to", "amount", "asset", "fee", "fee_asset", "summary"],
    ...rows.map((op) => {
      const money = amountFields(op.body)
      const feeAsset = op.fee ? peekAsset(op.fee.asset_id) : undefined
      return [
        formatTime(op.time),
        String(op.blockNum ?? ""),
        op.trxId || op.opId,
        opLabel(op.type),
        textField(op.body, ["from", "seller", "account", "borrower", "owner", "fee_paying_account", "issuer"]),
        textField(op.body, ["to", "publisher"]),
        money.amount,
        money.asset,
        op.fee ? formatRaw(op.fee.amount, feeAsset?.precision ?? 5) : "",
        feeAsset?.symbol ?? op.fee?.asset_id ?? "",
        opSummary(op),
      ]
    }),
  ]
}

export async function snapshotRows(full: FullAccount, kind: "balances" | "vesting") {
  if (kind === "balances") {
    const ids = full.balances.map((row) => row.asset_type)
    await resolveAssets(ids)
    return [
      ["asset", "asset_id", "balance"],
      ...full.balances.map((row) => {
        const asset = peekAsset(row.asset_type)
        return [asset?.symbol ?? row.asset_type, row.asset_type, formatRaw(row.balance, asset?.precision ?? 5)]
      }),
    ]
  }
  const ids = (full.vesting_balances ?? []).map((row) => row.balance?.asset_id).filter((id): id is string => !!id)
  await resolveAssets(ids)
  return [
    ["id", "asset", "amount"],
    ...(full.vesting_balances ?? []).map((row) => {
      const asset = peekAsset(row.balance?.asset_id)
      return [row.id, asset?.symbol ?? row.balance?.asset_id ?? "", formatRaw(row.balance?.amount ?? 0, asset?.precision ?? 5)]
    }),
  ]
}

export async function countRelations(accountId: string, field: "registrar" | "referrer" | "options.voting_account") {
  const batch = await fetchRelatedAccounts(field, accountId, 1, 1)
  return batch.total
}

export async function relationRows(accountId: string, field: "registrar" | "referrer" | "options.voting_account", cap: number) {
  const rows = []
  for (let page = 1; rows.length < cap; page += 1) {
    const batch = await fetchRelatedAccounts(field, accountId, page, 50)
    rows.push(...batch.rows)
    if (!batch.rows.length || rows.length >= batch.total) break
  }
  const sliced = rows.slice(0, cap)
  if (field !== "options.voting_account") {
    return [["account", "id"], ...sliced.map((row) => [row.name, row.id])]
  }
  const stakes = await proxyStake(sliced.slice(0, 200).map((row) => row.id))
  return [
    ["account", "id", "voting_power_liquid_and_vesting"],
    ...sliced.map((row) => [row.name, row.id, String(stakes.get(row.id) ?? "")]),
  ]
}
