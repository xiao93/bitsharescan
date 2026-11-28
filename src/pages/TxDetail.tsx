import { useParams } from "react-router-dom"
import { TimeDetail } from "../components/Now.tsx"
import {
  AccountLink,
  AmountView,
  CopyButton,
  Crumbs,
  ErrorBox,
  JsonTree,
  KeyValue,
  LoadingBlock,
  OpAction,
  OpSummary,
  Panel,
  StatusBadge,
  TypeBadge,
} from "../components/widgets.tsx"
import { blockFeeText, feeTotalsForOps, fetchDynamic } from "../lib/chain.ts"
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
    const fees = await feeTotalsForOps(ops)
    return { ops, dgp, signed, first, fees }
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
                  hint: "The unique hash that identifies this transaction on the BitShares blockchain.",
                  value: (
                    <span className="inline-flex items-center gap-1 break-all font-mono text-xs">
                      {trxId} <CopyButton value={trxId} />
                    </span>
                  ),
                },
                {
                  label: "Block",
                  hint: "The block that includes this transaction. Click to open the block.",
                  value: (
                    <Link to={`/block/${first.blockNum}`} className={linkClass}>
                      {formatInt(first.blockNum)}
                    </Link>
                  ),
                },
                { label: "Timestamp", hint: "The date and time when the block containing this transaction was produced.", value: <TimeDetail time={first.time} /> },
                { label: "Confirmations", hint: "How many blocks have been produced after this transaction\u2019s block. More confirmations make it harder to reverse; once past the last irreversible block it is final.", value: formatInt(confirmations) },
                { label: "Position in block", hint: "The index of this transaction within its block (the first transaction is 0).", value: first.trxInBlock },
                { label: "Operations", hint: "The number of operations bundled in this transaction. A BitShares transaction can carry several operations that all succeed or fail together.", value: data.ops.length },
                {
                  label: "Total fees",
                  hint: "Sum of the fees of every operation in the transaction. An operation paid in another asset counts the standard BTS fee for its type (marked ≈).",
                  valueClassName: "break-normal",
                  value: (
                    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                      <span>{blockFeeText(data.fees)}</span>
                      {data.fees.paid.some((fee) => fee.asset_id !== "1.3.0") ? (
                        <span className="text-muted">
                          ({data.fees.paid.map((fee, index) => (
                            <span key={fee.asset_id}>
                              {index ? ", " : null}
                              <AmountView value={fee} />
                            </span>
                          ))})
                        </span>
                      ) : null}
                    </span>
                  ),
                },
                { label: "Fee payer", hint: "The account that paid the fee for this transaction.", value: <AccountLink id={first.feePayer} /> },
                {
                  label: "Expiration",
                  hint: "The time after which this transaction is no longer valid if it has not been included in a block.",
                  value: data.signed?.expiration ? formatTime(data.signed.expiration) : "—",
                },
                {
                  label: "Signatures",
                  hint: "The cryptographic signatures that authorize this transaction under the signing accounts\u2019 keys.",
                  value: data.signed?.signatures?.length
                    ? data.signed.signatures.map((sig) => (
                        <span key={sig} className="me-3 inline-flex items-center gap-1 font-mono text-xs">
                          {shortHash(sig, 14, 8)} <CopyButton value={sig} />
                        </span>
                      ))
                    : "—",
                },
              ]}
            />
          </Panel>
          <Panel title={t("Transaction Action")} className="mb-4">
            <ul className="divide-y divide-line">
              {data.ops.map((op, index) => (
                <li key={op.key} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <TypeBadge type={op.type} virtual={op.virtual} />
                  <span className="min-w-0 flex-1 break-words"><OpAction op={op} /></span>
                  {data.ops.length > 1 ? <span className="text-xs text-muted">#{index}</span> : null}
                </li>
              ))}
            </ul>
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
                    { label: "Summary", hint: "A human-readable summary of what this operation does.", value: <OpSummary op={op} /> },
                    { label: "Fee payer", hint: "The account charged the fee for this operation.", value: <AccountLink id={op.feePayer} /> },
                    { label: "Fee", hint: "The fee charged for this operation.", value: <AmountView value={op.fee} /> },
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
