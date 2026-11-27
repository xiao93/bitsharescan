import { formatTime } from "./format.ts"
import { localeTag } from "./locale.ts"
import { coreSymbol } from "./network.ts"
import { db } from "./node.ts"

export type BtsUsd = {
  price: number | null
  /** Human-readable provenance for a tooltip. Empty when there is no price. */
  source: string
  /** Stablecoin with the most BTS volume, used for the historical chart. */
  anchor: string | null
  /** Where the headline price comes from. */
  kind?: "cmc" | "coingecko" | "dex"
  /** Snapshot timestamp when the headline price comes from CoinMarketCap. */
  updated?: string
  /** CoinGecko reference price, when it answered. */
  cg?: number | null
  /** Volume-weighted on-chain DEX price, shown next to CoinGecko for comparison. */
  dex?: DexPrice | null
  /** True when the headline price is a DEX price with very little 24h volume. */
  thin?: boolean
}

export type DexPrice = {
  price: number
  volumeBts: number
  volumeUsd: number
  mix: string
  anchor: string | null
}

/** Below this 24h USD volume the DEX price is flagged as thin liquidity. */
const THIN_USD = 1_000

async function coinGeckoUsd(): Promise<number | null> {
  try {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 6_000)
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitshares&vs_currencies=usd", {
      signal: controller.signal,
    })
    window.clearTimeout(timer)
    const body = await response.json() as { bitshares?: { usd?: number } }
    const price = Number(body.bitshares?.usd)
    return response.ok && price > 0 ? price : null
  } catch {
    return null
  }
}

type TopMarket = {
  base: string
  quote: string
  latest: string
  base_volume?: string
  quote_volume?: string
}

const MIN_BTS_VOLUME = 10

let cache: { at: number; value: BtsUsd } | null = null

/** Gateway and honest-money tokens treated as one dollar. bitUSD (symbol USD) is never included. */
export function isUsdStable(symbol: string): boolean {
  if (!symbol || symbol === "USD") return false
  return /(?:^|[.])(USDT|USDC|USD)$/.test(symbol)
}

/**
 * Dollars per 1 BTS. The CoinMarketCap snapshot is the headline number (current.price,
 * refreshed periodically). If that snapshot is missing, CoinGecko is used, then the
 * volume-weighted on-chain DEX price.
 */
export async function fetchBtsUsd(): Promise<BtsUsd> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value
  const value = coreSymbol() === "BTS" ? await loadBtsUsd() : { price: null, source: "", anchor: null }
  cache = { at: Date.now(), value }
  return value
}

type CmcCurrentFile = {
  generated_at?: string
  current?: { price?: number; updated?: string }
}

async function fetchCmcCurrent(): Promise<BtsUsd | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/bts-price-history.json`)
    if (!response.ok) return null
    const body = await response.json() as CmcCurrentFile
    const price = Number(body.current?.price)
    if (!(price > 0)) return null
    const updated = body.current?.updated || body.generated_at || ""
    return {
      price,
      source: updated ? `CoinMarketCap · ${updated}` : "CoinMarketCap",
      anchor: "XBTSX.USDT",
      kind: "cmc",
      updated,
    }
  } catch {
    return null
  }
}

async function loadBtsUsd(): Promise<BtsUsd> {
  const cmc = await fetchCmcCurrent()
  if (cmc) return cmc
  const core = "BTS"
  const [rows, cg] = await Promise.all([
    db<TopMarket[]>("get_top_markets", [100]).catch(() => [] as TopMarket[]),
    coinGeckoUsd(),
  ])
  const legs: Array<{ symbol: string; usdPerBts: number; volume: number }> = []
  for (const row of rows ?? []) {
    const latest = Number(row.latest)
    if (!(latest > 0)) continue
    const baseVol = Number(row.base_volume) || 0
    const quoteVol = Number(row.quote_volume) || 0
    let stable = ""
    let usdPerBts = 0
    let volume = 0
    if (row.base === core && isUsdStable(row.quote)) {
      stable = row.quote
      usdPerBts = 1 / latest
      volume = baseVol
    } else if (row.quote === core && isUsdStable(row.base)) {
      stable = row.base
      usdPerBts = latest
      volume = quoteVol
    }
    if (!stable || volume < MIN_BTS_VOLUME) continue
    legs.push({ symbol: stable, usdPerBts, volume })
  }
  let dex: DexPrice | null = null
  if (legs.length) {
    const weight = legs.reduce((sum, leg) => sum + leg.volume, 0)
    const price = legs.reduce((sum, leg) => sum + leg.usdPerBts * leg.volume, 0) / weight
    const ranked = [...legs].sort((a, b) => b.volume - a.volume)
    const mix = ranked.map((leg) => {
      const pct = (leg.volume / weight) * 100
      const share = pct >= 10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`
      return `${leg.symbol} ${share}`
    }).join(", ")
    dex = { price, volumeBts: weight, volumeUsd: weight * price, mix, anchor: ranked[0]?.symbol ?? null }
  }
  if (cg != null) {
    return {
      price: cg,
      source: dex ? `CoinGecko · DEX VWAP $${dex.price.toPrecision(3)} (${dex.mix})` : "CoinGecko",
      anchor: dex?.anchor ?? "XBTSX.USDT",
      kind: "coingecko",
      cg,
      dex,
    }
  }
  if (dex) {
    return {
      price: dex.price,
      source: `DEX VWAP (${dex.mix})`,
      anchor: dex.anchor,
      kind: "dex",
      cg: null,
      dex,
      thin: dex.volumeUsd < THIN_USD,
    }
  }
  return { price: null, source: "", anchor: null }
}

/** One line under the price explaining where it comes from. */
export function priceHint(
  value: BtsUsd | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string | null {
  if (!value || value.price == null) return null
  if (value.kind === "cmc") {
    return value.updated
      ? t("Source: CoinMarketCap, updated {time}", { time: formatTime(value.updated) })
      : t("Source: CoinMarketCap")
  }
  if (value.kind === "coingecko") {
    if (!value.dex || !value.cg) return t("Source: CoinGecko")
    const diff = ((value.dex.price - value.cg) / value.cg) * 100
    return t("Source: CoinGecko · DEX {price} ({diff})", {
      price: `$${value.dex.price.toPrecision(3)}`,
      diff: `${diff >= 0 ? "+" : ""}${diff.toFixed(0)}%`,
    })
  }
  if (value.kind === "dex" && value.dex) {
    const vol = `$${Math.round(value.dex.volumeUsd).toLocaleString(localeTag())}`
    return value.thin
      ? t("Source: on-chain DEX, 24h volume ≈ {vol} (thin liquidity)", { vol })
      : t("Source: on-chain DEX, 24h volume ≈ {vol}", { vol })
  }
  return null
}
