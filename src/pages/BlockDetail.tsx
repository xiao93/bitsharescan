import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { TimeDetail } from "../components/Now.tsx"
import { BetaBadge, BlockActions } from "../components/BlockActions.tsx"
import {
  AccountLink,
  AmountView,
  CopyButton,
  Crumbs,
  ErrorBox,
  KeyValue,
  LoadingBlock,
  OpAction,
  OpTable,
  Panel,
  StatusBadge,
  TxLink,
  TypeBadge,
} from "../components/widgets.tsx"
import { blockFeeText, fetchBlock, fetchDynamic, signedOpsForBlock } from "../lib/chain.ts"
import { formatInt, formatTime, shortHash } from "../lib/format.ts"
import { fetchBlockOps } from "../lib/history.ts"
import { cn, linkClass } from "../lib/utils.ts"
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
  const navigate = useNavigate()
  const hasPrev = Boolean(block && block.num > 1)
  const hasNext = Boolean(block && dgp && block.num < dgp.head_block_number)

  // Left / Right arrow keys step through blocks, like the buttons next to the height.
  useEffect(() => {
    if (!block) return
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (event.key === "ArrowLeft" && hasPrev) navigate(`/block/${block.num - 1}`)
      else if (event.key === "ArrowRight" && hasNext) navigate(`/block/${block.num + 1}`)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [block, hasPrev, hasNext, navigate])

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
                {
                  label: "Block height",
                  value: (
                    <span className="inline-flex items-center gap-2">
                      <span>{formatInt(block.num)}</span>
                      <BlockStep to={hasPrev ? `/block/${block.num - 1}` : undefined} label={t("Previous block")} disabledLabel={t("Genesis")} dir="prev" />
                      <BlockStep to={hasNext ? `/block/${block.num + 1}` : undefined} label={t("Next block")} disabledLabel={t("This is the latest block")} dir="next" />
                    </span>
                  ),
                },
                { label: "Timestamp", value: <TimeDetail time={block.time} /> },
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
                {
                  label: "Transaction Actions",
                  hint: "Visual overview of operations in this block",
                  badge: <BetaBadge />,
                  valueClassName: "break-normal",
                  value: <BlockActions transactions={data.grouped.transactions} virtuals={data.grouped.virtuals} />,
                },
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
                            <p className="mt-1 text-sm"><OpAction op={op} /></p>
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

function BlockStep({ to, label, disabledLabel, dir }: { to?: string; label: string; disabledLabel: string; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  const base = "inline-flex h-6 w-6 items-center justify-center rounded border border-line"
  if (!to) {
    return (
      <span className={cn(base, "cursor-not-allowed text-muted opacity-40")} title={disabledLabel} aria-label={disabledLabel} aria-disabled="true">
        <Icon className="h-4 w-4 rtl:rotate-180" />
      </span>
    )
  }
  return (
    <Link to={to} className={cn(base, "bg-card text-ink hover:border-link hover:text-link")} title={label} aria-label={label}>
      <Icon className="h-4 w-4 rtl:rotate-180" />
    </Link>
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
