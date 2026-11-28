import { Link, useParams } from "react-router-dom"
import { AccountLink, AmountView, Crumbs, ErrorBox, JsonTree, KeyValue, LoadingBlock, OpSummary, Panel, TypeBadge } from "../components/widgets.tsx"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { FormatTime } from "../components/Now.tsx"
import { formatInt } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import { fetchProposal, ProposalNotFound } from "../lib/proposals.ts"
import { linkClass } from "../lib/utils.ts"
import { AccountList, ProposalStatus } from "./proposalWidgets.tsx"

export default function ProposalDetail() {
  const { id: raw = "" } = useParams()
  const id = decodeURIComponent(raw).trim()
  const { t } = useI18n()
  useTitle(`${t("Proposal")} ${id}`)
  const query = useQuery(async () => {
    try {
      return await fetchProposal(id)
    } catch (error) {
      if (error instanceof ProposalNotFound) throw new Error(t("Proposal {id} was not found.", { id }))
      throw error
    }
  }, [id])
  const data = query.data
  const obj = data?.obj

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Proposals", to: "/proposals" }, { label: id }]} />
      <h1 className="mb-4 text-2xl font-semibold">
        {t("Proposal")} <span className="font-mono text-lg text-muted">{id}</span>
      </h1>
      {query.loading ? <LoadingBlock lines={8} /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {obj && data ? (
        <div className="space-y-4">
          <Panel title="Overview">
            <KeyValue
              rows={[
                { label: "ID", value: obj.id ?? id },
                { label: "Status", value: <ProposalStatus row={obj} live={data.live} /> },
                { label: "On chain now", value: t(data.live ? "Yes" : "No") },
                { label: "Proposer", value: <AccountLink id={obj.proposer} /> },
                {
                  label: "Created in block",
                  value: obj.block_number ? (
                    <span>
                      <Link to={`/block/${obj.block_number}`} className={linkClass}>
                        #{formatInt(obj.block_number)}
                      </Link>
                      {obj.block_time ? <> · <FormatTime time={obj.block_time} /></> : ""}
                    </span>
                  ) : (
                    "—"
                  ),
                },
                { label: "Expires", value: <FormatTime time={obj.expiration_time} /> },
                { label: "Review period", value: obj.review_period_time ? <FormatTime time={obj.review_period_time} /> : "—" },
                { label: "Required active approvals", value: <AccountList ids={obj.required_active_approvals} /> },
                { label: "Approved (active)", value: <AccountList ids={obj.available_active_approvals} /> },
                { label: "Required owner approvals", value: <AccountList ids={obj.required_owner_approvals} /> },
                { label: "Approved (owner)", value: <AccountList ids={obj.available_owner_approvals} /> },
                {
                  label: "Key approvals",
                  value: obj.available_key_approvals?.length ? (
                    <div className="font-mono text-xs">{obj.available_key_approvals.join(", ")}</div>
                  ) : (
                    "—"
                  ),
                },
                ...(obj.fail_reason ? [{ label: "Fail reason", value: obj.fail_reason }] : []),
              ]}
            />
          </Panel>
          <h2 className="text-sm font-semibold text-ink">{t("Operations ({n})", { n: data.ops.length })}</h2>
          {data.ops.map((op, index) => (
            <Panel
              key={op.key}
              title={
                <span className="inline-flex items-center gap-2">
                  {t("Operation {n}", { n: index })}
                  <TypeBadge type={op.type} virtual={false} />
                </span>
              }
            >
              <KeyValue
                rows={[
                  { label: "Summary", value: <OpSummary op={op} /> },
                  { label: "Fee payer", value: <AccountLink id={op.feePayer} /> },
                  { label: "Fee", value: <AmountView value={op.fee} /> },
                ]}
              />
              <details className="border-t border-line px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium text-link">{t("Decoded operation")}</summary>
                <div className="mt-3 font-mono text-xs">
                  <JsonTree value={op.body} />
                </div>
              </details>
            </Panel>
          ))}
        </div>
      ) : null}
    </div>
  )
}
