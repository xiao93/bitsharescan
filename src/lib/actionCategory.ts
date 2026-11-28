import type { OpView } from "./ops.ts"

/** Categories for the block-page Transaction Actions mosaic (Etherscan-style). */
export const ACTION_CATEGORIES = [
  "transfer",
  "limit-order",
  "cancel-order",
  "fill",
  "pool-swap",
  "pool-flow",
  "flash",
  "margin",
  "feed",
  "account",
  "asset",
  "proposal",
  "credit",
  "liquidity",
  "other",
] as const

export type ActionCategory = (typeof ACTION_CATEGORIES)[number]

export const ACTION_CATEGORY_LABEL: Record<ActionCategory, string> = {
  transfer: "Transfer",
  "limit-order": "Limit Order",
  "cancel-order": "Cancel Order",
  fill: "Fill/Match",
  "pool-swap": "Pool Swap",
  "pool-flow": "Pool Deposit/Withdraw",
  flash: "Flash Loan",
  margin: "Margin/Call update",
  feed: "Feed publish",
  account: "Account",
  asset: "Asset",
  proposal: "Proposal",
  credit: "Credit",
  liquidity: "Liquidity/other",
  other: "Other",
}

const BY_TYPE: Record<number, ActionCategory> = {
  0: "transfer",
  1: "limit-order",
  2: "cancel-order",
  3: "margin",
  4: "fill",
  5: "account",
  6: "account",
  7: "account",
  8: "account",
  9: "account",
  10: "asset",
  11: "asset",
  12: "asset",
  13: "asset",
  14: "asset",
  15: "asset",
  16: "asset",
  17: "asset",
  18: "asset",
  19: "feed",
  22: "proposal",
  23: "proposal",
  24: "proposal",
  38: "transfer",
  39: "transfer",
  40: "transfer",
  41: "transfer",
  42: "asset",
  43: "asset",
  44: "asset",
  45: "margin",
  46: "margin",
  47: "asset",
  48: "asset",
  59: "liquidity",
  60: "liquidity",
  61: "pool-flow",
  62: "pool-flow",
  63: "pool-swap",
  64: "flash",
  65: "flash",
  66: "flash",
  67: "flash",
  68: "flash",
  69: "credit",
  70: "credit",
  71: "credit",
  72: "credit",
  73: "credit",
  74: "credit",
  75: "liquidity",
  76: "credit",
  77: "limit-order",
}

export function opCategory(type: number): ActionCategory {
  return BY_TYPE[type] ?? "other"
}

export type ActionCell = {
  key: string
  trxId: string
  index: number
  categories: ActionCategory[]
  opCounts: Partial<Record<ActionCategory, number>>
  opTotal: number
}

export type ActionSummary = {
  cells: ActionCell[]
  txCounts: Map<ActionCategory, number>
  opCounts: Map<ActionCategory, number>
  txTotal: number
  opTotal: number
}

function addOp(map: Map<ActionCategory, number>, type: number) {
  const cat = opCategory(type)
  map.set(cat, (map.get(cat) ?? 0) + 1)
}

/**
 * Summarize Transaction Actions from the signed transactions in get_block only.
 * Virtual ops (fill_order, residual/expiry cancels, etc.) are excluded; they stay
 * in the block page's Virtual operations table.
 */
export function actionSummaryForBlock(
  transactions: Array<{ trxId: string; index: number; ops: OpView[] }>,
): ActionSummary {
  const opCounts = new Map<ActionCategory, number>()
  const txCounts = new Map<ActionCategory, number>()
  const cells: ActionCell[] = []

  for (const tx of transactions) {
    const signed = tx.ops.filter((op) => !op.virtual)
    const cellCounts: Partial<Record<ActionCategory, number>> = {}
    for (const op of signed) {
      addOp(opCounts, op.type)
      const cat = opCategory(op.type)
      cellCounts[cat] = (cellCounts[cat] ?? 0) + 1
    }
    const categories = ACTION_CATEGORIES.filter((id) => (cellCounts[id] ?? 0) > 0)
    for (const cat of categories) txCounts.set(cat, (txCounts.get(cat) ?? 0) + 1)
    cells.push({
      key: `tx-${tx.index}-${tx.trxId}`,
      trxId: tx.trxId,
      index: tx.index,
      categories,
      opCounts: cellCounts,
      opTotal: signed.length,
    })
  }

  let opTotal = 0
  for (const n of opCounts.values()) opTotal += n

  return { cells, txCounts, opCounts, txTotal: transactions.length, opTotal }
}

/** Format a share so whole numbers stay whole and other values keep one decimal. */
export function formatShare(count: number, total: number): string {
  if (!total || count <= 0) return "0"
  const raw = (count * 100) / total
  if (raw > 0 && raw < 0.1) return "<0.1"
  const nearest = Math.round(raw * 10) / 10
  if (Math.abs(nearest - Math.round(nearest)) < 0.05) return String(Math.round(nearest))
  return nearest.toFixed(1)
}

/**
 * Integer percents that sum to 100, using the largest-remainder method.
 * A positive count is never rounded to 0 when there is remainder to give.
 */
export function integerPercents(counts: number[], total: number): number[] {
  if (!total || !counts.length) return counts.map(() => 0)
  const raw = counts.map((count) => (count * 100) / total)
  const floors = raw.map((value) => Math.floor(value))
  let remain = 100 - floors.reduce((sum, value) => sum + value, 0)
  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value), count: counts[index] ?? 0 }))
    .sort((a, b) => b.frac - a.frac || b.count - a.count)
  const out = [...floors]
  for (const item of order) {
    if (remain <= 0) break
    if ((counts[item.index] ?? 0) <= 0) continue
    out[item.index] = (out[item.index] ?? 0) + 1
    remain -= 1
  }
  return out
}
