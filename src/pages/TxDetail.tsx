import { useParams } from "react-router-dom"
import { TimeAgo } from "../components/Now.tsx"
import {
  AccountLink,
  AmountView,
  CopyButton,
  Crumbs,
  ErrorBox,
  JsonTree,
  KeyValue,
  LoadingBlock,
  OpSummary,
  Panel,
  StatusBadge,
  TypeBadge,
} from "../components/widgets.tsx"
import { fetchDynamic } from "../lib/chain.ts"
import { db } from "../lib/node.ts"
import { formatInt, formatTime, shortHash } from "../lib/format.ts"
import { fetchTransactionOps } from "../lib/history.ts"
import { linkClass } from "../lib/utils.ts"
import { Link } from "react-router-dom"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function TxDetail() {
  const { id = "" } = useParams()
  const trxId = decodeURIComponent(id).replace(/^0x/i, "").toLowerCase()
  const { t } = useI18n()
  useTitle(`${t("Transaction")} ${trxId.slice(0, 10)}`)
  const query = useQuery(async () => {
    const ops = await fetchTransactionOps(trxId)
    if (!ops.length) throw new Error(t("No transaction with that id was found in the operation index."))
    const dgp = await fetchDynamic()
    const first = ops[0]!
    let signed: { signatures?: string[]; expiration?: string; operation_results?: unknown[] } | null = null
    if (!first.virtual) {
      try {
        signed = await db("get_transaction", [first.blockNum, first.trxInBlock])
      } catch {
        signed = null
      }
    }
    return { ops, dgp, signed, first }
  }, [trxId])

  const data = query.data
  const first = data?.first
  const irreversible = Boolean(first && data && first.blockNum <= data.dgp.last_irreversible_block_num)
  const confirmations = first && data ? Math.max(0, data.dgp.head_block_number - first.blockNum) : 0

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Transactions", to: "/txs" }, { label: "Transaction" }]} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">{t("Transaction")}</h1>
        {first ? <StatusBadge irreversible={irreversible} confirming={!irreversible} virtual={first.virtual && !first.trxId} /> : null}
      </div>
      {query.loading ? <LoadingBlock lines={8} /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {data && first ? (
        <>
          <Panel className="mb-4">
            <KeyValue
              rows={[
                {
                  label: "Transaction id",
                  value: (
                    <span className="inline-flex items-center gap-1 break-all font-mono text-xs">
                      {trxId} <CopyButton value={trxId} />
                    </span>
                  ),
                },
                {
                  label: "Block",
                  value: (
                    <Link to={`/block/${first.blockNum}`} className={linkClass}>
                      {formatInt(first.blockNum)}
                    </Link>
                  ),
                },
                { label: "Timestamp", value: <>{formatTime(first.time)} · <TimeAgo time={first.time} /></> },
                { label: "Confirmations", value: formatInt(confirmations) },
                { label: "Position in block", value: first.trxInBlock },
                { label: "Operations", value: data.ops.length },
                { label: "Fee payer", value: <AccountLink id={first.feePayer} /> },
                {
                  label: "Expiration",
                  value: data.signed?.expiration ? formatTime(data.signed.expiration) : "—",
                },
                {
                  label: "Signatures",
                  value: data.signed?.signatures?.length
                    ? data.signed.signatures.map((sig) => (
                        <span key={sig} className="mr-3 inline-flex items-center gap-1 font-mono text-xs">
                          {shortHash(sig, 14, 8)} <CopyButton value={sig} />
                        </span>
                      ))
                    : "—",
                },
              ]}
            />
          </Panel>
          <div className="space-y-4">
            {data.ops.map((op, index) => (
              <Panel
                key={op.key}
                title={
                  <span className="inline-flex items-center gap-2">
                    {t("Operation {n}", { n: index })}
                    <TypeBadge type={op.type} virtual={op.virtual} />
                  </span>
                }
                extra={op.opId ? <Link to={`/op/${op.opId}`} className={linkClass}>{op.opId}</Link> : null}
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
        </>
      ) : null}
    </div>
  )
}
