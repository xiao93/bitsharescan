import { useMemo } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { AccountLink, AmountView, Crumbs, ErrorBox, LoadingBlock, Pager, Panel, TxLink } from "../components/widgets.tsx"
import { useTimeMode } from "../components/Now.tsx"
import { fetchLargeTransfers, filterLargeTransfers, summarizeTransfers } from "../lib/activity.ts"
import { compactUsd, formatInt, formatRaw, formatTime } from "../lib/format.ts"
import { networkNotice } from "../lib/charts.ts"
import { coreSymbol, networkHasEs } from "../lib/network.ts"
import { peekAsset } from "../lib/directory.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 25
const MIN_OPTIONS = [0, 1_000, 10_000, 50_000, 100_000]

export default function LargeTransfers() {
  const { t } = useI18n()
  useTitle("24h Large Transfers")
  useTimeMode()
  const [params, setParams] = useSearchParams()
  const assetId = params.get("asset") ?? "1.3.0"
  const minAmount = params.has("min") ? Number(params.get("min")) : 10_000
  const min = Number.isFinite(minAmount) && minAmount >= 0 ? minAmount : 10_000
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const query = useQuery(() => fetchLargeTransfers(), [])
  const rows = useMemo(() => (query.data ? filterLargeTransfers(query.data, assetId, min) : []), [query.data, assetId, min])
  const stats = useMemo(() => summarizeTransfers(rows, query.data?.btsPrice ?? null), [rows, query.data?.btsPrice])
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const assetLabel = assetId ? (peekAsset(assetId)?.symbol ?? (assetId === "1.3.0" ? coreSymbol() : assetId)) : t("All assets")
  const minUnit = assetId ? assetLabel : "USD"

  function setFilter(next: { asset?: string; min?: string }) {
    const copy = new URLSearchParams(params)
    if (next.asset !== undefined) {
      if (next.asset) copy.set("asset", next.asset)
      else copy.delete("asset")
    }
    if (next.min !== undefined) copy.set("min", next.min || "0")
    copy.set("page", "1")
    setParams(copy)
  }

  const missingIndex = !networkHasEs()
  const largest = stats.largest

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Charts", to: "/charts" }, { label: "24h Large Transfers" }]} />
      <h1 className="text-2xl font-semibold tracking-tight">{t("24h Large Transfers")}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        {t("Transfer operations in the last 24 hours, counted once per operation. Filter by asset or a minimum amount to highlight large transfers.")}
      </p>
      {missingIndex ? <div className="mt-4"><ErrorBox message={t(networkNotice)} /></div> : null}
      {query.error && networkHasEs() ? <div className="mt-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Large transfers (24h)")} value={query.data ? formatInt(stats.count) : "—"} hint={!assetId && min === 0 && query.data?.truncated ? t("Showing the largest {n} indexed transfers", { n: formatInt(query.data.rows.length) }) : t("Matching the current filters")} />
        <Stat label={t("24h BTS volume")} value={query.data ? formatRaw(Math.round(stats.btsVolume * 1e5), 5) : "—"} hint={coreSymbol()} />
        <Stat label={t("24h USD volume")} value={query.data && stats.usdKnown ? compactUsd(stats.usdVolume) : "—"} hint={t("Priced assets only")} />
        <Stat
          label={t("Largest transfer")}
          value={largest ? (largest.usd != null ? compactUsd(largest.usd) : formatRaw(largest.amount, peekAsset(largest.assetId)?.precision ?? 0)) : "—"}
          hint={largest ? `${peekAsset(largest.assetId)?.symbol ?? largest.assetId}` : undefined}
        />
      </div>
      <Panel className="mt-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("Asset")}</span>
            <select
              value={assetId}
              aria-label={t("Asset")}
              onChange={(event) => setFilter({ asset: event.target.value })}
              className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink"
            >
              <option value="">{t("All assets")}</option>
              <option value="1.3.0">{coreSymbol()}</option>
              {(query.data?.assets ?? []).filter((asset) => asset.id !== "1.3.0").map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.symbol}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("Minimum amount")}</span>
            <select
              value={MIN_OPTIONS.includes(min) ? String(min) : "0"}
              aria-label={t("Minimum amount")}
              onChange={(event) => setFilter({ min: event.target.value })}
              className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink"
            >
              {MIN_OPTIONS.map((value) => (
                <option key={value} value={String(value)}>
                  {value === 0 ? t("Any amount") : `${formatInt(value)} ${minUnit}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {query.loading && !query.data ? <LoadingBlock /> : null}
        {query.data && !pageRows.length ? <p className="px-4 py-8 text-center text-sm text-muted">{t("No large transfers in this view.")}</p> : null}
        {pageRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-start text-sm">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("Txn")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Time")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("From")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("To")}</th>
                  <th className="px-4 py-2.5 text-end font-medium">{t("Amount")}</th>
                  <th className="px-4 py-2.5 text-end font-medium">{t("Est. USD")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Block")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageRows.map((row) => (
                  <tr key={row.key} className="hover:bg-row">
                    <td className="px-4 py-3">{row.trxId ? <TxLink id={row.trxId} /> : row.opId ? <Link className={linkClass} to={`/op/${row.opId}`}>{t("Operation")}</Link> : "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{formatTime(row.time)}</td>
                    <td className="px-4 py-3"><AccountLink id={row.from} /></td>
                    <td className="px-4 py-3"><AccountLink id={row.to} /></td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums"><AmountView value={{ amount: row.amount, asset_id: row.assetId }} /></td>
                    <td className="px-4 py-3 text-end font-mono tabular-nums text-muted">{row.usd != null ? compactUsd(row.usd) : "—"}</td>
                    <td className="px-4 py-3">{row.blockNum ? <Link className={linkClass} to={`/block/${row.blockNum}`}>{formatInt(row.blockNum)}</Link> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Pager
          page={page}
          hasPrev={page > 1}
          hasNext={page * PAGE_SIZE < rows.length}
          totalLabel={rows.length ? t("{n} transfers", { n: formatInt(rows.length) }) : undefined}
          onPage={(next) => {
            const copy = new URLSearchParams(params)
            copy.set("page", String(next))
            setParams(copy)
          }}
        />
      </Panel>
      <p className="mt-3 text-xs text-muted">{t("USD values use the BTS price and 1:1 stablecoins. Other assets show a dash.")}</p>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-ink">{value}</div>
      {hint ? <div className="truncate text-xs text-muted">{hint}</div> : null}
    </div>
  )
}
