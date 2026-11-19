import { fetchTickerCached } from "./chain.ts"
import type { Ticker } from "./chain.ts"
import { peekAsset, resolveAccounts, resolveAssets } from "./directory.ts"
import type { Amount, AssetInfo } from "./directory.ts"
import { fetchAllFunds, fetchAllOffers, fetchAllPools } from "./defi.ts"
import type { CreditOffer, Pool, SametFund } from "./defi.ts"
import { asBig, toFloat } from "./format.ts"
import { db } from "./node.ts"
import { coreSymbol } from "./network.ts"
import { fetchBtsUsd } from "./usd.ts"

export type Price = { base: Amount; quote: Amount }

export type Feed = {
  settlement_price?: Price
  maintenance_collateral_ratio?: number
  maximum_short_squeeze_ratio?: number
  core_exchange_rate?: Price
  initial_collateral_ratio?: number
}

export type AssetDynamic = {
  current_supply?: string | number
  confidential_supply?: string | number
  accumulated_fees?: string | number
  accumulated_collateral_fees?: string | number
  fee_pool?: string | number
}

export type BitAsset = {
  feeds?: Array<[string, [string, Feed]]>
  current_feed?: Feed
  median_feed?: Feed
  current_feed_publication_time?: string
  options?: {
    feed_lifetime_sec?: number
    minimum_feeds?: number
    force_settlement_delay_sec?: number
    force_settlement_offset_percent?: number
    maximum_force_settlement_volume?: number
    short_backing_asset?: string
    extensions?: Record<string, number | string>
  }
  force_settled_volume?: string | number
  is_prediction_market?: boolean
  settlement_price?: Price
  settlement_fund?: string | number
  individual_settlement_debt?: string | number
  individual_settlement_fund?: string | number
}

export type AssetDescription = {
  main: string
  shortName: string
  market: string
  nft: string
}

export type CallRow = {
  id: string
  borrower: string
  collateral: string | number
  debt: string | number
  /** Debt asset per 1 unit of collateral at the call threshold. */
  callPrice: number | null
  ratio: number | null
}

export type SettleRow = {
  id: string
  owner: string
  amount: string | number | bigint
  assetId: string
  date: string
}

export type BidRow = {
  bidder: string
  collateral: string | number
  debt: string | number
}

export type AssetMarket = {
  base: string
  quote: string
  latest: string
  baseVolume: string
  quoteVolume: string
  change: string
  volume: number
}

export type AssetPageData = {
  asset: AssetInfo
  dynamic: AssetDynamic
  bitasset: BitAsset | null
  description: AssetDescription
  calls: CallRow[]
  settles: SettleRow[]
  bids: BidRow[]
  markets: AssetMarket[]
  usdPrice: number | null
  usdSource: string
  pools: Pool[]
  offers: CreditOffer[]
  funds: SametFund[]
}

export function parseDescription(raw: unknown): AssetDescription {
  const empty = { main: "", shortName: "", market: "", nft: "" }
  if (typeof raw !== "string" || !raw.trim()) return empty
  try {
    const parsed = JSON.parse(raw) as { main?: string; short_name?: string; market?: string; nft?: unknown }
    const nft = parsed.nft
    let nftText = ""
    if (nft && typeof nft === "object") {
      const record = nft as Record<string, unknown>
      const bits = ["title", "artist", "issuer", "narrative"].map((key) => (typeof record[key] === "string" ? `${key}: ${record[key]}` : "")).filter(Boolean)
      nftText = bits.join(" · ") || "NFT metadata"
    } else if (typeof nft === "string") nftText = nft
    return {
      main: (parsed.main || "").replace(/\s+/g, " ").trim(),
      shortName: (parsed.short_name || "").trim(),
      market: (parsed.market || "").trim(),
      nft: nftText,
    }
  } catch {
    return { ...empty, main: raw.replace(/\s+/g, " ").trim() }
  }
}

export function priceRate(price: Price | undefined): number | null {
  if (!price?.base || !price.quote) return null
  const base = toFloat(price.base.amount, peekAsset(price.base.asset_id)?.precision ?? 0)
  const quote = toFloat(price.quote.amount, peekAsset(price.quote.asset_id)?.precision ?? 0)
  if (!base || !quote) return null
  return quote / base
}

export function priceText(price: Price | undefined): string {
  const rate = priceRate(price)
  if (!price?.base || rate == null) return "—"
  const left = peekAsset(price.base.asset_id)?.symbol ?? price.base.asset_id
  const right = peekAsset(price.quote.asset_id)?.symbol ?? price.quote.asset_id
  return `1 ${left} = ${rate.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${right}`
}

/** Collateral ratios on the chain use 1,000 = 100%. */
function ratioScale(value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n / 1000
}

export function settled(price: Price | undefined): boolean {
  const base = asBig(price?.base?.amount ?? 0)
  const quote = asBig(price?.quote?.amount ?? 0)
  return base > 0n && quote > 0n
}

export function globallySettled(bit: BitAsset | null): boolean {
  if (!bit) return false
  return settled(bit.settlement_price) || asBig(bit.settlement_fund ?? 0) > 0n
}

export function individuallySettled(bit: BitAsset | null): boolean {
  if (!bit || globallySettled(bit)) return false
  return asBig(bit.individual_settlement_debt ?? 0) > 0n || asBig(bit.individual_settlement_fund ?? 0) > 0n
}

export async function fetchAssetPage(idOrSymbol: string): Promise<AssetPageData> {
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
  const dynamic = (objects.find((row) => row?.id === asset!.dynamic_asset_data_id) ?? {}) as AssetDynamic
  const bitasset = (objects.find((row) => row?.id === asset!.bitasset_data_id) ?? null) as BitAsset | null
  const backing = bitasset?.options?.short_backing_asset
  const feedAssets = [
    backing,
    bitasset?.current_feed?.settlement_price?.base.asset_id,
    bitasset?.current_feed?.settlement_price?.quote.asset_id,
    bitasset?.current_feed?.core_exchange_rate?.base.asset_id,
    bitasset?.current_feed?.core_exchange_rate?.quote.asset_id,
    asset.options.core_exchange_rate?.base.asset_id,
    asset.options.core_exchange_rate?.quote.asset_id,
  ]
  await resolveAssets(feedAssets.filter((id): id is string => !!id))

  const [calls, settles, bids, markets, pools, offers, funds] = await Promise.all([
    bitasset ? db<Array<Record<string, unknown>>>("get_call_orders", [asset.id, 300]).catch(() => []) : Promise.resolve([]),
    bitasset ? db<Array<Record<string, unknown>>>("get_settle_orders", [asset.symbol, 50]).catch(() => []) : Promise.resolve([]),
    bitasset ? db<Array<Record<string, unknown>>>("get_collateral_bids", [asset.id, 50, 0]).catch(() => []) : Promise.resolve([]),
    loadMarkets(asset.symbol),
    fetchAllPools().then((rows) => rows.filter((pool) => pool.asset_a === asset!.id || pool.asset_b === asset!.id || pool.share_asset === asset!.id)).catch(() => []),
    fetchAllOffers().then((rows) => rows.filter((offer) => offer.asset_type === asset!.id)).catch(() => []),
    fetchAllFunds().then((rows) => rows.filter((fund) => fund.asset_type === asset!.id)).catch(() => []),
  ])

  const debtPrec = asset.precision
  const collPrec = peekAsset(backing)?.precision ?? 5
  const feedRate = priceRate(bitasset?.current_feed?.settlement_price)
  const feedMcr = ratioScale(bitasset?.current_feed?.maintenance_collateral_ratio)
  const callRows = (calls ?? []).map((row) => {
    const collateral = (row.collateral as string | number) ?? 0
    const debt = (row.debt as string | number) ?? 0
    const coll = toFloat(collateral, collPrec)
    const debtFloat = toFloat(debt, debtPrec)
    const ratio = feedRate && debtFloat ? coll / (debtFloat * feedRate) : null
    const target = ratioScale(row.target_collateral_ratio)
    const mcr = target ?? feedMcr
    const callPrice = mcr != null && coll > 0 && debtFloat > 0 ? (debtFloat * mcr) / coll : null
    return {
      id: String(row.id ?? ""),
      borrower: String(row.borrower ?? ""),
      collateral,
      debt,
      callPrice,
      ratio,
    }
  }).sort((a, b) => (a.ratio ?? Number.POSITIVE_INFINITY) - (b.ratio ?? Number.POSITIVE_INFINITY))

  const settleRows = (settles ?? []).map((row) => {
    const balance = row.balance as Amount | undefined
    return {
      id: String(row.id ?? ""),
      owner: String(row.owner ?? row.owner_account ?? ""),
      amount: balance?.amount ?? 0,
      assetId: balance?.asset_id ?? asset.id,
      date: String(row.settlement_date ?? ""),
    }
  })
  const bidRows = (bids ?? []).map((row) => ({
    bidder: String(row.bidder ?? ""),
    collateral: (row.collateral as string | number) ?? (row.inv_swan_price as { quote?: Amount } | undefined)?.quote?.amount ?? 0,
    debt: (row.bid as string | number) ?? (row.inv_swan_price as { base?: Amount } | undefined)?.base?.amount ?? 0,
  }))

  const accounts = [
    asset.issuer,
    ...(asset.options.whitelist_authorities ?? []),
    ...(asset.options.blacklist_authorities ?? []),
    ...(bitasset?.feeds ?? []).map((feed) => feed[0]),
    ...callRows.map((row) => row.borrower),
    ...settleRows.map((row) => row.owner),
    ...bidRows.map((row) => row.bidder),
    ...offers.map((offer) => offer.owner_account),
    ...funds.map((fund) => fund.owner_account),
  ]
  await Promise.all([
    resolveAccounts(accounts),
    resolveAssets([...(asset.options.whitelist_markets ?? []), ...(asset.options.blacklist_markets ?? []), ...pools.flatMap((pool) => [pool.asset_a, pool.asset_b, pool.share_asset])]),
  ])

  return {
    asset,
    dynamic,
    bitasset,
    description: parseDescription(asset.options.description),
    calls: callRows,
    settles: settleRows,
    bids: bidRows,
    markets,
    ...(await assetUsd(asset.symbol, markets)),
    pools,
    offers,
    funds,
  }
}

function marketVolume(row: { base: string; quote: string; baseVolume: string; quoteVolume: string }, core: string): number {
  const base = Number(row.baseVolume) || 0
  const quote = Number(row.quoteVolume) || 0
  if (base <= 0 && quote <= 0) return 0
  if (row.base === core) return base
  if (row.quote === core) return quote
  return Math.max(base, quote)
}

function withVolume(row: Omit<AssetMarket, "volume">, core: string): AssetMarket {
  return { ...row, volume: marketVolume(row, core) }
}

/** Ticker `latest` is the price of 1 quote asset measured in the base asset. */
function btsPerAsset(row: AssetMarket, symbol: string, core: string): number | null {
  const latest = Number(row.latest)
  if (!(latest > 0) || row.volume <= 0) return null
  if (row.base === core && row.quote === symbol) return latest
  if (row.quote === core && row.base === symbol) return 1 / latest
  return null
}

async function assetUsd(symbol: string, markets: AssetMarket[]): Promise<{ usdPrice: number | null; usdSource: string }> {
  const core = coreSymbol()
  const quote = await fetchBtsUsd()
  if (symbol === "USD") return { usdPrice: null, usdSource: quote.source }
  if (symbol === core) return { usdPrice: quote.price, usdSource: quote.source }
  const btsMarkets = markets
    .map((row) => ({ row, price: btsPerAsset(row, symbol, core) }))
    .filter((row): row is { row: AssetMarket; price: number } => row.price != null && row.row.volume > 0)
    .sort((a, b) => b.row.volume - a.row.volume)
  if (btsMarkets.length && quote.price != null) return { usdPrice: btsMarkets[0]!.price * quote.price, usdSource: quote.source }
  return { usdPrice: null, usdSource: quote.source }
}

async function loadMarkets(symbol: string): Promise<AssetMarket[]> {
  const core = coreSymbol()
  const top = await db<Array<Record<string, string>>>("get_top_markets", [100]).catch(() => [])
  const rows: AssetMarket[] = (top ?? [])
    .filter((row) => (row.base === symbol || row.quote === symbol) && row.base !== "USD" && row.quote !== "USD")
    .map((row) => withVolume({
      base: row.base,
      quote: row.quote,
      latest: row.latest,
      baseVolume: row.base_volume,
      quoteVolume: row.quote_volume,
      change: row.percent_change,
    }, core))
  const seen = new Set(rows.map((row) => `${row.base}/${row.quote}`))
  for (const quote of [core, "CNY", "BTC"]) {
    if (quote === symbol || seen.has(`${quote}/${symbol}`)) continue
    const ticker = await fetchTickerCached(quote, symbol).catch(() => null)
    if (!ticker || !Number(ticker.latest)) continue
    rows.push(withVolume(fromTicker(quote, symbol, ticker), core))
  }
  return rows.sort((a, b) => {
    if (a.volume <= 0 && b.volume <= 0) return 0
    if (a.volume <= 0) return 1
    if (b.volume <= 0) return -1
    return b.volume - a.volume
  }).slice(0, 12)
}

function fromTicker(base: string, quote: string, ticker: Ticker): Omit<AssetMarket, "volume"> {
  return {
    base,
    quote,
    latest: ticker.latest,
    baseVolume: ticker.base_volume,
    quoteVolume: ticker.quote_volume,
    change: ticker.percent_change,
  }
}
