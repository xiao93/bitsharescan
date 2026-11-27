import { useState } from "react"
import { Link } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchWitnesses } from "../lib/chain.ts"
import { formatInt, formatStake, shortHash } from "../lib/format.ts"
import { coreSymbol } from "../lib/network.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function Witnesses() {
  const { t } = useI18n()
  useTitle("Witnesses")
  const query = useQuery(() => fetchWitnesses(), [])
  const [activeOnly, setActiveOnly] = useState(true)
  const rows = (query.data?.rows ?? []).filter((row) => (activeOnly ? row.active : true))
  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Witnesses" }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Witnesses")}</h1>
          <p className="mt-1 text-sm text-muted">
            {query.data ? t("Block producers. {active} active of {total} registered.", { active: query.data.activeCount, total: formatInt(query.data.total) }) : t("Loading the witness set.")}
          </p>
        </div>
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          <button type="button" className={`rounded-md px-3 py-1.5 ${activeOnly ? "bg-link text-white" : "text-muted"}`} onClick={() => setActiveOnly(true)}>{t("Serving")}</button>
          <button type="button" className={`rounded-md px-3 py-1.5 ${!activeOnly ? "bg-link text-white" : "text-muted"}`} onClick={() => setActiveOnly(false)}>{t("All")}</button>
        </div>
      </div>
      <Panel>
        {query.loading ? <LoadingBlock /> : null}
        {query.error ? <div className="p-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-start text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">{t("Witness")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Vote tally")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Missed")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Last block")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Signing key")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-row">
                  <td className="px-4 py-3 text-muted">{index + 1}</td>
                  <td className="px-4 py-3">
                    <AccountLink id={row.account} />
                    <div className="text-xs text-muted">
                      <Link to={`/object/${row.id}`} className={linkClass}>{row.id}</Link>
                      {row.active ? <span className="ms-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-success">{t("Serving")}</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{formatStake(row.votes)} {coreSymbol()}</td>
                  <td className="px-4 py-3">{formatInt(row.missed)}</td>
                  <td className="px-4 py-3">
                    {row.lastBlock ? <Link className={linkClass} to={`/block/${row.lastBlock}`}>{formatInt(row.lastBlock)}</Link> : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs" title={row.signingKey}>{shortHash(row.signingKey, 8, 6)}</span>
                    {row.url ? <a className="ms-2 text-xs text-link" href={row.url} target="_blank" rel="noreferrer">url</a> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
