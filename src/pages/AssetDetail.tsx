import { useState, type ReactNode } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { AccountLink, AssetLink, CopyButton, Crumbs, ErrorBox, KeyValue, LoadingBlock, OpTable, Pager, Panel } from "../components/widgets.tsx"
import { fetchAssetPage, globallySettled, individuallySettled, priceText, settled } from "../lib/assetPage.ts"
import type { AssetPageData, CallRow } from "../lib/assetPage.ts"
import { assetSymbol, flagNames, peekAsset, resolveAccounts, supplyShare } from "../lib/directory.ts"
import { asBig, compactNumber, compactUsd, formatDecimal, formatDuration, formatRaw, formatTime, parseChainTime, percentFromScale, toFloat } from "../lib/format.ts"
import { fetchAssetOps, fetchHolders } from "../lib/history.ts"
import { coreSymbol } from "../lib/network.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 25
const BSRM = ["Global settlement", "No settlement", "Individual settlement to fund", "Individual settlement to order"]

export default function AssetDetail() {
  const { id = "" } = useParams()
  const symbol = decodeURIComponent(id)
  const { t } = useI18n()
  useTitle(symbol)
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const bundle = useQuery(() => fetchAssetPage(symbol), [symbol])
  const data = bundle.data
  const asset = data?.asset
  const holders = useQuery(
    async () => {
      if (!asset) return null
      const result = await fetchHolders(asset.id, page, PAGE_SIZE)
      await resolveAccounts(result.rows.map((row) => row.owner))
      return result
    },
    [asset?.id, page],
  )
  const ops = useQuery(() => (asset ? fetchAssetOps(asset.id, 40).catch(() => []) : Promise.resolve([])), [asset?.id])
  const smart = Boolean(data?.bitasset)
  const showPools = Boolean(data && (data.pools.length || data.offers.length || data.funds.length))
  const tabs = [
    "transfers",
    "holders",
    ...(smart ? ["feeds", "positions", "settlements"] : []),
    "markets",
    ...(showPools ? ["pools"] : []),
    "info",
  ]
  const requested = params.get("tab") || "holders"
  const tab = tabs.includes(requested) ? requested : "holders"

  function setTab(next: string) {
    const copy = new URLSearchParams(params)
    copy.set("tab", next)
    if (next !== "holders") copy.delete("page")
    setParams(copy, { replace: true })
  }

  const priceUsd = asset?.symbol === "USD" ? 1 : data?.usdPrice ?? Number.NaN
  const supplyFloat = asset && data ? toFloat(data.dynamic.current_supply ?? 0, asset.precision) : null
  const cap = supplyFloat != null && Number.isFinite(priceUsd) ? supplyFloat * priceUsd : null
  const kind = !asset ? "" : asset.id === "1.3.0" ? "Core" : data?.bitasset?.is_prediction_market ? "Prediction" : smart ? "SmartCoin" : "UIA"

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Assets", to: "/assets" }, { label: asset?.symbol ?? symbol }]} />
      {bundle.loading ? <LoadingBlock lines={6} /> : null}
      {bundle.error ? <ErrorBox message={bundle.error} onRetry={bundle.reload} /> : null}
      {asset && data ? (
        <>
          <header className="mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{asset.symbol}</h1>
              <CopyButton value={asset.symbol} />
              <span className="rounded-full bg-chip px-2 py-0.5 text-xs font-medium text-link">{t(kind)}</span>
              {globallySettled(data.bitasset) ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-danger">{t("Global settlement")}</span> : null}
              {individuallySettled(data.bitasset) ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t("Individual settlement")}</span> : null}
              {data.description.shortName ? <span className="text-sm text-muted">{data.description.shortName}</span> : null}
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted">{data.description.main || t("No description published.")}</p>
            <p className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-muted">{asset.id}<CopyButton value={asset.id} /></p>
          </header>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("Price")} value={Number.isFinite(priceUsd) && priceUsd > 0 ? `$${formatDecimal(priceUsd)}` : "—"} hint={data.usdSource || t("No market with volume")} title={data.usdSource} />
            <Stat label={t("Market cap")} value={cap == null ? "—" : compactUsd(cap)} hint={supplyFloat == null ? "" : t("{n} {sym} supply", { n: compactNumber(supplyFloat), sym: asset.symbol })} />
            <Stat label={t("Holders")} value={holders.data ? formatRaw(holders.data.total, 0) : "—"} hint={holders.data?.relation === "gte" ? t("At least this many") : t("Non-zero balances")} />
            <Stat label={t("Current supply")} value={formatRaw(data.dynamic.current_supply ?? 0, asset.precision)} hint={t("{n} decimal places", { n: asset.precision })} />
          </div>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <Panel title={t("Overview")}>
              <KeyValue rows={overviewRows(data)} />
            </Panel>
            <Panel title={t("Markets")}>
              <MarketList data={data} />
            </Panel>
          </div>
          <Panel>
            <div className="flex gap-1 overflow-x-auto border-b border-line px-2">
              {tabs.map((item) => (
                <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${tab === item ? "border-link text-link" : "border-transparent text-muted"}`}>
                  {t(tabLabel(item))}
                </button>
              ))}
            </div>
            {tab === "transfers" ? <OpTable rows={ops.data ?? []} /> : null}
            {tab === "holders" ? <Holders assetPrecision={asset.precision} supply={data.dynamic.current_supply ?? 0} page={page} holders={holders} onPage={(next) => {
              const copy = new URLSearchParams(params)
              copy.set("page", String(next))
              copy.set("tab", "holders")
              setParams(copy)
            }} /> : null}
            {tab === "feeds" && data.bitasset ? <Feeds data={data} /> : null}
            {tab === "positions" ? <Positions data={data} /> : null}
            {tab === "settlements" && data.bitasset ? <Settlements data={data} /> : null}
            {tab === "markets" ? <div className="p-0"><MarketList data={data} detailed /></div> : null}
            {tab === "pools" ? <Pools data={data} /> : null}
            {tab === "info" ? <Info data={data} /> : null}
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function tabLabel(tab: string) {
  if (tab === "transfers") return "Transfers"
  if (tab === "holders") return "Holders"
  if (tab === "feeds") return "Feeds"
  if (tab === "positions") return "Margin positions"
  if (tab === "settlements") return "Settlements"
  if (tab === "markets") return "Markets"
  if (tab === "pools") return "Pools"
  return "Info"
}

function overviewRows(data: AssetPageData) {
  const asset = data.asset
  const dyn = data.dynamic
  const backing = data.bitasset?.options?.short_backing_asset
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Issuer", value: <AccountLink id={asset.issuer} /> },
    { label: "Precision", value: String(asset.precision) },
    { label: "Max supply", value: formatRaw(asset.options.max_supply ?? 0, asset.precision) },
    { label: "Confidential supply", value: formatRaw(dyn.confidential_supply ?? 0, asset.precision) },
    { label: "Accumulated fees", value: formatRaw(dyn.accumulated_fees ?? 0, asset.precision) },
    { label: "Fee pool", value: `${formatRaw(dyn.fee_pool ?? 0, peekAsset("1.3.0")?.precision ?? 5)} ${coreSymbol()}` },
    { label: "Core exchange rate", value: priceText(asset.options.core_exchange_rate) },
    { label: "Market fee", value: percentFromScale(Number(asset.options.market_fee_percent ?? 0)) },
    { label: "Max market fee", value: formatRaw(asset.options.max_market_fee ?? 0, asset.precision) },
  ]
  const median = data.bitasset?.median_feed?.settlement_price ?? data.bitasset?.current_feed?.settlement_price
  if (median && !globallySettled(data.bitasset)) rows.splice(2, 0, { label: "Feed price", value: priceText(median) })
  if (globallySettled(data.bitasset)) {
    rows.splice(2, 0,
      { label: "Global settlement price", value: priceText(data.bitasset?.settlement_price) },
      { label: "Settlement fund", value: formatRaw(data.bitasset?.settlement_fund ?? 0, peekAsset(backing)?.precision ?? 5) },
    )
  } else if (individuallySettled(data.bitasset)) {
    rows.splice(2, 0,
      { label: "Individual settlement price", value: priceText(data.bitasset?.current_feed?.settlement_price) },
      { label: "Settlement fund", value: `${formatRaw(data.bitasset?.individual_settlement_fund ?? 0, peekAsset(backing)?.precision ?? 5)} ${assetSymbol(backing)}` },
    )
  }
  if (backing) rows.push({ label: "Short backing asset", value: <AssetLink id={backing} /> })
  const reward = Number((asset.options.extensions ?? {}).reward_percent)
  if (Number.isFinite(reward) && reward) rows.push({ label: "Reward percent", value: percentFromScale(reward) })
  rows.push({ label: "Created", value: asset.creation_time ? <Link className={linkClass} to={`/block/${asset.creation_block_num}`}>{formatTime(asset.creation_time)}</Link> : "—" })
  return rows
}

function MarketList({ data, detailed }: { data: AssetPageData; detailed?: boolean }) {
  const { t } = useI18n()
  if (!data.markets.length) return <p className="px-4 py-6 text-sm text-muted">{t("No markets returned for this asset.")}</p>
  return (
    <ul className="divide-y divide-line">
      {data.markets.map((row) => (
        <li key={`${row.base}/${row.quote}`} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${row.volume <= 0 ? "text-muted opacity-60" : ""}`}>
          <Link className={linkClass} to={`/market/${row.base}/${row.quote}`}>{row.base}/{row.quote}</Link>
          <span className="font-mono tabular-nums">{formatDecimal(row.latest)}</span>
          <span className="text-xs text-muted">{t("Volume")} {formatDecimal(row.baseVolume)} {row.base} · {formatDecimal(row.quoteVolume)} {row.quote}</span>
          {detailed ? <span className="text-xs text-muted">{row.change}%</span> : null}
        </li>
      ))}
    </ul>
  )
}

function Holders({ assetPrecision, supply, page, holders, onPage }: {
  assetPrecision: number
  supply: string | number
  page: number
  holders: { data: { rows: Array<{ owner: string; balance: string | number }>; total: number } | null; loading: boolean; error: string | null; reload: () => void }
  onPage: (page: number) => void
}) {
  const { t } = useI18n()
  return (
    <>
      {holders.loading && !holders.data ? <LoadingBlock /> : null}
      {holders.error ? <div className="p-4"><ErrorBox message={holders.error} onRetry={holders.reload} /></div> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">#</th>
              <th className="px-4 py-2.5 font-medium">{t("Account")}</th>
              <th className="px-4 py-2.5 font-medium">{t("Balance")}</th>
              <th className="px-4 py-2.5 font-medium">{t("Share")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {holders.data?.rows.map((row, index) => (
              <tr key={`${row.owner}-${index}`}>
                <td className="px-4 py-3 text-muted">{(page - 1) * PAGE_SIZE + index + 1}</td>
                <td className="px-4 py-3"><AccountLink id={row.owner} /></td>
                <td className="px-4 py-3 font-mono tabular-nums">{formatRaw(row.balance, assetPrecision)}</td>
                <td className="px-4 py-3 text-muted">{supplyShare(row.balance, supply)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} hasPrev={page > 1} hasNext={Boolean(holders.data && page * PAGE_SIZE < holders.data.total)} onPage={onPage} />
    </>
  )
}

function Feeds({ data }: { data: AssetPageData }) {
  const { t } = useI18n()
  const bit = data.bitasset!
  const feed = bit.current_feed
  const ext = bit.options?.extensions ?? {}
  const backing = bit.options?.short_backing_asset
  return (
    <div>
      <KeyValue rows={[
        { label: "Feed price", value: priceText(bit.median_feed?.settlement_price ?? feed?.settlement_price) },
        ...(globallySettled(bit) ? [{ label: "Global settlement price", value: priceText(bit.settlement_price) }, { label: "Settlement fund", value: formatRaw(bit.settlement_fund ?? 0, peekAsset(backing)?.precision ?? 5) }] : []),
        ...(individuallySettled(bit) ? [{ label: "Individual settlement price", value: priceText(feed?.settlement_price) }, { label: "Settlement fund", value: `${formatRaw(bit.individual_settlement_fund ?? 0, peekAsset(backing)?.precision ?? 5)} ${assetSymbol(backing)}` }] : []),
        { label: "Core exchange rate", value: priceText(feed?.core_exchange_rate) },
        { label: "MCR", value: ratio(feed?.maintenance_collateral_ratio) },
        { label: "MSSR", value: ratio(feed?.maximum_short_squeeze_ratio) },
        { label: "ICR", value: ratio(feed?.initial_collateral_ratio ?? ext.initial_collateral_ratio) },
        { label: "MCFR", value: ext.margin_call_fee_ratio == null ? "—" : `${(Number(ext.margin_call_fee_ratio) / 10).toFixed(1)}%` },
        { label: "Feed lifetime", value: formatDuration(Number(bit.options?.feed_lifetime_sec ?? 0)) },
        { label: "Minimum feeds", value: String(bit.options?.minimum_feeds ?? "—") },
        { label: "Force settlement delay", value: formatDuration(Number(bit.options?.force_settlement_delay_sec ?? 0)) },
        { label: "Force settlement offset", value: percentFromScale(Number(bit.options?.force_settlement_offset_percent ?? 0)) },
        { label: "Max settlement volume", value: percentFromScale(Number(bit.options?.maximum_force_settlement_volume ?? 0)) },
        { label: "Settled volume", value: formatRaw(bit.force_settled_volume ?? 0, data.asset.precision) },
        { label: "Short backing asset", value: backing ? <AssetLink id={backing} /> : "—" },
        { label: "Published", value: bit.current_feed_publication_time ? formatTime(bit.current_feed_publication_time) : "—" },
      ]} />
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("Publisher")}</th>
              <th className="px-4 py-2 font-medium">{t("Feed price")}</th>
              <th className="px-4 py-2 font-medium">{t("MCR")}</th>
              <th className="px-4 py-2 font-medium">{t("MSSR")}</th>
              <th className="px-4 py-2 font-medium">{t("Time")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(bit.feeds ?? []).map((row) => {
              const [publisher, entry] = row
              const [time, body] = entry
              const lifetime = Number(bit.options?.feed_lifetime_sec ?? 0)
              const expired = lifetime > 0 && Date.now() - parseChainTime(time) > lifetime * 1000
              return (
                <tr key={publisher} className={expired ? "text-muted" : ""}>
                  <td className="px-4 py-2"><AccountLink id={publisher} className={expired ? "text-muted hover:text-muted" : undefined} />{expired ? <span className="ml-2 text-xs uppercase tracking-wide">{t("Expired")}</span> : null}</td>
                  <td className="px-4 py-2">{priceText(body.settlement_price)}</td>
                  <td className="px-4 py-2 font-mono">{ratio(body.maintenance_collateral_ratio)}</td>
                  <td className="px-4 py-2 font-mono">{ratio(body.maximum_short_squeeze_ratio)}</td>
                  <td className="px-4 py-2 text-muted">{formatTime(time)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!bit.feeds?.length ? <p className="px-4 py-6 text-sm text-muted">{t("No feeds published.")}</p> : null}
      </div>
    </div>
  )
}

type PositionSort = { key: "debt" | "collateral" | "ratio" | "call"; dir: "asc" | "desc" }

function Positions({ data }: { data: AssetPageData }) {
  const { t } = useI18n()
  const backing = data.bitasset?.options?.short_backing_asset
  const collPrec = peekAsset(backing)?.precision ?? 5
  const [sort, setSort] = useState<PositionSort>({ key: "ratio", dir: "asc" })
  if (!data.calls.length) return <p className="px-4 py-6 text-sm text-muted">{t("No margin positions.")}</p>
  const rows = [...data.calls].sort((a, b) => compareCalls(a, b, sort))
  function toggle(key: PositionSort["key"]) {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "debt" || key === "collateral" ? "desc" : "asc" })
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">{t("Account")}</th>
            <SortHead label={t("Debt")} active={sort.key === "debt"} dir={sort.dir} align="right" onClick={() => toggle("debt")} />
            <SortHead label={t("Collateral")} active={sort.key === "collateral"} dir={sort.dir} align="right" onClick={() => toggle("collateral")} />
            <SortHead label={t("Collateral ratio")} active={sort.key === "ratio"} dir={sort.dir} align="right" onClick={() => toggle("ratio")} />
            <SortHead label={t("Call price")} active={sort.key === "call"} dir={sort.dir} align="left" onClick={() => toggle("call")} />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-2"><AccountLink id={row.borrower} /></td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{formatRaw(row.debt, data.asset.precision)} {data.asset.symbol}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{formatRaw(row.collateral, collPrec)} {assetSymbol(backing)}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{row.ratio == null ? "—" : `${(row.ratio * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`}</td>
              <td className="px-4 py-2">{formatCallPrice(row.callPrice, assetSymbol(backing), data.asset.symbol)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function compareCalls(a: CallRow, b: CallRow, sort: PositionSort): number {
  const dir = sort.dir === "asc" ? 1 : -1
  if (sort.key === "ratio" || sort.key === "call") {
    const av = sort.key === "ratio" ? a.ratio : a.callPrice
    const bv = sort.key === "ratio" ? b.ratio : b.callPrice
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return 1
    return (av - bv) * dir
  }
  const av = asBig(sort.key === "debt" ? a.debt : a.collateral)
  const bv = asBig(sort.key === "debt" ? b.debt : b.collateral)
  return (av > bv ? 1 : av < bv ? -1 : 0) * dir
}

function formatCallPrice(value: number | null, collateral: string, debt: string): string {
  if (value == null || !Number.isFinite(value) || !collateral) return "—"
  return `1 ${collateral} = ${value.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${debt}`
}

function SortHead({ label, active, dir, align, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; align: "left" | "right"; onClick: () => void }) {
  return (
    <th className={`px-4 py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button type="button" onClick={onClick} className={`inline-flex w-full items-center gap-1 uppercase tracking-wide ${align === "right" ? "justify-end" : ""}`}>
        {label}
        <span className={active ? "text-link" : "text-transparent"} aria-hidden>{dir === "asc" ? "↑" : "↓"}</span>
      </button>
    </th>
  )
}

function Settlements({ data }: { data: AssetPageData }) {
  const { t } = useI18n()
  const bit = data.bitasset!
  const method = Number(bit.options?.extensions?.black_swan_response_method)
  const globally = settled(bit.settlement_price)
  return (
    <div>
      <KeyValue rows={[
        { label: "Global settlement", value: globally ? t("Globally settled") : individuallySettled(bit) ? t("Individual settlement") : t("Not globally settled") },
        { label: globally ? "Global settlement price" : "Individual settlement price", value: priceText(globally ? bit.settlement_price : bit.current_feed?.settlement_price) },
        { label: "Settlement fund", value: formatRaw(globally ? bit.settlement_fund ?? 0 : bit.individual_settlement_fund ?? 0, peekAsset(bit.options?.short_backing_asset)?.precision ?? 5) },
        { label: "Black swan response", value: Number.isFinite(method) ? t(BSRM[method] ?? `Method ${method}`) : "—" },
      ]} />
      <h3 className="border-t border-line px-4 py-3 text-sm font-semibold">{t("Pending force settlements")}</h3>
      {data.settles.length ? (
        <ul className="divide-y divide-line">
          {data.settles.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <AccountLink id={row.owner} />
              <span className="font-mono">{formatRaw(row.amount, peekAsset(row.assetId)?.precision ?? data.asset.precision)} {assetSymbol(row.assetId)}</span>
              <span className="text-muted">{row.date ? formatTime(row.date) : "—"}</span>
            </li>
          ))}
        </ul>
      ) : <p className="px-4 pb-4 text-sm text-muted">{t("No pending force settlements.")}</p>}
      <h3 className="border-t border-line px-4 py-3 text-sm font-semibold">{t("Collateral bids")}</h3>
      {data.bids.length ? (
        <ul className="divide-y divide-line">
          {data.bids.map((row, index) => (
            <li key={`${row.bidder}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
              <AccountLink id={row.bidder} />
              <span className="font-mono">{formatRaw(row.debt, data.asset.precision)} {data.asset.symbol}</span>
              <span className="font-mono">{formatRaw(row.collateral, peekAsset(bit.options?.short_backing_asset)?.precision ?? 5)} {assetSymbol(bit.options?.short_backing_asset)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="px-4 pb-4 text-sm text-muted">{t("No collateral bids.")}</p>}
    </div>
  )
}

function Pools({ data }: { data: AssetPageData }) {
  const { t } = useI18n()
  return (
    <div>
      {data.pools.length ? (
        <ul className="divide-y divide-line">
          {data.pools.map((pool) => (
            <li key={pool.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <Link className={linkClass} to={`/pool/${pool.id}`}>{assetSymbol(pool.asset_a)}/{assetSymbol(pool.asset_b)}</Link>
              <span className="font-mono text-xs">{formatRaw(pool.balance_a, peekAsset(pool.asset_a)?.precision ?? 5)} / {formatRaw(pool.balance_b, peekAsset(pool.asset_b)?.precision ?? 5)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="px-4 py-4 text-sm text-muted">{t("No liquidity pools contain this asset.")}</p>}
      {data.offers.length ? (
        <>
          <h3 className="border-t border-line px-4 py-3 text-sm font-semibold">{t("Credit offers")}</h3>
          <ul className="divide-y divide-line">
            {data.offers.slice(0, 20).map((offer) => (
              <li key={offer.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <Link className={`${linkClass} font-mono text-xs`} to={`/credit-offer/${offer.id}`}>{offer.id}</Link>
                <AccountLink id={offer.owner_account} />
                <span className="font-mono">{formatRaw(offer.current_balance, data.asset.precision)} {data.asset.symbol}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {data.funds.length ? (
        <>
          <h3 className="border-t border-line px-4 py-3 text-sm font-semibold">{t("SameT funds")}</h3>
          <ul className="divide-y divide-line">
            {data.funds.slice(0, 20).map((fund) => (
              <li key={fund.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <Link className={`${linkClass} font-mono text-xs`} to={`/samet/${fund.id}`}>{fund.id}</Link>
                <AccountLink id={fund.owner_account} />
                <span className="font-mono">{formatRaw(fund.balance, data.asset.precision)} {data.asset.symbol}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

function Info({ data }: { data: AssetPageData }) {
  const { t } = useI18n()
  const asset = data.asset
  const ext = asset.options.extensions ?? {}
  const names = (ids: string[] | undefined) => ids?.length ? <span className="inline-flex flex-wrap gap-x-3 gap-y-1">{ids.map((id) => <AccountLink key={id} id={id} />)}</span> : t("None")
  const markets = (ids: string[] | undefined) => ids?.length ? <span className="inline-flex flex-wrap gap-x-3 gap-y-1">{ids.map((id) => <AssetLink key={id} id={id} />)}</span> : t("None")
  return (
    <div>
      <KeyValue rows={[
        { label: "Description", value: data.description.main || "—" },
        { label: "Short name", value: data.description.shortName || "—" },
        { label: "Market", value: data.description.market || "—" },
        { label: "NFT", value: data.description.nft || "—" },
        { label: "Flags", value: flagNames(Number(asset.options.flags ?? 0)).join(", ") || t("None") },
        { label: "Permissions", value: flagNames(Number(asset.options.issuer_permissions ?? 0)).join(", ") || t("None") },
        { label: "Whitelist authorities", value: names(asset.options.whitelist_authorities) },
        { label: "Blacklist authorities", value: names(asset.options.blacklist_authorities) },
        { label: "Whitelist markets", value: markets(asset.options.whitelist_markets) },
        { label: "Blacklist markets", value: markets(asset.options.blacklist_markets) },
        { label: "Reward percent", value: ext.reward_percent == null ? "—" : percentFromScale(Number(ext.reward_percent)) },
        { label: "Taker fee", value: ext.taker_fee_percent == null ? "—" : percentFromScale(Number(ext.taker_fee_percent)) },
        { label: "Dynamic data", value: <span className="font-mono text-xs">{asset.dynamic_asset_data_id}{asset.bitasset_data_id ? ` · ${asset.bitasset_data_id}` : ""}</span> },
      ]} />
    </div>
  )
}

function ratio(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return "—"
  return `${(n / 10).toFixed(1)}%`
}

function Stat({ label, value, hint, title }: { label: string; value: string; hint?: string; title?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4" title={title}>
      <div className="text-xs text-muted">{label}</div>
      <div className="truncate text-lg font-semibold">{value}</div>
      {hint ? <div className="truncate text-xs text-muted">{hint}</div> : null}
    </div>
  )
}
