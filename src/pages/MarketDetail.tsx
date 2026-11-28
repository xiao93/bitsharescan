import { Link, useParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LineChart, LoadingBlock, Panel } from "../components/widgets.tsx"
import { TimeAgo, TimeHead } from "../components/Now.tsx"
import { fetchCandles, fetchFills, fetchOrderBook, fetchTicker } from "../lib/chain.ts"
import { peekAsset } from "../lib/directory.ts"
import { columnFractionDigits, formatFixed, priceFractionDigits, toFloat } from "../lib/format.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { invertNumber, useMarketInvert } from "../lib/marketInvert.ts"
import type { NormalizedFill } from "../lib/history.ts"
import type { OrderLevel } from "../lib/chain.ts"

type BookRow = { price: number; amount: number; total: number }

function bookRows(levels: OrderLevel[], flipped: boolean, ascending: boolean): BookRow[] {
  const rows = levels.flatMap((level) => {
    const raw = Number(level.price)
    const price = flipped ? invertNumber(raw) : raw
    const amount = Number(flipped ? level.base : level.quote)
    const total = Number(flipped ? level.quote : level.base)
    if (price == null || !(price > 0) || !Number.isFinite(amount) || !Number.isFinite(total)) return []
    return [{ price, amount, total }]
  })
  rows.sort((a, b) => (ascending ? a.price - b.price : b.price - a.price))
  return rows
}

function legAmount(fill: NormalizedFill, assetId: string): number {
  const leg = fill.pays.asset_id === assetId ? fill.pays : fill.receives.asset_id === assetId ? fill.receives : null
  if (!leg) return Number.NaN
  return toFloat(leg.amount, peekAsset(leg.asset_id)?.precision ?? 0)
}

export default function MarketDetail() {
  const { base = "", quote = "" } = useParams()
  const baseSymbol = decodeURIComponent(base).toUpperCase()
  const quoteSymbol = decodeURIComponent(quote).toUpperCase()
  const { t } = useI18n()
  useTitle(`${quoteSymbol}/${baseSymbol}`)
  const query = useQuery(async () => {
    const [ticker, book, fills, candles] = await Promise.all([
      fetchTicker(baseSymbol, quoteSymbol),
      fetchOrderBook(baseSymbol, quoteSymbol, 18),
      fetchFills(baseSymbol, quoteSymbol, 20),
      fetchCandles(baseSymbol, quoteSymbol).catch(() => []),
    ])
    return { ticker, book, fills, candles }
  }, [baseSymbol, quoteSymbol])
  const data = query.data
  const invert = useMarketInvert()
  const flipped = invert.inverted(baseSymbol, quoteSymbol)
  const left = flipped ? baseSymbol : quoteSymbol
  const right = flipped ? quoteSymbol : baseSymbol
  const shown = (value: string | number | null | undefined) => {
    const number = flipped ? invertNumber(value) : Number(value)
    return number == null || !Number.isFinite(number) ? null : number
  }
  const change = Number(data?.ticker.percent_change) * (flipped ? -1 : 1)
  const asks = bookRows(flipped ? data?.book.bids ?? [] : data?.book.asks ?? [], flipped, true)
  const bids = bookRows(flipped ? data?.book.asks ?? [] : data?.book.bids ?? [], flipped, false)
  const bestAsk = asks[0]
  const bestBid = bids[0]
  const spread = bestAsk && bestBid ? bestAsk.price - bestBid.price : null
  const volume = flipped ? data?.ticker.quote_volume : data?.ticker.base_volume
  const volumeAsset = flipped ? quoteSymbol : baseSymbol
  const quoteId = peekAsset(quoteSymbol)?.id ?? ""
  const baseId = peekAsset(baseSymbol)?.id ?? ""
  const leftId = flipped ? baseId : quoteId
  const candles = (data?.candles ?? []).flatMap((point) => {
    const value = flipped ? invertNumber(point.price) : point.price
    return value != null && value > 0 ? [{ date: point.date, value }] : []
  })
  const book = [...asks, ...bids]
  const mid = (values: number[]) => {
    const sorted = values.filter((value) => value > 0).sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)] ?? 0
  }
  const priceAnchor = shown(data?.ticker.latest) ?? bestBid?.price ?? bestAsk?.price ?? 0
  const priceDp = priceFractionDigits(priceAnchor, peekAsset(right)?.precision ?? 8)
  const amountDp = columnFractionDigits(peekAsset(left)?.precision ?? 4, mid(book.map((row) => row.amount)), "amount")
  const totalDp = columnFractionDigits(peekAsset(right)?.precision ?? 4, mid(book.map((row) => row.total)), "total")
  const volumeDp = columnFractionDigits(peekAsset(volumeAsset)?.precision ?? 4, Number(volume) || 0, "amount")
  const num = "px-4 py-1.5 text-end font-mono tabular-nums"

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Markets", to: "/markets" }, { label: `${left}/${right}` }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{left}/{right}</h1>
          <p className="text-sm text-muted">
            <Link className="text-link" to={`/asset/${left}`}>{left}</Link>
            {` ${t("priced in")} `}
            <Link className="text-link" to={`/asset/${right}`}>{right}</Link>
          </p>
          <button type="button" onClick={() => invert.togglePair(baseSymbol, quoteSymbol)} className="mt-2 h-8 rounded-md border border-line px-2 text-xs font-medium text-ink">{flipped ? t("Showing inverted") : t("Invert")}</button>
        </div>
        {data ? (
          <div className="text-end">
            <div className="font-mono text-2xl font-semibold tabular-nums">{shown(data.ticker.latest) == null ? "—" : formatFixed(shown(data.ticker.latest), priceDp)} {right}</div>
            <div className={change >= 0 ? "text-sm text-success" : "text-sm text-danger"}>
              {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"} · {t("24h volume")} {volume == null ? "—" : formatFixed(Number(volume), volumeDp)} {volumeAsset}
            </div>
          </div>
        ) : null}
      </div>
      {query.loading ? <LoadingBlock lines={8} /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {data ? (
        <div className="space-y-4">
          <Panel title="Daily close · 30 days">
            {candles.length ? (
              <LineChart unit={right} points={candles} />
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted">{t("No daily candles in the last 30 days. The order book below is still live.")}</p>
            )}
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Order book">
              <table className="w-full text-start text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 text-end font-medium">{t("Price")} ({right})</th>
                    <th className="px-4 py-2 text-end font-medium">{t("Amount")} ({left})</th>
                    <th className="px-4 py-2 text-end font-medium">{t("Total")} ({right})</th>
                  </tr>
                </thead>
                <tbody>
                  {[...asks].reverse().map((level) => (
                    <tr key={`ask-${level.price}`}>
                      <td className={`${num} text-danger`}>{formatFixed(level.price, priceDp)}</td>
                      <td className={`${num} text-ink`}>{formatFixed(level.amount, amountDp)}</td>
                      <td className={`${num} text-ink`}>{formatFixed(level.total, totalDp)}</td>
                    </tr>
                  ))}
                  <tr className="bg-canvas text-xs text-muted">
                    <td className={num}>{spread == null ? "—" : formatFixed(spread, priceDp)}</td>
                    <td className="px-4 py-2" colSpan={2}>{t("Spread")}</td>
                  </tr>
                  {bids.map((level) => (
                    <tr key={`bid-${level.price}`}>
                      <td className={`${num} text-success`}>{formatFixed(level.price, priceDp)}</td>
                      <td className={`${num} text-ink`}>{formatFixed(level.amount, amountDp)}</td>
                      <td className={`${num} text-ink`}>{formatFixed(level.total, totalDp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel title="Recent trades">
              <table className="w-full text-start text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 text-end font-medium">{t("Price")} ({right})</th>
                    <th className="px-4 py-2 text-end font-medium">{left}</th>
                    <th className="px-4 py-2 font-medium">{t("Side")}</th>
                    <th className="px-4 py-2 font-medium">{t("Account")}</th>
                    <th className="px-4 py-2 font-medium"><TimeHead /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.fills.map((fill) => {
                    const price = flipped ? invertNumber(fill.price) : fill.price
                    const qty = leftId ? legAmount(fill, leftId) : Number.NaN
                    const buy = fill.receives.asset_id === leftId
                    return (
                      <tr key={fill.id}>
                        <td className={`${num} ${buy ? "text-success" : "text-danger"}`}>{price == null || !Number.isFinite(price) ? "—" : formatFixed(price, priceDp)}</td>
                        <td className={`${num} text-ink`}>{Number.isFinite(qty) ? formatFixed(qty, amountDp) : "—"}</td>
                        <td className={`px-4 py-2 ${buy ? "text-success" : "text-danger"}`}>{buy ? t("Buy") : t("Sell")}</td>
                        <td className="px-4 py-2"><AccountLink id={fill.account} /></td>
                        <td className="px-4 py-2 text-muted"><TimeAgo time={fill.time} /></td>
                      </tr>
                    )
                  })}
                  {!data.fills.length ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{t("No recent fills.")}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      ) : null}
    </div>
  )
}
