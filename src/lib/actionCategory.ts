import { opLabel } from "./ops.ts"
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
  category: ActionCategory
  categories: ActionCategory[]
  name: string
  trxId: string
}

export function actionCellsForBlock(
  transactions: Array<{ trxId: string; index: number; ops: OpView[] }>,
  virtuals: OpView[],
): { cells: ActionCell[]; counts: Map<ActionCategory, number>; total: number } {
  const virtualsByTx = new Map<string, OpView[]>()
  const orphanVirtuals: OpView[] = []
  for (const op of virtuals) {
    if (op.trxId) {
      const list = virtualsByTx.get(op.trxId) ?? []
      list.push(op)
      virtualsByTx.set(op.trxId, list)
    } else {
      orphanVirtuals.push(op)
    }
  }

  const allOps: OpView[] = []
  for (const tx of transactions) {
    allOps.push(...tx.ops)
    allOps.push(...(virtualsByTx.get(tx.trxId) ?? []))
  }
  allOps.push(...orphanVirtuals)

  const counts = new Map<ActionCategory, number>()
  for (const op of allOps) {
    const cat = opCategory(op.type)
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }

  const perOp = transactions.length > 0 && transactions.length <= 8
  const cells: ActionCell[] = []
  if (perOp || transactions.length === 0) {
    for (const op of allOps) {
      const category = opCategory(op.type)
      cells.push({
        key: op.key,
        category,
        categories: [category],
        name: opLabel(op.type),
        trxId: op.trxId,
      })
    }
  } else {
    for (const tx of transactions) {
      const related = [...tx.ops, ...(virtualsByTx.get(tx.trxId) ?? [])]
      const categories = [...new Set(related.map((op) => opCategory(op.type)))]
      const first = tx.ops[0] ?? related[0]
      const category = first ? opCategory(first.type) : "other"
      cells.push({
        key: `tx-${tx.index}-${tx.trxId}`,
        category,
        categories,
        name: first ? opLabel(first.type) : ACTION_CATEGORY_LABEL.other,
        trxId: tx.trxId,
      })
    }
    for (const op of orphanVirtuals) {
      const category = opCategory(op.type)
      cells.push({
        key: op.key,
        category,
        categories: [category],
        name: opLabel(op.type),
        trxId: op.trxId,
      })
    }
  }

  return { cells, counts, total: allOps.length }
}
