import { Link, useParams } from "react-router-dom"
import { TimeAgo } from "../components/Now.tsx"
import {
  AccountLink,
  AmountView,
  CopyButton,
  Crumbs,
  ErrorBox,
  KeyValue,
  LoadingBlock,
  OpSummary,
  OpTable,
  Panel,
  StatusBadge,
  TxLink,
  TypeBadge,
} from "../components/widgets.tsx"
import { blockFeeText, fetchBlock, fetchDynamic, signedOpsForBlock } from "../lib/chain.ts"
import { formatInt, formatTime, shortHash } from "../lib/format.ts"
import { fetchBlockOps } from "../lib/history.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function BlockDetail() {
  const { num = "" } = useParams()
  const blockNum = Number(num)
  const { t } = useI18n()
  useTitle(Number.isFinite(blockNum) ? t("Block {n}", { n: formatInt(blockNum) }) : t("Block"))
  const query = useQuery(async () => {
    if (!Number.isFinite(blockNum) || blockNum <= 0) throw new Error(t("That block number is not valid."))
    const [block, dgp] = await Promise.all([fetchBlock(blockNum), fetchDynamic()])
    if (!block) throw new Error(t("Block {n} was not found.", { n: formatInt(blockNum) }))
    const esOps = await fetchBlockOps(blockNum, block.time).catch(() => [])
    const grouped = await signedOpsForBlock(block, esOps)
    return { block, dgp, esOps, grouped }
  }, [blockNum])

  const data = query.data
  const block = data?.block
  const dgp = data?.dgp
  const confirmations = block && dgp ? Math.max(0, dgp.head_block_number - block.num) : 0
  const irreversible = Boolean(block && dgp && block.num <= dgp.last_irreversible_block_num)

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Blocks", to: "/blocks" }, { label: block ? `#${formatInt(block.num)}` : "Block" }]} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">{block ? `${t("Block")} #${formatInt(block.num)}` : t("Block")}</h1>
        {block ? <StatusBadge irreversible={irreversible} confirming={!irreversible} /> : null}
      </div>
      {query.loading ? <LoadingBlock lines={8} /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {block && dgp ? (
        <>
          <Panel className="mb-4">
            <KeyValue
              rows={[
                { label: "Block height", value: formatInt(block.num) },
                { label: "Timestamp", value: <><TimeAgo time={block.time} /> <span className="text-muted">· {formatTime(block.time)}</span></> },
                { label: "Confirmations", value: `${formatInt(confirmations)} · ${t("Head block")} ${formatInt(dgp.head_block_number)}` },
                {
                  label: "Witness",
                  value: (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span>{block.witnessName}</span>
                      <Link to={`/object/${block.witness}`} className={`${linkClass} font-mono text-xs`}>{block.witness}</Link>
                    </span>
                  ),
                },
                {
                  label: "Previous block",
                  value: block.num > 1 ? <Link to={`/block/${block.num - 1}`} className={linkClass}>#{formatInt(block.num - 1)}</Link> : t("Genesis"),
                },
                { label: "Previous id", value: <MonoCopy value={block.previous} /> },
                { label: "Merkle root", value: <MonoCopy value={block.merkle} /> },
                { label: "Witness signature", value: <MonoCopy value={block.signature} /> },
                { label: "Transactions", value: formatInt(block.txCount) },
                { label: "Total fees", value: blockFeeText(block), hint: t("Sum of the fees of every operation in the block. An operation paid in another asset counts the standard BTS fee for its type (marked ≈).") },
                { label: "Indexed operations", value: formatInt(data.esOps.length) },
              ]}
            />
          </Panel>
          <Panel title={t("Transactions")} className="mb-4">
            {data.grouped.transactions.length ? (
              <div className="divide-y divide-line">
                {data.grouped.transactions.map((tx) => (
                  <article key={tx.index} className="px-4 py-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted">#{tx.index}</span>
                        <TxLink id={tx.trxId} />
                      </div>
                      <span className="text-xs text-muted">{t("Expires {time}", { time: formatTime(tx.expiration) })}</span>
                    </div>
                    <ul className="space-y-2">
                      {tx.ops.map((op) => (
                        <li key={op.key} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-canvas px-3 py-2">
                          <div className="min-w-0">
                            <TypeBadge type={op.type} />
                            <p className="mt-1 text-sm"><OpSummary op={op} /></p>
                            <p className="text-xs text-muted">
                              {t("From")} <AccountLink id={op.feePayer} />
                            </p>
                          </div>
                          <div className="text-sm"><AmountView value={op.fee} /></div>
                        </li>
                      ))}
                    </ul>
                    {tx.signatures.length ? (
                      <p className="mt-2 truncate font-mono text-xs text-muted" title={tx.signatures.join("\n")}>
                        {t("Signature")} {shortHash(tx.signatures[0] ?? "", 16, 10)}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted">{t("This block has no signed transactions.")}</p>
            )}
          </Panel>
          {data.grouped.virtuals.length ? (
            <Panel title={t("Virtual operations")}>
              <OpTable rows={data.grouped.virtuals} />
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function MonoCopy({ value }: { value: string }) {
  if (!value) return <>—</>
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs">
      <span title={value}>{shortHash(value, 18, 10)}</span>
      <CopyButton value={value} />
    </span>
  )
}
