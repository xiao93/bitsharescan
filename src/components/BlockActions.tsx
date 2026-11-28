import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ACTION_CATEGORIES, ACTION_CATEGORY_LABEL, actionCellsForBlock, type ActionCategory } from "../lib/actionCategory.ts"
import { formatInt } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import type { OpView } from "../lib/ops.ts"
import { cn } from "../lib/utils.ts"
import { HoverLabel } from "./Now.tsx"

export function BlockActions({
  transactions,
  virtuals,
}: {
  transactions: Array<{ trxId: string; index: number; ops: OpView[] }>
  virtuals: OpView[]
}) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<ActionCategory | null>(null)
  const { cells, counts, total } = useMemo(() => actionCellsForBlock(transactions, virtuals), [transactions, virtuals])

  if (!total) return <span className="text-muted">—</span>

  const present = ACTION_CATEGORIES.filter((id) => (counts.get(id) ?? 0) > 0)

  return (
    <div className="break-normal">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-5 text-ink">
        {present.map((id) => {
          const count = counts.get(id) ?? 0
          const raw = total ? (count * 100) / total : 0
          const percent = raw > 0 && raw < 1 ? "<1" : String(Math.round(raw))
          const pressed = filter === id
          return (
            <button
              key={id}
              type="button"
              role="button"
              aria-pressed={pressed}
              onClick={() => setFilter((cur) => (cur === id ? null : id))}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm text-start hover:text-link",
                pressed && "font-medium text-link",
                filter && !pressed && "opacity-45",
              )}
            >
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: `var(--act-${id})` }} aria-hidden="true" />
              {t("{category} ({count}, {percent}%)", { category: t(ACTION_CATEGORY_LABEL[id]), count: formatInt(count), percent })}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-canvas" aria-hidden="true">
        {present.map((id) => (
          <span
            key={id}
            className="h-full min-w-px"
            style={{ width: `${((counts.get(id) ?? 0) / total) * 100}%`, background: `var(--act-${id})` }}
          />
        ))}
      </div>
      <div className="mt-2 max-h-40 overflow-auto">
        <div className="flex flex-wrap gap-[3px]">
          {cells.map((cell) => {
            const faded = Boolean(filter) && !cell.categories.includes(filter!)
            const tip = cell.trxId ? `${cell.name}\n${cell.trxId}` : cell.name
            const square = (
              <span
                className={cn("block h-3.5 w-3.5 rounded-[3px] transition-opacity", faded && "opacity-20")}
                style={{ background: `var(--act-${cell.category})` }}
              />
            )
            return (
              <HoverLabel key={cell.key} text={tip}>
                {cell.trxId ? (
                  <Link to={`/tx/${cell.trxId}`} className="inline-block" aria-label={tip} data-action-cell="">
                    {square}
                  </Link>
                ) : (
                  <span className="inline-block">{square}</span>
                )}
              </HoverLabel>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function BetaBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-line px-1.5 py-px text-[10px] font-medium leading-4 text-muted">
      Beta
    </span>
  )
}
