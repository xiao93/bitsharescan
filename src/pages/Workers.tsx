import { Link, useSearchParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchWorkers, type WorkerRow } from "../lib/chain.ts"
import { asBig, compactUsd, formatDecimal, formatRaw, formatStake, formatTime, toFloat } from "../lib/format.ts"
import { coreSymbol } from "../lib/network.ts"
import { fetchBtsUsd } from "../lib/usd.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

type Tab = "active" | "proposed" | "expired"

export default function Workers() {
  const { t } = useI18n()
  useTitle("Workers")
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get("tab") === "proposed" || params.get("tab") === "expired" ? params.get("tab") as Tab : "active"
  const query = useQuery(() => fetchWorkers(), [])
  const price = useQuery(() => fetchBtsUsd().catch(() => ({ price: null, source: "", anchor: null })), [])
  const btsUsd = price.data?.price ?? null
  const core = coreSymbol()
  const all = query.data?.rows ?? []
  const rows = all.filter((row) => inTab(row, tab))
  const counts = {
    active: all.filter((row) => inTab(row, "active")).length,
    proposed: all.filter((row) => inTab(row, "proposed")).length,
    expired: all.filter((row) => inTab(row, "expired")).length,
  }

  function setTab(next: Tab) {
    const copy = new URLSearchParams(params)
    copy.set("tab", next)
    setParams(copy, { replace: true })
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Workers" }]} />
      <h1 className="text-2xl font-semibold">{t("Workers")}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">{t("Active workers are the vote-ranked proposals currently being paid. Proposed means not started yet, or active but below the pay threshold.")}</p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={t("Daily budget")} value={query.data ? money(query.data.dailyBudget, btsUsd, core) : "—"} hint={query.data ? t("This interval {amount}", { amount: `${formatRaw(query.data.intervalBudget, 5)} ${core}` }) : ""} />
        <Card label={t("Active workers")} value={query.data ? String(query.data.activeCount) : "—"} hint={t("Receiving pay this interval")} />
        <Card label={t("Total daily pay")} value={query.data ? money(query.data.totalDailyPay, btsUsd, core) : "—"} hint={t("Pay actually allocated")} />
        <Card label={t("Pay threshold")} value={query.data?.threshold == null ? "—" : `${formatStake(query.data.threshold)} ${core}`} hint={t("Votes of the lowest paid worker")} />
      </div>
      <Panel>
        <div className="flex gap-1 overflow-x-auto border-b border-line px-2">
          {(["active", "proposed", "expired"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${tab === item ? "border-link text-link" : "border-transparent text-muted"}`}>
              {tabLabel(item, t)}{query.data ? ` (${counts[item]})` : ""}
            </button>
          ))}
        </div>
        {query.loading ? <LoadingBlock /> : null}
        {query.error ? <div className="p-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
        {query.data && !rows.length ? <p className="px-4 py-8 text-center text-sm text-muted">{t("No workers in this tab.")}</p> : null}
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("ID")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Name")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Account")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Daily pay")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Period")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("Votes for")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">{t("Votes against")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Status")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Type")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Vesting balance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => <WorkerLine key={row.id} row={row} btsUsd={btsUsd} core={core} />)}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}

function inTab(row: WorkerRow, tab: Tab): boolean {
  if (tab === "expired") return row.state === "expired"
  if (tab === "active") return row.state === "active" && row.funding !== "unfunded"
  return row.state === "pending" || (row.state === "active" && row.funding === "unfunded")
}

function WorkerLine({ row, btsUsd, core }: { row: WorkerRow; btsUsd: number | null; core: string }) {
  const { t } = useI18n()
  const href = safeUrl(row.url)
  const pay = toFloat(row.dailyPay, 5)
  const usd = pay != null && btsUsd != null ? pay * btsUsd : null
  return (
    <tr className="hover:bg-row">
      <td className="px-4 py-3"><Link to={`/worker/${row.id}`} className={`${linkClass} font-mono text-xs`}>{row.id}</Link></td>
      <td className="px-4 py-3">
        <Link to={`/worker/${row.id}`} className="font-medium text-ink hover:text-link">{row.title || row.name}</Link>
        {href ? <a className="mt-0.5 block max-w-[16rem] truncate text-xs text-link" href={href} target="_blank" rel="noreferrer">{row.url}</a> : null}
      </td>
      <td className="px-4 py-3"><AccountLink id={row.account} /></td>
      <td className="px-4 py-3">
        <div className="font-mono tabular-nums">{formatRaw(row.dailyPay, 5)} {core}</div>
        <div className="text-xs text-muted">{usd == null ? "—" : usdText(usd)}</div>
      </td>
      <td className="px-4 py-3 text-xs text-muted">{formatTime(row.begin)}<br />{formatTime(row.end)}</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatStake(row.votesFor)} {core}</td>
      <td className="px-4 py-3 text-right font-mono tabular-nums">{asBig(row.votesAgainst) === 0n ? "—" : `${formatStake(row.votesAgainst)} ${core}`}</td>
      <td className="px-4 py-3"><Status row={row} /></td>
      <td className="px-4 py-3">{t(row.type)}</td>
      <td className="px-4 py-3">{row.vestingId ? <Link to={`/object/${row.vestingId}`} className={`${linkClass} font-mono text-xs`}>{row.vestingId}</Link> : "—"}</td>
    </tr>
  )
}

function Status({ row }: { row: WorkerRow }) {
  const { t } = useI18n()
  if (row.state === "expired") return <span className="text-xs text-muted">{t("Expired")}</span>
  if (row.state === "pending") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">{t("Not started")}</span>
  if (row.funding === "funded") return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-success">{t("Funded")}</span>
  if (row.funding === "partial") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{t("Partially funded")}</span>
  return <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{t("Not funded")}</span>
}

function money(raw: bigint, btsUsd: number | null, core: string) {
  const amount = toFloat(raw, 5) ?? 0
  const usd = btsUsd != null ? usdText(amount * btsUsd) : ""
  return `${formatRaw(raw, 5)} ${core}${usd ? ` · ${usd}` : ""}`
}

function usdText(value: number): string {
  if (Math.abs(value) < 1) return `$${formatDecimal(value, 6)}`
  return compactUsd(value)
}

function tabLabel(item: Tab, t: (text: string) => string): string {
  if (item === "active") return t("Active now")
  return t(item === "proposed" ? "Proposed" : "Expired")
}

function safeUrl(url: string): string | null {
  const text = url.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(text)) return `https://${text}`
  return null
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="truncate text-lg font-semibold">{value}</div>
      {hint ? <div className="truncate text-xs text-muted">{hint}</div> : null}
    </div>
  )
}
