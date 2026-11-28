import { Link, useSearchParams } from "react-router-dom"
import { FormatTime, TimeAgo } from "../components/Now.tsx"
import { Crumbs, ErrorBox, LoadingBlock, Pager, Panel } from "../components/widgets.tsx"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { formatInt } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import { networkHasEs } from "../lib/network.ts"
import { approvalCount, fetchProposals, PROPOSAL_PAGE_SIZE, type ProposalTab } from "../lib/proposals.ts"
import { linkClass } from "../lib/utils.ts"
import { AccountList, ProposalStatus, ProposalTypes } from "./proposalWidgets.tsx"

const COLUMNS = ["ID", "Proposer", "Operations", "Required approvals", "Approved", "Created", "Expires", "Status"]

export default function Proposals() {
  const { t } = useI18n()
  useTitle("Proposals")
  const [search, setSearch] = useSearchParams()
  const tab: ProposalTab = search.get("tab") === "all" ? "all" : "open"
  const page = Math.max(1, Number(search.get("page") || "1") || 1)
  const hasEs = networkHasEs()
  const query = useQuery(() => (hasEs ? fetchProposals(tab, page) : Promise.resolve(null)), [tab, page, hasEs])
  const rows = query.data?.rows ?? []
  const pages = query.data ? Math.max(1, Math.ceil(query.data.total / PROPOSAL_PAGE_SIZE)) : 1

  function setTab(next: ProposalTab) {
    const params = new URLSearchParams(search)
    params.set("tab", next)
    params.delete("page")
    setSearch(params, { replace: true })
  }

  function setPage(next: number) {
    const params = new URLSearchParams(search)
    params.set("page", String(next))
    setSearch(params)
    window.scrollTo(0, 0)
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Proposals" }]} />
      <h1 className="text-2xl font-semibold">{t("Proposals")}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">
        {t(
          "Proposed transactions waiting for approvals. Data comes from the Elasticsearch proposal index; a proposal disappears from the chain once it is executed or expires.",
        )}
      </p>
      {hasEs ? null : (
        <ErrorBox message={t("This network has no public operation index. Blocks and accounts still load from the node.")} />
      )}
      {hasEs ? (
        <Panel>
          <div className="flex gap-1 overflow-x-auto border-b border-line px-2">
            {(["open", "all"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${tab === key ? "border-link text-link" : "border-transparent text-muted"}`}
              >
                {t(key === "open" ? "In progress" : "All")}
                {key === "open" && query.data?.open != null
                  ? ` (${formatInt(query.data.open)})`
                  : key === "all" && tab === "all" && query.data
                    ? ` (${formatInt(query.data.total)})`
                    : ""}
              </button>
            ))}
          </div>
          {query.loading ? <LoadingBlock /> : null}
          {query.error ? (
            <div className="p-4">
              <ErrorBox message={query.error} onRetry={query.reload} />
            </div>
          ) : null}
          {query.data && !rows.length && !query.loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted">{t("No proposals in this tab.")}</p>
          ) : null}
          {rows.length && !query.loading ? (
            <>
              <p className="bx-swipe">{t("Swipe sideways to see all columns →").replace(/\s*→\s*$/, "")} <span className="inline-block rtl:rotate-180" aria-hidden="true">→</span></p>
              <div className="bx-scroll overflow-x-auto">
                <table className="w-full min-w-[720px] text-start text-sm">
                  <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      {COLUMNS.map((label) => (
                        <th key={label} className="px-4 py-2.5 font-medium">
                          {t(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-row">
                        <td className="px-4 py-3">
                          <Link to={`/proposal/${row.id}`} className={`${linkClass} font-mono text-xs`}>
                            {row.id}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <AccountList ids={row.proposer ? [row.proposer] : []} />
                        </td>
                        <td className="px-4 py-3">
                          <ProposalTypes
                            types={(row.proposed_transaction?.operations_object ?? []).map((op) => op.which ?? -1)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <AccountList
                            ids={[...(row.required_active_approvals ?? []), ...(row.required_owner_approvals ?? [])]}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">{approvalCount(row)}</td>
                        <td className="px-4 py-3 text-xs text-muted">
                          {row.block_time ? <TimeAgo time={row.block_time} /> : "—"}
                          {row.block_number ? (
                            <div>
                              <Link to={`/block/${row.block_number}`} className={linkClass}>
                                #{formatInt(row.block_number)}
                              </Link>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted"><FormatTime time={row.expiration_time} /></td>
                        <td className="px-4 py-3">
                          <ProposalStatus row={row} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          {query.data && query.data.total > PROPOSAL_PAGE_SIZE ? (
            <Pager
              page={page}
              hasPrev={page > 1}
              hasNext={page < pages}
              onPage={setPage}
              totalLabel={t("{n} proposals", {
                n: `${query.data.relation === "gte" ? "≥ " : ""}${formatInt(query.data.total)}`,
              })}
            />
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
