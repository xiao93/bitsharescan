import { useState } from "react"
import { Link } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchCommittee } from "../lib/chain.ts"
import { formatInt, formatStake } from "../lib/format.ts"
import { coreSymbol } from "../lib/network.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function Committee() {
  const { t } = useI18n()
  useTitle("Committee")
  const query = useQuery(() => fetchCommittee(), [])
  const [activeOnly, setActiveOnly] = useState(true)
  const rows = (query.data?.rows ?? []).filter((row) => (activeOnly ? row.active : true))
  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Committee" }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Committee")}</h1>
          <p className="mt-1 text-sm text-muted">
            {query.data ? t("{active} active members of {total}.", { active: query.data.activeCount, total: formatInt(query.data.total) }) : t("Governance committee accounts.")}
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
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">{t("Member")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Vote tally")}</th>
                <th className="px-4 py-2.5 font-medium">{t("URL")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, index) => (
                <tr key={row.id} className="hover:bg-row">
                  <td className="px-4 py-3 text-muted">{index + 1}</td>
                  <td className="px-4 py-3">
                    <AccountLink id={row.account} />
                    <div className="text-xs">
                      <Link to={`/object/${row.id}`} className={linkClass}>{row.id}</Link>
                      {row.active ? <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-success">{t("Serving")}</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">{formatStake(row.votes)} {coreSymbol()}</td>
                  <td className="px-4 py-3">{row.url ? <a className="text-link" href={row.url} target="_blank" rel="noreferrer">{row.url.replace(/^https?:\/\//, "")}</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
