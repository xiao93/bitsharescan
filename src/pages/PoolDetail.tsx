import { Link, useParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, KeyValue, LoadingBlock, Panel, SummaryBits, TypeBadge } from "../components/widgets.tsx"
import { TimeAgo, TimeHead } from "../components/Now.tsx"
import { countPoolSwaps, fetchPool, fetchPoolHistory, poolPrice, poolTvlBts } from "../lib/defi.ts"
import { assetSymbol, peekAsset } from "../lib/directory.ts"
import { compactNumber, compactUsd, formatDecimal, formatRaw, protocolPercent } from "../lib/format.ts"
import { fetchBtsUsd } from "../lib/usd.ts"
import { summarizeBits } from "../lib/ops.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { PoolSwap } from "../components/PoolSwap.tsx"

export default function PoolDetail() {
  const { id = "" } = useParams()
  const poolId = decodeURIComponent(id)
  const { t } = useI18n()
  useTitle(poolId)
  const query = useQuery(async () => {
    const pool = await fetchPool(poolId)
    if (!pool) throw new Error(t("Pool {id} was not found.", { id: poolId }))
    const [history, swaps, quote] = await Promise.all([
      fetchPoolHistory(poolId, 25).catch(() => []),
      countPoolSwaps(poolId),
      fetchBtsUsd().catch(() => ({ price: null, source: "", anchor: null })),
    ])
    return { pool, history, swaps, btsUsd: quote.price ?? Number.NaN }
  }, [poolId])
  const data = query.data
  const pool = data?.pool
  const precA = peekAsset(pool?.asset_a)?.precision ?? 5
  const precB = peekAsset(pool?.asset_b)?.precision ?? 5
  const price = pool ? poolPrice(pool, precA, precB) : null
  const tvl = pool ? poolTvlBts(pool) : null
  const tvlUsd = tvl != null && data && Number.isFinite(data.btsUsd) ? tvl * data.btsUsd : null

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Liquidity pools", to: "/pools" }, { label: pool ? `${assetSymbol(pool.asset_a)}/${assetSymbol(pool.asset_b)}` : poolId }]} />
      <h1 className="text-2xl font-semibold">{pool ? `${assetSymbol(pool.asset_a)} / ${assetSymbol(pool.asset_b)}` : "Pool"}</h1>
      <p className="mb-4 mt-1 font-mono text-sm text-muted">{poolId}</p>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {pool && data ? (
        <>
          <div className="mb-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
            <div className="order-1 min-w-0 xl:order-2">
              <PoolSwap pool={pool} btsUsd={Number.isFinite(data.btsUsd) ? data.btsUsd : null} />
            </div>
            <div className="order-2 grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4 xl:order-1 xl:grid-cols-2">
              <Mini label={t("Est. TVL")} value={tvlUsd == null ? "—" : compactUsd(tvlUsd)} hint={tvl == null ? t("Not a BTS pair") : `${compactNumber(tvl)} BTS`} />
              <Mini label={t("Price")} value={price == null ? "—" : formatDecimal(price)} hint={price == null ? "" : t("{a} in {b}", { a: assetSymbol(pool.asset_a), b: assetSymbol(pool.asset_b) })} />
              <Mini label={t("Taker fee")} value={protocolPercent(pool.taker_fee_percent)} hint={t("Withdraw {fee}", { fee: protocolPercent(pool.withdrawal_fee_percent) })} />
              <Mini label={t("Swaps, 7 days")} value={data.swaps == null ? "—" : String(data.swaps)} hint={t("Indexed exchange ops")} />
            </div>
          </div>
          <Panel title={t("Pool")} className="mb-4">
            <KeyValue rows={[
              { label: t("Asset A"), value: <><Link className={linkClass} to={`/asset/${assetSymbol(pool.asset_a)}`}>{assetSymbol(pool.asset_a)}</Link> · {formatRaw(pool.balance_a, precA)}</> },
              { label: t("Asset B"), value: <><Link className={linkClass} to={`/asset/${assetSymbol(pool.asset_b)}`}>{assetSymbol(pool.asset_b)}</Link> · {formatRaw(pool.balance_b, precB)}</> },
              { label: t("Share assets"), value: <Link className={linkClass} to={`/asset/${assetSymbol(pool.share_asset)}`}>{assetSymbol(pool.share_asset)}</Link> },
              { label: t("Virtual value"), value: <span className="font-mono text-xs">{String(pool.virtual_value)}</span> },
            ]} />
          </Panel>
          <Panel title={t("Recent deposits, withdrawals, and swaps")}>
            {data.history.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-start text-sm">
                  <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium"><TimeHead /></th>
                      <th className="px-4 py-2.5 font-medium">{t("Type")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("Account")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("Summary")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.history.map((event) => (
                      <tr key={event.id}>
                        <td className="px-4 py-3 text-muted"><TimeAgo time={event.time} /></td>
                        <td className="px-4 py-3"><TypeBadge type={event.opType} /></td>
                        <td className="px-4 py-3"><AccountLink id={typeof event.body.account === "string" ? event.body.account : ""} /></td>
                        <td className="px-4 py-3"><SummaryBits bits={summarizeBits(event.opType, event.body)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 py-8 text-center text-sm text-muted">{t("No pool history returned for this market.")}</p>}
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="truncate text-lg font-semibold">{value}</div>
      {hint ? <div className="truncate text-xs text-muted">{hint}</div> : null}
    </div>
  )
}
