import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchAccountsOverview, type AccountRank } from "../lib/activity.ts"
import { accountLabel } from "../lib/directory.ts"
import { compactNumber, formatInt, formatRaw } from "../lib/format.ts"
import { networkNotice } from "../lib/charts.ts"
import { coreSymbol, networkHasEs } from "../lib/network.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const TOP_OPTIONS = [10, 25, 50]

export default function Accounts() {
  const { t } = useI18n()
  useTitle("Accounts")
  const [params, setParams] = useSearchParams()
  const topN = TOP_OPTIONS.includes(Number(params.get("n"))) ? Number(params.get("n")) : 25
  const [search, setSearch] = useState("")
  const query = useQuery(() => fetchAccountsOverview(topN), [topN])
  const needle = search.trim().toLowerCase()
  const data = query.data
  const missingIndex = !networkHasEs()

  function matchRank(rows: AccountRank[] | undefined) {
    if (!rows) return []
    if (!needle) return rows
    return rows.filter((row) => row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle))
  }

  const transfers = useMemo(() => matchRank(data?.transfers), [data?.transfers, needle])
  const fills = useMemo(() => matchRank(data?.fills), [data?.fills, needle])
  const pools = useMemo(() => matchRank(data?.pools), [data?.pools, needle])
  const holders = useMemo(() => {
    const rows = data?.holders ?? []
    if (!needle) return rows
    return rows.filter((row) => accountLabel(row.owner).toLowerCase().includes(needle) || row.owner.toLowerCase().includes(needle))
  }, [data?.holders, needle])

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Charts", to: "/charts" }, { label: "Accounts" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Accounts")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {t("Account activity over the last 24 hours, plus current account totals and the largest BTS holders.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <select
              value={String(topN)}
              aria-label={t("Top {n}", { n: topN })}
              onChange={(event) => {
                const copy = new URLSearchParams(params)
                copy.set("n", event.target.value)
                setParams(copy)
              }}
              className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink"
            >
              {TOP_OPTIONS.map((value) => <option key={value} value={String(value)}>{t("Top {n}", { n: value })}</option>)}
            </select>
          </label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search accounts")}
            aria-label={t("Search accounts")}
            className="h-9 w-44 rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none placeholder:text-muted focus:border-link sm:w-56"
          />
        </div>
      </div>
      {missingIndex ? <div className="mt-4"><ErrorBox message={t(networkNotice)} /></div> : null}
      {query.error && networkHasEs() ? <div className="mt-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Total accounts")} value={data ? formatInt(data.totalAccounts) : "—"} />
        <Stat label={t("Active accounts (24h)")} value={data && !missingIndex ? formatInt(data.active24h) : "—"} hint={t("Accounts that appear in at least one operation")} />
        <Stat label={t("New accounts (24h)")} value={data && !missingIndex ? formatInt(data.new24h) : "—"} hint={t("Account create operations")} />
        <Stat label={t("Lifetime members")} value={data?.lifetimeMembers != null ? formatInt(data.lifetimeMembers) : "—"} />
      </div>
      {query.loading && !data ? <div className="mt-4"><LoadingBlock lines={8} /></div> : null}
      {data ? (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <RankTable title={t("24h Transfers")} hint={t("{n} transfers", { n: formatInt(data.transferOps) })} rows={transfers} countLabel={t("Transfer count")} empty={t("No matching accounts.")} />
            <RankTable title={t("24h Order Book Fills")} hint={t("{n} fills", { n: formatInt(data.fillOps) })} rows={fills} countLabel={t("Fill count")} empty={t("No matching accounts.")} />
            <RankTable title={t("24h Pool Exchanges")} hint={t("{n} exchanges", { n: formatInt(data.poolOps) })} rows={pools} countLabel={t("Exchange count")} empty={t("No matching accounts.")} />
          </div>
          <Panel className="mt-4" title={t("Top BTS Holders")} extra={<span className="text-xs text-muted">{data.supply ? `${compactNumber(data.supply)} ${coreSymbol()}` : null}</span>}>
            {holders.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-start text-sm">
                  <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">#</th>
                      <th className="px-4 py-2.5 font-medium">{t("Account")}</th>
                      <th className="px-4 py-2.5 text-end font-medium">{t("Balance")}</th>
                      <th className="px-4 py-2.5 text-end font-medium">{t("Share of supply")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {holders.map((row, index) => (
                      <tr key={row.owner} className="hover:bg-row">
                        <td className="px-4 py-3 font-mono tabular-nums text-muted">{index + 1}</td>
                        <td className="px-4 py-3"><AccountLink id={row.owner} /></td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums">{formatRaw(row.balance, 5)} {coreSymbol()}</td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums text-muted">{`${(row.share * 100).toFixed(2)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 py-8 text-center text-sm text-muted">{t("No matching accounts.")}</p>}
          </Panel>
        </>
      ) : null}
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

function RankTable({ title, hint, rows, countLabel, empty }: { title: string; hint?: string; rows: AccountRank[]; countLabel: string; empty: string }) {
  const { t } = useI18n()
  const [sort, setSort] = useState<"name" | "count">("count")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const ordered = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const cmp = sort === "name" ? a.name.localeCompare(b.name) : a.count - b.count
      return dir === "asc" ? cmp : -cmp
    })
    return copy
  }, [rows, sort, dir])

  function toggle(next: "name" | "count") {
    if (sort === next) setDir((value) => (value === "asc" ? "desc" : "asc"))
    else {
      setSort(next)
      setDir(next === "name" ? "asc" : "desc")
    }
  }

  return (
    <Panel title={title} extra={hint ? <span className="text-xs text-muted">{hint}</span> : null}>
      {ordered.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">
                  <button type="button" className="hover:text-link" onClick={() => toggle("name")}>{t("Account")}</button>
                </th>
                <th className="px-4 py-2.5 text-end font-medium">
                  <button type="button" className="hover:text-link" onClick={() => toggle("count")}>{countLabel}</button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ordered.map((row, index) => (
                <tr key={row.id} className="hover:bg-row">
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">{index + 1}</td>
                  <td className="px-4 py-3"><AccountLink id={row.id} /></td>
                  <td className="px-4 py-3 text-end font-mono tabular-nums">{formatInt(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="px-4 py-8 text-center text-sm text-muted">{empty}</p>}
    </Panel>
  )
}
