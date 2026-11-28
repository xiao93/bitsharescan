import { asBig, formatRaw } from "./format.ts"
import { translate } from "./i18n.tsx"
import { db } from "./node.ts"

export type Amount = {
  amount: string | number | bigint
  asset_id: string
}

export type AssetInfo = {
  id: string
  symbol: string
  precision: number
  issuer: string
  dynamic_asset_data_id: string
  bitasset_data_id?: string
  options: {
    max_supply?: string | number
    market_fee_percent?: number
    max_market_fee?: string | number
    issuer_permissions?: number
    flags?: number
    description?: string
    core_exchange_rate?: { base: Amount; quote: Amount }
    whitelist_authorities?: string[]
    blacklist_authorities?: string[]
    whitelist_markets?: string[]
    blacklist_markets?: string[]
    extensions?: Record<string, unknown>
    [key: string]: unknown
  }
  creation_time?: string
  creation_block_num?: number
}

const assetsById = new Map<string, AssetInfo>()
const assetsBySymbol = new Map<string, AssetInfo>()
const accountNames = new Map<string, string>()

export function peekAsset(idOrSymbol: string | undefined | null): AssetInfo | undefined {
  if (!idOrSymbol) return undefined
  return assetsById.get(idOrSymbol) ?? assetsBySymbol.get(idOrSymbol)
}

export function assetSymbol(id: string | undefined | null): string {
  if (!id) return "—"
  return peekAsset(id)?.symbol ?? id
}

export function accountLabel(id: string | undefined | null): string {
  if (!id) return "—"
  const found = accountNames.get(id)
  if (!found || (found.startsWith("1.2.") && !id.startsWith("1.2."))) return id
  return found
}

export function accountPath(id: string | undefined | null): string {
  if (!id) return "#"
  const name = accountNames.get(id)
  return `/account/${name && !name.startsWith("1.2.") ? name : id}`
}

export function formatAmount(amount: Amount | null | undefined): string {
  if (!amount) return "—"
  const asset = assetsById.get(amount.asset_id)
  if (!asset) return `${amount.amount} ${amount.asset_id}`
  return `${formatRaw(amount.amount, asset.precision)} ${asset.symbol}`
}

function rememberAsset(row: AssetInfo | null | undefined) {
  if (!row?.id || !row.symbol) return
  const asset: AssetInfo = {
    ...row,
    precision: row.precision ?? 0,
    options: row.options ?? {},
  }
  assetsById.set(asset.id, asset)
  assetsBySymbol.set(asset.symbol, asset)
}

async function objectChunks<T>(ids: string[]): Promise<Array<T | null>> {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50))
  // Up to six chunks in flight at once; one after another cost a full round trip each.
  const pages = new Array<Array<T | null>>(chunks.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(6, chunks.length) }, async () => {
    while (next < chunks.length) {
      const index = next
      next += 1
      pages[index] = (await db<Array<T | null>>("get_objects", [chunks[index]!])) ?? []
    }
  }))
  return pages.flat()
}

export async function resolveAccounts(ids: Array<string | undefined | null>): Promise<void> {
  const want = [...new Set(ids.filter((id): id is string => !!id && /^1\.2\.\d+$/.test(id) && !accountNames.has(id)))]
  const rows = await objectChunks<{ id: string; name: string }>(want)
  rows.forEach((row) => {
    if (row?.id && row.name) {
      accountNames.set(row.id, row.name)
      accountNames.set(row.name, row.id)
    }
  })
}

export async function resolveAssets(ids: Array<string | undefined | null>): Promise<void> {
  const all = [...new Set(ids.filter((id): id is string => !!id))]
  const objectIds = all.filter((id) => /^1\.3\.\d+$/.test(id) && !assetsById.has(id))
  const symbols = all.filter((id) => !/^1\.\d+\.\d+$/.test(id) && !assetsBySymbol.has(id))
  if (objectIds.length) {
    const rows = await objectChunks<AssetInfo>(objectIds)
    for (const row of rows) rememberAsset(row)
  }
  if (symbols.length) {
    const rows = await db<Array<AssetInfo | null>>("lookup_asset_symbols", [symbols])
    rows?.forEach((row, index) => {
      if (row) rememberAsset(row)
      else assetsBySymbol.set(symbols[index]!, missingSymbol(symbols[index]!))
    })
  }
}

function missingSymbol(symbol: string): AssetInfo {
  return {
    id: "",
    symbol,
    precision: 0,
    issuer: "",
    dynamic_asset_data_id: "",
    options: {},
  }
}

export function assetTitle(asset: AssetInfo | undefined): string {
  const raw = asset?.options?.description
  if (typeof raw !== "string" || !raw.trim()) return ""
  try {
    const parsed = JSON.parse(raw) as { main?: string; short_name?: string; market?: string }
    const text = parsed.short_name || parsed.main || parsed.market || ""
    return text.replace(/\s+/g, " ").trim()
  } catch {
    return raw.replace(/\s+/g, " ").trim()
  }
}

export function supplyShare(balance: string | number | bigint, supply: string | number | bigint): string {
  const total = asBig(supply)
  if (total <= 0n) return "—"
  const pct = Number((asBig(balance) * 10000n) / total) / 100
  if (!Number.isFinite(pct)) return "—"
  if (pct > 0 && pct < 0.01) return "<0.01%"
  return `${pct.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
}

export const ASSET_FLAGS: { bit: number; label: string }[] = [
  { bit: 0x01, label: "Charge market fee" },
  { bit: 0x02, label: "Whitelist" },
  { bit: 0x04, label: "Override authority" },
  { bit: 0x08, label: "Transfer restricted" },
  { bit: 0x10, label: "Disable force settle" },
  { bit: 0x20, label: "Global settle" },
  { bit: 0x40, label: "Disable confidential" },
  { bit: 0x80, label: "Witness-fed" },
  { bit: 0x100, label: "Committee-fed" },
  { bit: 0x200, label: "Lock max supply" },
  { bit: 0x400, label: "Disable new supply" },
  { bit: 0x800, label: "Disable MCR update" },
  { bit: 0x1000, label: "Disable ICR update" },
  { bit: 0x2000, label: "Disable MSSR update" },
  { bit: 0x4000, label: "Disable BSRM update" },
  { bit: 0x8000, label: "Disable collateral bidding" },
]

export function flagNames(mask: number | undefined): string[] {
  if (!mask) return []
  const names: string[] = []
  let rest = mask
  for (const flag of ASSET_FLAGS) {
    if (mask & flag.bit) {
      names.push(flag.label)
      rest &= ~flag.bit
    }
  }
  if (rest) names.push(`0x${rest.toString(16)}`)
  return names.map((name) => translate(name))
}
