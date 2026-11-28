import { Link, useParams } from "react-router-dom"
import { TimeDetail } from "../components/Now.tsx"
import { AccountLink, AmountView, Crumbs, ErrorBox, JsonTree, KeyValue, LoadingBlock, OpSummary, Panel, StatusBadge, TypeBadge } from "../components/widgets.tsx"
import { fetchDynamic } from "../lib/chain.ts"
import { formatInt } from "../lib/format.ts"
import { fetchOperation } from "../lib/history.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function OpDetail() {
  const { id = "" } = useParams()
  const opId = decodeURIComponent(id)
  const { t } = useI18n()
  useTitle(opId)
  const query = useQuery(async () => {
    const [ops, dgp] = await Promise.all([fetchOperation(opId), fetchDynamic()])
    if (!ops.length) throw new Error(`Operation ${opId} was not found.`)
    return { op: ops[0]!, dgp }
  }, [opId])
  const op = query.data?.op
  const irreversible = Boolean(op && query.data && op.blockNum <= query.data.dgp.last_irreversible_block_num)

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Transactions", to: "/txs?view=ops" }, { label: opId }]} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t("Operation")}</h1>
        {op ? <TypeBadge type={op.type} virtual={op.virtual} /> : null}
        {op ? <StatusBadge irreversible={irreversible} confirming={!irreversible} virtual={op.virtual} /> : null}
      </div>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {op ? (
        <Panel>
          <KeyValue
            rows={[
              { label: "Operation id", value: <span className="font-mono text-xs">{op.opId || "—"}</span> },
              { label: "Summary", value: <OpSummary op={op} /> },
              { label: "Fee payer", value: <AccountLink id={op.feePayer} /> },
              { label: "Fee", value: <AmountView value={op.fee} /> },
              {
                label: "Block",
                value: <Link className={linkClass} to={`/block/${op.blockNum}`}>{formatInt(op.blockNum)}</Link>,
              },
              { label: "Time", value: <TimeDetail time={op.time} /> },
              {
                label: "Transaction",
                value: op.trxId ? <Link className={`${linkClass} font-mono text-xs`} to={`/tx/${op.trxId}`}>{op.trxId}</Link> : "Virtual operation",
              },
            ]}
          />
          <div className="border-t border-line px-4 py-4 font-mono text-xs">
            <JsonTree value={op.body} />
          </div>
        </Panel>
      ) : null}
    </div>
  )
}
