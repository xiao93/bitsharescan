import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import {
  ACTION_CATEGORIES,
  ACTION_CATEGORY_LABEL,
  actionSummaryForBlock,
  formatShare,
  integerPercents,
  type ActionCategory,
  type ActionCell,
} from "../lib/actionCategory.ts"
import { formatInt } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import type { OpView } from "../lib/ops.ts"
import { cn } from "../lib/utils.ts"
import { HoverLabel } from "./Now.tsx"
import { HelpTip } from "./widgets.tsx"

export function BlockActions({
  transactions,
}: {
  transactions: Array<{ trxId: string; index: number; ops: OpView[] }>
}) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<ActionCategory | null>(null)
  const summary = useMemo(() => actionSummaryForBlock(transactions), [transactions])
  const { cells, txCounts, opCounts, txTotal, opTotal } = summary

  if (!txTotal && !opTotal) return <span className="text-muted">—</span>

  const present = ACTION_CATEGORIES.filter((id) => (opCounts.get(id) ?? 0) > 0 || (txCounts.get(id) ?? 0) > 0)
  const opPercents = integerPercents(
    present.map((id) => opCounts.get(id) ?? 0),
    opTotal,
  )

  return (
    <div className="break-normal" data-action-summary="" data-tx-total={txTotal} data-op-total={opTotal}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink">
        <span data-action-header="">
          {t("{n} transactions · {m} operations", { n: formatInt(txTotal), m: formatInt(opTotal) })}
        </span>
        <HelpTip text="A transaction can contain multiple operation types." />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-5 text-ink">
        {present.map((id) => {
          const txCount = txCounts.get(id) ?? 0
          const opCount = opCounts.get(id) ?? 0
          const percent = formatShare(txCount, txTotal)
          const pressed = filter === id
          const tip = t("{count} operations", { count: formatInt(opCount) })
          return (
            <HoverLabel key={id} text={tip}>
              <button
                type="button"
                role="button"
                aria-pressed={pressed}
                aria-label={`${t(ACTION_CATEGORY_LABEL[id])} (${txCount}, ${percent}%)`}
                data-action-legend={id}
                data-tx-count={txCount}
                data-op-count={opCount}
                data-tx-percent={percent}
                onClick={() => setFilter((cur) => (cur === id ? null : id))}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm text-start hover:text-link",
                  pressed && "font-medium text-link",
                  filter && !pressed && "opacity-45",
                )}
              >
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: `var(--act-${id})` }} aria-hidden="true" />
                {t("{category} ({count} txs, {percent}%)", {
                  category: t(ACTION_CATEGORY_LABEL[id]),
                  count: formatInt(txCount),
                  percent,
                })}
              </button>
            </HoverLabel>
          )
        })}
      </div>
      <div className="mt-2">
        <div className="mb-1 text-[11px] text-muted">{t("Operation share")}</div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-canvas">
          {present.map((id, index) => {
            const opCount = opCounts.get(id) ?? 0
            const percent = opPercents[index] ?? 0
            const tip = t("{category}: {count} ops ({percent}%)", {
              category: t(ACTION_CATEGORY_LABEL[id]),
              count: formatInt(opCount),
              percent,
            })
            return (
              <HoverLabel
                key={id}
                text={tip}
                className="min-w-px"
                style={{ width: `${opTotal ? (opCount / opTotal) * 100 : 0}%` }}
              >
                <span
                  className="block h-1.5 w-full"
                  data-action-bar={id}
                  data-op-count={opCount}
                  data-op-percent={percent}
                  style={{ background: `var(--act-${id})` }}
                  aria-label={tip}
                />
              </HoverLabel>
            )
          })}
        </div>
      </div>
      {cells.length ? (
        <div className="mt-2 max-h-40 overflow-auto">
          <div className="flex flex-wrap gap-[3px]">
            {cells.map((cell) => (
              <ActionSquare key={cell.key} cell={cell} filter={filter} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ActionSquare({ cell, filter }: { cell: ActionCell; filter: ActionCategory | null }) {
  const { t } = useI18n()
  const faded = Boolean(filter) && !cell.categories.includes(filter!)
  const parts = cell.categories.map((id) => `${t(ACTION_CATEGORY_LABEL[id])} ×${cell.opCounts[id] ?? 0}`)
  const tip = cell.trxId ? `${cell.trxId}\n${parts.join(", ")}` : parts.join(", ")
  const fill = squareFill(cell.categories)
  const square = (
    <span
      className={cn("block h-4 w-4 rounded-[3px] transition-opacity", faded && "opacity-20")}
      style={{ background: fill }}
      data-action-cats={cell.categories.join(",")}
    />
  )
  return (
    <HoverLabel text={tip}>
      {cell.trxId ? (
        <Link
          to={`/tx/${cell.trxId}`}
          className="inline-block"
          aria-label={tip}
          data-action-cell=""
          data-trx={cell.trxId}
          data-action-cats={cell.categories.join(",")}
        >
          {square}
        </Link>
      ) : (
        <span className="inline-block">{square}</span>
      )}
    </HoverLabel>
  )
}

function squareFill(categories: ActionCategory[]): string {
  if (!categories.length) return "var(--act-other)"
  if (categories.length === 1) return `var(--act-${categories[0]})`
  const n = categories.length
  return `linear-gradient(to right, ${categories
    .map((id, index) => {
      const start = ((index / n) * 100).toFixed(2)
      const end = (((index + 1) / n) * 100).toFixed(2)
      return `var(--act-${id}) ${start}% ${end}%`
    })
    .join(", ")})`
}

export function BetaBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-1.5 py-px text-[10px] font-medium leading-4 text-muted">
      Beta
    </span>
  )
}
