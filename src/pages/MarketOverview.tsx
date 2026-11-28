import { useState, type FormEvent } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Crumbs, ErrorBox, LoadingBlock, Panel } from "../components/widgets.tsx"
import { peekAsset, resolveAssets } from "../lib/directory.ts"
import { compactUsd, formatFixed, formatInt, priceFractionDigits } from "../lib/format.ts"
import { db } from "../lib/node.ts"
import { coreSymbol } from "../lib/network.ts"
import { fetchBtsUsd } from "../lib/usd.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

type TopMarket = {
  base: string
  quote: string
  latest: string
  percent_change: string
  base_volume: string
  quote_volume: string
}

type MarketRow = {
  base: string
  quote: string
  other: string
  /** Paired asset per one unit of the viewed asset. */
  price: number | null
  change: number | null
  volume: number
  turnover: number
}

/** `get_top_markets` caps at 100 pairs by 24h volume. */
async function fetchAssetMarkets(symbol: string, btsFallback: boolean) {
  await resolveAssets([symbol])
  const asset = peekAsset(symbol)
  if (!asset) throw new Error(`Unknown asset ${symbol}`)
  const [top, quote] = await Promise.all([
    db<TopMarket[]>("get_top_markets", [100]),
    btsFallback ? fetchBtsUsd().catch(() => null) : Promise.resolve(null),
  ])
  const rows: MarketRow[] = []
  for (const row of top ?? []) {
    const viewedIsBase = row.base === asset.symbol
    if (!viewedIsBase && row.quote !== asset.symbol) continue
    const latest = Number(row.latest)
    const pct = Number(row.percent_change)
    // `latest` is base per quote. The viewed asset's price in the paired asset is its inverse when it is the base.
    const price = latest > 0 ? (viewedIsBase ? 1 / latest : latest) : null
    const change = Number.isFinite(pct) ? (viewedIsBase ? (1 / (1 + pct / 100) - 1) * 100 : pct) : null
    rows.push({
      base: row.base,
      quote: row.quote,
      other: viewedIsBase ? row.quote : row.base,
      price,
      change,
      volume: Number(viewedIsBase ? row.base_volume : row.quote_volume) || 0,
      turnover: Number(viewedIsBase ? row.quote_volume : row.base_volume) || 0,
    })
  }
  rows.sort((a, b) => b.volume - a.volume)
  await resolveAssets(rows.map((row) => row.other))
  return { symbol: asset.symbol, precision: asset.precision, rows, btsUsd: quote?.price ?? null }
}

export default function MarketOverview() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const params = useParams()
  const requested = decodeURIComponent(params.asset ?? coreSymbol()).trim().toUpperCase()
  useTitle(`${requested} markets`)
  const [input, setInput] = useState(requested)
  const query = useQuery(() => fetchAssetMarkets(requested, requested === coreSymbol()), [requested])
  const data = query.data
  const symbol = data?.symbol ?? requested
  const totalVolume = data?.rows.reduce((sum, row) => sum + row.volume, 0) ?? 0
  const top = data?.rows[0]

  function open(event: FormEvent) {
    event.preventDefault()
    const next = input.trim().toUpperCase()
    if (next) navigate(`/market/${encodeURIComponent(next)}`)
  }

  const cell = "px-4 py-3 text-end font-mono tabular-nums"
  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Markets", to: "/markets" }, { label: symbol }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("{asset} markets", { asset: symbol })}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {t("Top DEX markets that trade {asset}, ranked by 24h volume. Price is the amount of the paired asset for one {asset}.", { asset: symbol })}
          </p>
        </div>
        <form onSubmit={open} className="flex items-center gap-2">
          <input value={input} onChange={(event) => setInput(event.target.value)} className="h-10 w-36 rounded-lg border border-line bg-card px-3 text-sm uppercase text-ink" aria-label={t("Asset")} />
          <button type="submit" className="h-10 rounded-lg bg-link px-3 text-sm font-medium text-white">{t("Open")}</button>
        </form>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label={t("Markets")} value={data ? formatInt(data.rows.length) : "—"} />
        <Mini label={`${t("24h volume")} (${symbol})`} value={data ? formatFixed(totalVolume, totalVolume >= 1000 ? 0 : 2) : "—"} />
        <Mini label={t("24h USD volume")} value={data?.btsUsd != null ? compactUsd(totalVolume * data.btsUsd) : "—"} />
        <Mini label={t("Most active market")} value={top ? `${symbol}/${top.other}` : "—"} />
      </div>
      <Panel title={t("Markets")}>
        {query.loading && !data ? <LoadingBlock /> : null}
        {query.error ? <div className="p-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
        {data && !data.rows.length ? <p className="px-4 py-8 text-center text-sm text-muted">{t("No markets for {asset} were found among the top 100 by 24h volume.", { asset: symbol })}</p> : null}
        {data?.rows.length ? (
          <>
            <p className="bx-swipe">{t("Swipe sideways to see all columns →").replace(/\s*→\s*$/, "")} <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span></p>
            <div className="bx-scroll overflow-x-auto">
              <table className="w-full min-w-[720px] text-start text-sm">
                <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">{t("Market")}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t("Last price")}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t("24h change")}</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t("Volume")} ({symbol})</th>
                    <th className="px-4 py-2.5 text-end font-medium">{t("Turnover")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((row) => {
                    const otherInfo = peekAsset(row.other)
                    const priceDigits = priceFractionDigits(row.price ?? 0, otherInfo?.precision ?? 8)
                    const volumeDigits = row.volume >= 1000 ? 2 : Math.min(8, data.precision)
                    const turnoverDigits = row.turnover >= 1000 ? 2 : Math.min(8, otherInfo?.precision ?? 8)
                    return (
                      <tr key={`${row.base}-${row.quote}`} className="hover:bg-row">
                        <td className="px-4 py-3">
                          <Link to={`/market/${row.base}/${row.quote}`} className="font-medium text-link hover:underline">{symbol}/{row.other}</Link>
                        </td>
                        <td className={cell}>{row.price == null ? "—" : formatFixed(row.price, priceDigits)}</td>
                        <td className={`${cell} ${row.change == null ? "text-muted" : row.change >= 0 ? "text-success" : "text-danger"}`}>
                          {row.change == null ? "—" : `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}%`}
                        </td>
                        <td className={cell}>{formatFixed(row.volume, volumeDigits)}</td>
                        <td className={cell}>
                          {formatFixed(row.turnover, turnoverDigits)}{" "}
                          <Link to={`/asset/${row.other}`} className={`${linkClass} font-sans`}>{row.other}</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Panel>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="truncate text-lg font-semibold">{value}</div>
    </div>
  )
}
