import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Crumbs, ErrorBox, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchFeaturedMarkets } from "../lib/chain.ts"
import { formatFixed, priceFractionDigits } from "../lib/format.ts"
import { peekAsset } from "../lib/directory.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { coreSymbol } from "../lib/network.ts"
import { invertNumber, useMarketInvert } from "../lib/marketInvert.ts"

export default function Markets() {
  const { t } = useI18n()
  useTitle("Markets")
  const navigate = useNavigate()
  const query = useQuery(() => fetchFeaturedMarkets(), [])
  const [base, setBase] = useState("USD")
  const [quote, setQuote] = useState(coreSymbol)
  const invert = useMarketInvert()

  function open(event: FormEvent) {
    event.preventDefault()
    if (!base.trim() || !quote.trim()) return
    navigate(`/market/${encodeURIComponent(base.trim().toUpperCase())}/${encodeURIComponent(quote.trim().toUpperCase())}`)
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Markets" }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("DEX markets")}</h1>
          <p className="mt-1 text-sm text-muted">{t("On-chain tickers. Price is the amount of the base asset for one quote asset.")}</p>
        </div>
        <form onSubmit={open} className="flex flex-wrap items-center gap-2">
          <input value={base} onChange={(event) => setBase(event.target.value)} className="h-10 w-28 rounded-lg border border-line bg-card px-3 text-sm uppercase text-ink" aria-label={t("Base asset")} />
          <span className="text-muted">/</span>
          <input value={quote} onChange={(event) => setQuote(event.target.value)} className="h-10 w-28 rounded-lg border border-line bg-card px-3 text-sm uppercase text-ink" aria-label={t("Quote asset")} />
          <button type="submit" className="h-10 rounded-lg bg-link px-3 text-sm font-medium text-white">{t("Open")}</button>
          <button type="button" onClick={invert.toggleGlobal} className={`h-10 rounded-lg border px-3 text-sm font-medium ${invert.global ? "border-link bg-tint text-link" : "border-line text-ink"}`}>{t("Invert all")}</button>
        </form>
      </div>
      <Panel>
        {query.loading ? <LoadingBlock /> : null}
        {query.error ? <div className="p-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
        <p className="bx-swipe">{t("Swipe sideways to see all columns →").replace(/\s*→\s*$/, "")} <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span></p>
        <div className="bx-scroll overflow-x-auto">
          <table className="w-full min-w-[720px] text-start text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Market")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("Last")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("Bid")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("Ask")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("24h change")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("24h volume")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {query.data?.map((row) => {
                const flipped = invert.inverted(row.base, row.quote)
                const change = Number(row.ticker?.percent_change) * (flipped ? -1 : 1)
                const last = flipped ? invertNumber(row.ticker?.latest) : Number(row.ticker?.latest)
                const bid = flipped ? invertNumber(row.ticker?.lowest_ask) : Number(row.ticker?.highest_bid)
                const ask = flipped ? invertNumber(row.ticker?.highest_bid) : Number(row.ticker?.lowest_ask)
                const left = flipped ? row.base : row.quote
                const right = flipped ? row.quote : row.base
                const volume = flipped ? row.ticker?.quote_volume : row.ticker?.base_volume
                const volumeAsset = flipped ? row.quote : row.base
                const anchor = [last, bid, ask].find((value) => value != null && value > 0) ?? 0
                const digits = priceFractionDigits(anchor, peekAsset(right)?.precision ?? 8)
                const cell = "px-4 py-3 text-end font-mono tabular-nums"
                return (
                  <tr key={`${row.base}-${row.quote}`} className="hover:bg-row">
                    <td className="px-4 py-3">
                      <Link to={`/market/${row.base}/${row.quote}`} className="font-medium text-link hover:underline">{left}/{right}</Link>
                      <button type="button" onClick={() => invert.togglePair(row.base, row.quote)} className="ms-2 text-xs text-muted hover:text-link">{t("Invert")}</button>
                    </td>
                    <td className={cell}>{last == null || !Number.isFinite(last) ? "—" : formatFixed(last, digits)}</td>
                    <td className={cell}>{bid == null || !Number.isFinite(bid) ? "—" : formatFixed(bid, digits)}</td>
                    <td className={cell}>{ask == null || !Number.isFinite(ask) ? "—" : formatFixed(ask, digits)}</td>
                    <td className={`${cell} ${change >= 0 ? "text-success" : "text-danger"}`}>
                      {Number.isFinite(change) ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                    </td>
                    <td className={`${cell} text-muted`}>{volume == null ? "—" : `${formatFixed(Number(volume), priceFractionDigits(Number(volume) || 0, 4))} ${volumeAsset}`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
