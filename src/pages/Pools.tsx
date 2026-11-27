import { Link, useSearchParams } from "react-router-dom"
import { Crumbs, ErrorBox, LoadingBlock, OpTable, Pager, Panel } from "../components/widgets.tsx"
import { fetchAllPools, fetchRecentOps, poolTvlBts } from "../lib/defi.ts"
import type { Pool } from "../lib/defi.ts"
import { assetSymbol, peekAsset, resolveAssets } from "../lib/directory.ts"
import { compactNumber, compactUsd, formatRaw, protocolPercent } from "../lib/format.ts"
import { fetchBtsUsd } from "../lib/usd.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 50

export default function Pools() {
  const { t } = useI18n()
  useTitle("Liquidity pools")
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const query = useQuery(async () => {
    const [all, recent, quote] = await Promise.all([
      fetchAllPools(),
      fetchRecentOps([59, 60, 61, 62, 63, 75], 8).catch(() => []),
      fetchBtsUsd().catch(() => ({ price: null, source: "", anchor: null })),
    ])
    const sorted = [...all].sort((a, b) => (poolTvlBts(b) ?? -1) - (poolTvlBts(a) ?? -1))
    const slice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    await resolveAssets(slice.flatMap((pool) => [pool.asset_a, pool.asset_b, pool.share_asset]))
    const tvlBts = all.reduce((sum, pool) => sum + (poolTvlBts(pool) ?? 0), 0)
    const priced = all.filter((pool) => poolTvlBts(pool) != null).length
    return { total: all.length, slice, recent, tvlBts, priced, btsUsd: quote.price ?? Number.NaN }
  }, [page])
  const data = query.data
  const tvlUsd = data && Number.isFinite(data.btsUsd) ? data.tvlBts * data.btsUsd : null

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Liquidity pools" }]} />
      <h1 className="text-2xl font-semibold">{t("Liquidity pools")}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">
        {t("On-chain constant-product pools. Swaps, deposits, and withdrawals are liquidity_pool operations. Estimated TVL doubles the BTS side of pools that pair with BTS.")}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label={t("Pools")} value={data ? String(data.total) : "—"} hint={t("1.19.x objects")} />
        <Mini label={t("Est. TVL")} value={tvlUsd == null ? "—" : compactUsd(tvlUsd)} hint={data ? t("{tvl} BTS · {n} priced pools", { tvl: compactNumber(data.tvlBts), n: data.priced }) : t("BTS-paired estimate")} />
        <Mini label={t("Recent swaps")} value={data ? String(data.recent.filter((row) => row.type === 63).length) : "—"} hint={t("Latest indexed sample")} />
        <Mini label={t("Share assets")} value="1.3.x" hint={t("Pool tokens are user-issued assets")} />
      </div>
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      <Panel title={t("Pools")} className="mb-4">
        {query.loading && !data ? <LoadingBlock /> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-start text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Pool")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Asset A")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Asset B")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Share asset")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Taker fee")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Est. TVL")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.slice.map((pool) => (
                <PoolRow key={pool.id} pool={pool} btsUsd={data.btsUsd} />
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={page}
          hasPrev={page > 1}
          hasNext={Boolean(data && page * PAGE_SIZE < data.total)}
          totalLabel={data ? t("{n} pools", { n: data.total }) : undefined}
          onPage={(next) => {
            const copy = new URLSearchParams(params)
            copy.set("page", String(next))
            setParams(copy)
          }}
        />
      </Panel>
      <Panel title={t("Recent pool operations")}>
        <OpTable rows={data?.recent ?? []} />
      </Panel>
    </div>
  )
}

function PoolRow({ pool, btsUsd }: { pool: Pool; btsUsd: number }) {
  const { t } = useI18n()
  const a = peekAsset(pool.asset_a)
  const b = peekAsset(pool.asset_b)
  const tvl = poolTvlBts(pool)
  return (
    <tr className="hover:bg-row">
      <td className="px-4 py-3">
        <Link to={`/pool/${pool.id}`} className={linkClass}>{assetSymbol(pool.asset_a)}/{assetSymbol(pool.asset_b)}</Link>
        <div className="font-mono text-[11px] text-muted">{pool.id}</div>
      </td>
      <td className="px-4 py-3">{formatRaw(pool.balance_a, a?.precision ?? 5)} {a?.symbol ?? pool.asset_a}</td>
      <td className="px-4 py-3">{formatRaw(pool.balance_b, b?.precision ?? 5)} {b?.symbol ?? pool.asset_b}</td>
      <td className="px-4 py-3">
        <Link to={`/asset/${assetSymbol(pool.share_asset)}`} className={linkClass}>{assetSymbol(pool.share_asset)}</Link>
        <div className="text-[11px] text-muted">{t("withdraw {fee}", { fee: protocolPercent(pool.withdrawal_fee_percent) })}</div>
      </td>
      <td className="px-4 py-3">{protocolPercent(pool.taker_fee_percent)}</td>
      <td className="px-4 py-3">{tvl == null || !Number.isFinite(btsUsd) ? "—" : compactUsd(tvl * btsUsd)}</td>
    </tr>
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
