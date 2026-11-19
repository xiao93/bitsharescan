import { accountLabel, assetSymbol, peekAsset, resolveAccounts, resolveAssets } from "./directory.ts"
import type { Amount } from "./directory.ts"
import { formatRaw, protocolPercent } from "./format.ts"
import { translate } from "./i18n.tsx"
import { getLanguage } from "./locale.ts"
import { parseChainJson } from "./json.ts"

function lockLabel(type: unknown): string {
  const names: Record<string, string> = {
    liquid: "liquid",
    lock_180_days: "180-day lock",
    lock_360_days: "360-day lock",
    lock_720_days: "720-day lock",
    lock_forever: "permanent lock",
  }
  const key = typeof type === "string" ? type : ""
  return translate(names[key] ?? (key ? key.replaceAll("_", " ") : "lock"))
}

export type OpResult = { which?: number; data?: unknown }

export type OpView = {
  key: string
  opId: string
  opNum: number
  type: number
  virtual: boolean
  blockNum: number
  time: string
  trxId: string
  trxInBlock: number
  opInTrx: number
  feePayer: string
  fee?: Amount
  body: Record<string, unknown>
  result?: OpResult
}

export const OPERATIONS: { slug: string; label: string; virtual?: boolean }[] = [
  { slug: "transfer", label: "Transfer" },
  { slug: "limit_order_create", label: "Limit Order Create" },
  { slug: "limit_order_cancel", label: "Limit Order Cancel" },
  { slug: "call_order_update", label: "Call Order Update" },
  { slug: "fill_order", label: "Fill Order", virtual: true },
  { slug: "account_create", label: "Account Create" },
  { slug: "account_update", label: "Account Update" },
  { slug: "account_whitelist", label: "Account Whitelist" },
  { slug: "account_upgrade", label: "Account Upgrade" },
  { slug: "account_transfer", label: "Account Transfer" },
  { slug: "asset_create", label: "Asset Create" },
  { slug: "asset_update", label: "Asset Update" },
  { slug: "asset_update_bitasset", label: "Asset Update BitAsset" },
  { slug: "asset_update_feed_producers", label: "Update Feed Producers" },
  { slug: "asset_issue", label: "Asset Issue" },
  { slug: "asset_reserve", label: "Asset Reserve" },
  { slug: "asset_fund_fee_pool", label: "Fund Fee Pool" },
  { slug: "asset_settle", label: "Asset Settle" },
  { slug: "asset_global_settle", label: "Global Settlement" },
  { slug: "asset_publish_feed", label: "Publish Feed" },
  { slug: "witness_create", label: "Witness Create" },
  { slug: "witness_update", label: "Witness Update" },
  { slug: "proposal_create", label: "Proposal Create" },
  { slug: "proposal_update", label: "Proposal Update" },
  { slug: "proposal_delete", label: "Proposal Delete" },
  { slug: "withdraw_permission_create", label: "Withdraw Permission Create" },
  { slug: "withdraw_permission_update", label: "Withdraw Permission Update" },
  { slug: "withdraw_permission_claim", label: "Withdraw Permission Claim" },
  { slug: "withdraw_permission_delete", label: "Withdraw Permission Delete" },
  { slug: "committee_member_create", label: "Committee Create" },
  { slug: "committee_member_update", label: "Committee Update" },
  { slug: "committee_member_update_global_parameters", label: "Committee Parameters" },
  { slug: "vesting_balance_create", label: "Vesting Balance Create" },
  { slug: "vesting_balance_withdraw", label: "Vesting Balance Withdraw" },
  { slug: "worker_create", label: "Worker Create" },
  { slug: "custom", label: "Custom" },
  { slug: "assert", label: "Assert" },
  { slug: "balance_claim", label: "Balance Claim" },
  { slug: "override_transfer", label: "Override Transfer" },
  { slug: "transfer_to_blind", label: "Transfer to Blind" },
  { slug: "blind_transfer", label: "Blind Transfer" },
  { slug: "transfer_from_blind", label: "Transfer from Blind" },
  { slug: "asset_settle_cancel", label: "Settle Cancel", virtual: true },
  { slug: "asset_claim_fees", label: "Claim Asset Fees" },
  { slug: "fba_distribute", label: "Fee-Backed Distribute", virtual: true },
  { slug: "bid_collateral", label: "Bid Collateral" },
  { slug: "execute_bid", label: "Execute Bid", virtual: true },
  { slug: "asset_claim_pool", label: "Claim Asset Pool" },
  { slug: "asset_update_issuer", label: "Update Issuer" },
  { slug: "htlc_create", label: "HTLC Create" },
  { slug: "htlc_redeem", label: "HTLC Redeem" },
  { slug: "htlc_redeemed", label: "HTLC Redeemed", virtual: true },
  { slug: "htlc_extend", label: "HTLC Extend" },
  { slug: "htlc_refund", label: "HTLC Refund", virtual: true },
  { slug: "custom_authority_create", label: "Custom Authority Create" },
  { slug: "custom_authority_update", label: "Custom Authority Update" },
  { slug: "custom_authority_delete", label: "Custom Authority Delete" },
  { slug: "ticket_create", label: "Ticket Create" },
  { slug: "ticket_update", label: "Ticket Update" },
  { slug: "liquidity_pool_create", label: "Pool Create" },
  { slug: "liquidity_pool_delete", label: "Pool Delete" },
  { slug: "liquidity_pool_deposit", label: "Pool Deposit" },
  { slug: "liquidity_pool_withdraw", label: "Pool Withdraw" },
  { slug: "liquidity_pool_exchange", label: "Pool Exchange" },
  { slug: "samet_fund_create", label: "Same-T Fund Create" },
  { slug: "samet_fund_delete", label: "Same-T Fund Delete" },
  { slug: "samet_fund_update", label: "Same-T Fund Update" },
  { slug: "samet_fund_borrow", label: "Same-T Borrow" },
  { slug: "samet_fund_repay", label: "Same-T Repay" },
  { slug: "credit_offer_create", label: "Credit Offer Create" },
  { slug: "credit_offer_delete", label: "Credit Offer Delete" },
  { slug: "credit_offer_update", label: "Credit Offer Update" },
  { slug: "credit_offer_accept", label: "Credit Offer Accept" },
  { slug: "credit_deal_repay", label: "Credit Deal Repay" },
  { slug: "credit_deal_expired", label: "Credit Deal Expired", virtual: true },
  { slug: "liquidity_pool_update", label: "Pool Update" },
  { slug: "credit_deal_update", label: "Credit Deal Update" },
  { slug: "limit_order_update", label: "Limit Order Update" },
]

const OP_ZH: Record<string, string> = {
  transfer: "转账",
  limit_order_create: "创建限价单",
  limit_order_cancel: "取消限价单",
  call_order_update: "调整保证金",
  fill_order: "订单成交",
  account_create: "创建账户",
  account_update: "更新账户",
  account_whitelist: "账户白名单",
  account_upgrade: "升级账户",
  account_transfer: "转移账户",
  asset_create: "创建资产",
  asset_update: "更新资产",
  asset_update_bitasset: "更新智能资产",
  asset_update_feed_producers: "更新喂价者",
  asset_issue: "发行资产",
  asset_reserve: "销毁资产",
  asset_fund_fee_pool: "注资手续费池",
  asset_settle: "资产清算",
  asset_global_settle: "全局清算",
  asset_publish_feed: "发布喂价",
  witness_create: "创建见证人",
  witness_update: "更新见证人",
  proposal_create: "创建提案",
  proposal_update: "更新提案",
  proposal_delete: "删除提案",
  withdraw_permission_create: "创建提取授权",
  withdraw_permission_update: "更新提取授权",
  withdraw_permission_claim: "提取授权转账",
  withdraw_permission_delete: "删除提取授权",
  committee_member_create: "创建理事会成员",
  committee_member_update: "更新理事会成员",
  committee_member_update_global_parameters: "更新链参数",
  vesting_balance_create: "创建待解冻余额",
  vesting_balance_withdraw: "提取待解冻余额",
  worker_create: "创建预算提案",
  custom: "自定义操作",
  assert: "断言",
  balance_claim: "领取余额",
  override_transfer: "强制转账",
  transfer_to_blind: "转入隐私",
  blind_transfer: "隐私转账",
  transfer_from_blind: "转出隐私",
  asset_settle_cancel: "取消清算",
  asset_claim_fees: "领取资产手续费",
  fba_distribute: "手续费分成",
  bid_collateral: "抵押竞拍",
  execute_bid: "执行竞拍",
  asset_claim_pool: "领取资产池",
  asset_update_issuer: "更换发行人",
  htlc_create: "创建哈希时间锁",
  htlc_redeem: "赎回哈希时间锁",
  htlc_redeemed: "哈希时间锁已赎回",
  htlc_extend: "延长哈希时间锁",
  htlc_refund: "哈希时间锁退款",
  custom_authority_create: "创建自定义权限",
  custom_authority_update: "更新自定义权限",
  custom_authority_delete: "删除自定义权限",
  ticket_create: "创建锁仓",
  ticket_update: "更新锁仓",
  liquidity_pool_create: "创建流动性池",
  liquidity_pool_delete: "删除流动性池",
  liquidity_pool_deposit: "添加流动性",
  liquidity_pool_withdraw: "移除流动性",
  liquidity_pool_exchange: "池内兑换",
  samet_fund_create: "创建闪电贷资金",
  samet_fund_delete: "删除闪电贷资金",
  samet_fund_update: "更新闪电贷资金",
  samet_fund_borrow: "闪电贷借入",
  samet_fund_repay: "闪电贷偿还",
  credit_offer_create: "创建借贷报价",
  credit_offer_delete: "删除借贷报价",
  credit_offer_update: "更新借贷报价",
  credit_offer_accept: "接受借贷",
  credit_deal_repay: "偿还借贷",
  credit_deal_expired: "借贷到期",
  liquidity_pool_update: "更新流动性池",
  credit_deal_update: "更新借贷合约",
  limit_order_update: "更新限价单",
}

export function opLabel(type: number): string {
  const op = OPERATIONS[type]
  if (!op) return translate("Operation {n}", { n: type })
  return getLanguage() === "zh" ? (OP_ZH[op.slug] ?? op.label) : op.label
}

export function isVirtualType(type: number): boolean {
  return Boolean(OPERATIONS[type]?.virtual)
}

export function asAmount(value: unknown): Amount | null {
  if (!value || typeof value !== "object") return null
  if (!("amount" in value) || !("asset_id" in value)) return null
  const amount = (value as Amount).amount
  const assetId = (value as Amount).asset_id
  if (typeof assetId !== "string") return null
  if (typeof amount !== "string" && typeof amount !== "number" && typeof amount !== "bigint") return null
  return { amount, asset_id: assetId }
}

export type SummaryBit =
  | string
  | { kind: "account"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "account-name"; name: string }
  | { kind: "asset-symbol"; symbol: string }
  | { kind: "object"; id: string }

function summaryText(bits: SummaryBit[]): string {
  return bits.map((bit) => {
    if (typeof bit === "string") return bit
    if (bit.kind === "account") return accountLabel(bit.id)
    if (bit.kind === "asset") return assetSymbol(bit.id)
    if (bit.kind === "account-name") return bit.name
    if (bit.kind === "asset-symbol") return bit.symbol
    return bit.id
  }).join("")
}

function phrase(template: string, vars: Record<string, SummaryBit | SummaryBit[]>): SummaryBit[] {
  const text = translate(template)
  const bits: SummaryBit[] = []
  const pattern = /\{(\w+)\}/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) bits.push(text.slice(last, index))
    const value = vars[match[1] ?? ""]
    if (Array.isArray(value)) bits.push(...value)
    else if (value) bits.push(value)
    last = index + match[0].length
  }
  if (last < text.length) bits.push(text.slice(last))
  return bits
}

function whoBit(value: unknown): SummaryBit {
  if (typeof value !== "string" || !value) return ""
  if (/^1\.2\.\d+$/.test(value)) return { kind: "account", id: value }
  if (/^1\.3\.\d+$/.test(value)) return { kind: "asset", id: value }
  if (/^\d+\.\d+\.\d+$/.test(value)) return { kind: "object", id: value }
  return value
}

function moneyBits(value: unknown): SummaryBit[] {
  const amount = asAmount(value)
  if (!amount) return ["—"]
  const asset = peekAsset(amount.asset_id)
  const qty = asset ? formatRaw(amount.amount, asset.precision) : String(amount.amount)
  return [`${qty} `, { kind: "asset", id: amount.asset_id }]
}

function namedAmountBits(body: Record<string, unknown>, amountKey: string, assetKey: string): SummaryBit[] {
  const direct = asAmount(body[amountKey])
  if (direct) return moneyBits(direct)
  const asset = body[assetKey]
  const raw = body[amountKey]
  if ((typeof raw === "number" || typeof raw === "string") && typeof asset === "string") {
    return moneyBits({ amount: raw, asset_id: asset })
  }
  return ["—"]
}

function accountName(value: unknown): SummaryBit {
  return typeof value === "string" && value ? { kind: "account-name", name: value } : ""
}

function assetSymbolBit(value: unknown): SummaryBit {
  return typeof value === "string" && value ? { kind: "asset-symbol", symbol: value } : ""
}

export function collectRefs(value: unknown, accounts: Set<string>, assets: Set<string>, depth = 0) {
  if (depth > 8 || value == null) return
  if (typeof value === "string") {
    if (/^1\.2\.\d+$/.test(value)) accounts.add(value)
    else if (/^1\.3\.\d+$/.test(value)) assets.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, accounts, assets, depth + 1)
    return
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) collectRefs(item, accounts, assets, depth + 1)
  }
}

function genericSummaryBits(body: Record<string, unknown>): SummaryBit[] {
  const parts: SummaryBit[] = []
  for (const [key, value] of Object.entries(body)) {
    if (key === "fee" || key === "extensions") continue
    const amount = asAmount(value)
    if (amount) {
      if (parts.length) parts.push(" · ")
      parts.push(...moneyBits(amount))
    } else if (typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value)) {
      if (parts.length) parts.push(" · ")
      parts.push(whoBit(value))
    } else if (typeof value === "string" && key === "name" && value.length < 64) {
      if (parts.length) parts.push(" · ")
      parts.push(accountName(value))
    }
    if (parts.filter((bit) => bit !== " · ").length >= 4) break
  }
  return parts
}

function listCount(value: unknown): string {
  return String(Array.isArray(value) ? value.length : 0)
}

function objectBit(value: unknown, fallback: string): SummaryBit {
  if (typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value)) return { kind: "object", id: value }
  return typeof value === "string" && value ? value : fallback
}

export function summarizeBits(type: number, body: Record<string, unknown>): SummaryBit[] {
  switch (type) {
    case 0:
      return phrase("{amount} to {to}", { amount: moneyBits(body.amount), to: whoBit(body.to) })
    case 1:
      return phrase("Sell {sell} for at least {receive}", { sell: moneyBits(body.amount_to_sell), receive: moneyBits(body.min_to_receive) })
    case 2:
      return phrase("Cancel order {order}", { order: whoBit(body.order) })
    case 3:
      return phrase("Collateral {collateral} · debt {debt}", { collateral: moneyBits(body.delta_collateral), debt: moneyBits(body.delta_debt) })
    case 4:
      return phrase("Pays {pays} · receives {receives}", { pays: moneyBits(body.pays), receives: moneyBits(body.receives) })
    case 5:
      return phrase("{registrar} created account {name}, referrer {referrer}", {
        registrar: whoBit(body.registrar),
        name: accountName(body.name),
        referrer: whoBit(body.referrer),
      })
    case 6:
      return phrase("Update {account}", { account: whoBit(body.account) })
    case 7: {
      const listing = Number(body.new_listing)
      const state = listing === 1 ? "whitelisted" : listing === 2 ? "blacklisted" : listing === 3 ? "white and black listed" : "removed from lists"
      return phrase("{authorizer} set {account} to {listing}", {
        authorizer: whoBit(body.authorizing_account),
        account: whoBit(body.account_to_list),
        listing: translate(state),
      })
    }
    case 8:
      return phrase("{account} → {level}", { account: whoBit(body.account_to_upgrade), level: translate(body.upgrade_to_lifetime_member ? "lifetime" : "annual") })
    case 9:
      return phrase("{account} transferred", { account: whoBit(body.account) })
    case 10:
      return phrase("Create asset {symbol}", { symbol: assetSymbolBit(body.symbol) })
    case 14:
      return phrase("Issue {amount} to {to}", { amount: moneyBits(body.asset_to_issue), to: whoBit(body.issue_to_account) })
    case 15:
      return phrase("Reserve {amount}", { amount: moneyBits(body.amount_to_reserve) })
    case 16:
      return phrase("Fund fee pool {amount}", { amount: moneyBits(body.amount) })
    case 17:
      return phrase("Settle {amount}", { amount: moneyBits(body.amount) })
    case 19:
      return phrase("Feed for {asset} by {publisher}", { asset: whoBit(body.asset_id), publisher: whoBit(body.publisher) })
    case 22:
      return phrase("Proposal by {account} · {n} ops", { account: whoBit(body.fee_paying_account), n: String(Array.isArray(body.proposed_ops) ? body.proposed_ops.length : 0) })
    case 24:
      return phrase("Delete proposal {id}", { id: whoBit(body.proposal) })
    case 33:
      return phrase("Withdraw vesting {amount}", { amount: moneyBits(body.amount) })
    case 34:
      return phrase("Worker {name}", { name: typeof body.name === "string" ? body.name : "" })
    case 37:
      return phrase("Claim balance {amount}", { amount: moneyBits(body.total_claimed) })
    case 38:
      return phrase("{amount} from {from} to {to}", { amount: moneyBits(body.amount), from: whoBit(body.from), to: whoBit(body.to) })
    case 39:
      return phrase("{from} blinded {amount} · {n} outputs", {
        from: whoBit(body.from),
        amount: moneyBits(body.amount),
        n: listCount(body.outputs),
      })
    case 40:
      return phrase("Blind transfer · {inputs} inputs · {outputs} outputs", {
        inputs: listCount(body.inputs),
        outputs: listCount(body.outputs),
      })
    case 41:
      return phrase("{amount} from blind to {to} · {n} inputs", {
        amount: moneyBits(body.amount),
        to: whoBit(body.to),
        n: listCount(body.inputs),
      })
    case 49:
      return phrase("HTLC {amount} to {to}", { amount: moneyBits(body.amount_to_transfer ?? body.amount), to: whoBit(body.to) })
    case 57:
      return phrase("Lock {amount} as {lock}", { amount: moneyBits(body.amount), lock: lockLabel(body.target_type) })
    case 58:
      return phrase("Update ticket {ticket} → {lock}", { ticket: whoBit(body.ticket), lock: lockLabel(body.target_type) })
    case 59:
      return phrase("Create pool {a}/{b}{share}", {
        a: whoBit(body.asset_a),
        b: whoBit(body.asset_b),
        share: typeof body.share_asset_symbol === "string" ? phrase(" · share {symbol}", { symbol: assetSymbolBit(body.share_asset_symbol) }) : "",
      })
    case 60:
      return phrase("Delete pool {pool}", { pool: objectBit(body.pool, "") })
    case 61:
      return phrase("Deposit {a} and {b} into {pool}", { a: moneyBits(body.amount_a), b: moneyBits(body.amount_b), pool: objectBit(body.pool, "pool") })
    case 62:
      return phrase("Withdraw {amount} from {pool}", { amount: moneyBits(body.share_amount), pool: objectBit(body.pool, "pool") })
    case 63:
      return phrase("Swap {sell} for at least {receive} in {pool}", { sell: moneyBits(body.amount_to_sell), receive: moneyBits(body.min_to_receive), pool: objectBit(body.pool, "pool") })
    case 64:
      return phrase("Create flash fund {amount} · fee {fee}", { amount: namedAmountBits(body, "balance", "asset_type"), fee: protocolPercent(body.fee_rate as number) })
    case 65:
      return phrase("Delete flash fund {id}", { id: objectBit(body.fund_id, "") })
    case 66:
      return phrase("Update flash fund {id}", { id: objectBit(body.fund_id, "") })
    case 67:
      return phrase("Flash borrow {amount} from {fund}", { amount: moneyBits(body.borrow_amount), fund: objectBit(body.fund_id, "fund") })
    case 68:
      return phrase("Flash repay {amount} to {fund}", { amount: moneyBits(body.repay_amount), fund: objectBit(body.fund_id, "fund") })
    case 69:
      return phrase("Lend {amount} · rate {fee}", { amount: namedAmountBits(body, "balance", "asset_type"), fee: protocolPercent(body.fee_rate as number) })
    case 70:
      return phrase("Delete credit offer {id}", { id: objectBit(body.offer_id, "") })
    case 71:
      return phrase("Update credit offer {id}", { id: objectBit(body.offer_id, "") })
    case 72:
      return phrase("Borrow {amount} against {collateral} from {offer}", { amount: moneyBits(body.borrow_amount), collateral: moneyBits(body.collateral), offer: objectBit(body.offer_id, "offer") })
    case 73:
      return phrase("Repay {amount} on {deal}", { amount: moneyBits(body.repay_amount), deal: objectBit(body.deal_id, "deal") })
    case 74:
      return phrase("Credit deal expired {id}", { id: objectBit(body.deal_id, "") })
    case 75:
      return phrase("Update pool {pool}", { pool: objectBit(body.pool, "") })
    case 77:
      return phrase("Update order {order}", { order: whoBit(body.order) })
    default: {
      const bits = genericSummaryBits(body)
      return bits.length ? bits : [opLabel(type)]
    }
  }
}

export function summarize(type: number, body: Record<string, unknown>): string {
  return summaryText(summarizeBits(type, body))
}

function formatResultBits(result: OpResult | undefined): SummaryBit[] {
  if (!result || result.which === 0 || result.data == null) return []
  if (typeof result.data === "string") return [whoBit(result.data)]
  const amount = asAmount(result.data)
  if (amount) return moneyBits(amount)
  if (typeof result.data === "object" && result.data && "id" in result.data) {
    const id = (result.data as { id?: unknown }).id
    if (typeof id === "string") return [whoBit(id)]
  }
  if (typeof result.data === "object" && result.data && ("received" in result.data || "paid" in result.data)) {
    const received = (result.data as { received?: unknown }).received
    if (!Array.isArray(received)) return []
    const parts: SummaryBit[] = []
    for (const item of received) {
      const bits = moneyBits(item)
      if (summaryText(bits) === "—") continue
      if (parts.length) parts.push(", ")
      parts.push(...bits)
    }
    return parts
  }
  return []
}

export function formatResult(result: OpResult | undefined): string {
  return summaryText(formatResultBits(result))
}

export function opSummaryBits(op: OpView): SummaryBit[] {
  const text = summarizeBits(op.type, op.body)
  const result = formatResultBits(op.result)
  return result.length ? [...text, " → ", ...result] : text
}

export function opSummary(op: OpView): string {
  return summaryText(opSummaryBits(op))
}

type EsSource = {
  account_history?: { operation_id?: string; account?: string }
  operation_history?: {
    trx_in_block?: number
    op_in_trx?: number
    is_virtual?: boolean
    fee_payer?: string
    op?: string
    op_object?: Record<string, unknown>
    operation_result_object?: { which?: number; data_object?: unknown }
  }
  operation_type?: number
  operation_id_num?: number | string
  block_data?: { block_num?: number; block_time?: string; trx_id?: string }
}

function parseOpString(op?: string): Record<string, unknown> {
  if (!op) return {}
  try {
    const parsed = parseChainJson(op) as [number, Record<string, unknown>]
    return parsed?.[1] ?? {}
  } catch {
    return {}
  }
}

/** Elasticsearch renames some operation fields (amount -> amount_) to avoid mapping clashes. */
function normalizeBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
  for (const [key, value] of Object.entries(body)) {
    if (!key.endsWith("_")) continue
    const plain = key.slice(0, -1)
    if (!(plain in out)) out[plain] = value
  }
  return out
}

export function toOpView(src: EsSource, index = 0): OpView {
  const hist = src.operation_history ?? {}
  const parsed = parseOpString(hist.op)
  const body = normalizeBody(Object.keys(parsed).length ? parsed : (hist.op_object ?? {}))
  const fee = asAmount(body.fee) ?? undefined
  const opNum = Number(src.operation_id_num ?? 0)
  const opId = src.account_history?.operation_id || (opNum ? `1.11.${opNum}` : "")
  const trxId = src.block_data?.trx_id ?? ""
  return {
    key: opId || `${trxId}-${hist.op_in_trx ?? index}`,
    opId,
    opNum,
    type: src.operation_type ?? -1,
    virtual: Boolean(hist.is_virtual) || isVirtualType(src.operation_type ?? -1),
    blockNum: src.block_data?.block_num ?? 0,
    time: src.block_data?.block_time ?? "",
    trxId,
    trxInBlock: hist.trx_in_block ?? 0,
    opInTrx: hist.op_in_trx ?? 0,
    feePayer: hist.fee_payer ?? "",
    fee,
    body,
    result: hist.operation_result_object
      ? { which: hist.operation_result_object.which, data: hist.operation_result_object.data_object }
      : undefined,
  }
}

export async function hydrateOps(ops: OpView[]) {
  const accounts = new Set<string>()
  const assets = new Set<string>()
  for (const op of ops) {
    if (op.feePayer) accounts.add(op.feePayer)
    if (op.fee) assets.add(op.fee.asset_id)
    collectRefs(op.body, accounts, assets)
    if (op.result?.data) collectRefs(op.result.data, accounts, assets)
  }
  await Promise.all([resolveAccounts([...accounts]), resolveAssets([...assets])])
}

export function dedupeOps(ops: OpView[]): OpView[] {
  const seen = new Set<string>()
  const out: OpView[] = []
  for (const op of ops) {
    const key = op.opId || op.key
    if (seen.has(key)) continue
    seen.add(key)
    out.push(op)
  }
  return out
}

export type SignedOp = [number, Record<string, unknown>]

export function fromSignedOp(
  blockNum: number,
  time: string,
  trxId: string,
  trxIndex: number,
  opIndex: number,
  op: SignedOp,
): OpView {
  const body = op[1] ?? {}
  const payer =
    (typeof body.fee_paying_account === "string" && body.fee_paying_account) ||
    (typeof body.from === "string" && body.from) ||
    (typeof body.seller === "string" && body.seller) ||
    (typeof body.publisher === "string" && body.publisher) ||
    (typeof body.issuer === "string" && body.issuer) ||
    ""
  return {
    key: `${blockNum}-${trxIndex}-${opIndex}`,
    opId: "",
    opNum: 0,
    type: op[0] ?? -1,
    virtual: isVirtualType(op[0] ?? -1),
    blockNum,
    time,
    trxId,
    trxInBlock: trxIndex,
    opInTrx: opIndex,
    feePayer: payer,
    fee: asAmount(body.fee) ?? undefined,
    body,
  }
}
