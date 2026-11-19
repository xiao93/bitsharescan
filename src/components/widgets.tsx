import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react"
import { useId, useState, type MouseEvent, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { accountLabel, accountPath, assetSymbol, peekAsset } from "../lib/directory.ts"
import type { Amount } from "../lib/directory.ts"
import { formatInt, formatRaw, formatTime, shortHash } from "../lib/format.ts"
import { isVirtualType, opLabel, opSummaryBits } from "../lib/ops.ts"
import type { SummaryBit } from "../lib/ops.ts"
import type { OpView } from "../lib/ops.ts"
import { useI18n } from "../lib/i18n.tsx"
import { networkHasEs } from "../lib/network.ts"
import { cn, linkClass, routeForObject } from "../lib/utils.ts"
import { TimeAgo } from "./Now.tsx"

export function CopyButton({ value }: { value: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-canvas hover:text-link"
      aria-label={t("Copy {value}", { value })}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

export function AccountLink({ id, className }: { id?: string | null; className?: string }) {
  if (!id) return <span className="text-muted">—</span>
  return (
    <Link to={accountPath(id)} className={cn(linkClass, className)}>
      {accountLabel(id)}
    </Link>
  )
}

export function AssetLink({ id, className }: { id?: string | null; className?: string }) {
  if (!id) return <span className="text-muted">—</span>
  const symbol = assetSymbol(id)
  return (
    <Link to={`/asset/${encodeURIComponent(symbol)}`} className={cn(linkClass, className)}>
      {symbol}
    </Link>
  )
}

export function AmountView({ value }: { value?: Amount | null }) {
  if (!value) return <>—</>
  const asset = peekAsset(value.asset_id)
  return (
    <span className="whitespace-nowrap">
      {asset ? formatRaw(value.amount, asset.precision) : String(value.amount)} <AssetLink id={value.asset_id} />
    </span>
  )
}

export function IdLink({ id }: { id?: string | null }) {
  if (!id) return <span className="text-muted">—</span>
  if (/^\d+\.\d+\.\d+$/.test(id)) {
    return (
      <Link to={routeForObject(id)} className={`${linkClass} font-mono text-[13px]`}>
        {id}
      </Link>
    )
  }
  return <span className="font-mono text-[13px]">{id}</span>
}

export function TxLink({ id }: { id?: string }) {
  const { t } = useI18n()
  if (!id) return <span className="text-xs text-muted">{t("Pending id")}</span>
  return (
    <span className="inline-flex items-center gap-1">
      <Link to={`/tx/${id}`} className={`${linkClass} font-mono text-[13px]`} title={id}>
        {shortHash(id)}
      </Link>
      <CopyButton value={id} />
    </span>
  )
}

export function TypeBadge({ type, virtual }: { type: number; virtual?: boolean }) {
  const { t } = useI18n()
  return (
    <span className="inline-flex max-w-[18rem] items-center gap-1 rounded-md bg-chip px-2 py-0.5 text-xs font-medium text-link">
      {opLabel(type)}
      {virtual || isVirtualType(type) ? <span className="text-[10px] text-violet-600">{t("virtual")}</span> : null}
    </span>
  )
}

export function StatusBadge({
  irreversible,
  virtual,
  confirming,
}: {
  irreversible?: boolean
  virtual?: boolean
  confirming?: boolean
}) {
  const { t } = useI18n()
  if (virtual) return <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{t("Virtual")}</span>
  if (irreversible) {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-success">{t("Irreversible")}</span>
  }
  if (confirming) {
    return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{t("Confirming")}</span>
  }
  return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-success">{t("In block")}</span>
}

export function Panel({
  title,
  extra,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  extra?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  const { t } = useI18n()
  const heading = typeof title === "string" ? t(title) : title
  return (
    <section className={cn("overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>
      {title ? (
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{heading}</h2>
          {extra}
        </header>
      ) : null}
      <div className={cn("min-h-0", bodyClassName)}>{children}</div>
      {footer ? <div className="mt-auto shrink-0 border-t border-line px-4 py-3 text-right text-sm">{footer}</div> : null}
    </section>
  )
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  const { t } = useI18n()
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <span className="text-line">/</span> : null}
          {item.to ? (
            <Link to={item.to} className="hover:text-link">
              {t(item.label)}
            </Link>
          ) : (
            <span className="text-ink">{t(item.label)}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n()
  const gap = message.includes("no public operation index")
  if (gap) {
    return <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm text-muted">{t(message)}</div>
  }
  return (
    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p>{t(message)}</p>
      {onRetry ? (
        <button type="button" className="mt-2 font-medium text-link hover:underline" onClick={onRetry}>
          {t("Try again")}
        </button>
      ) : null}
    </div>
  )
}

export function Empty({ title, body }: { title: string; body?: string }) {
  const { t } = useI18n()
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-medium text-ink">{t(title)}</p>
      {body ? <p className="mt-1 text-sm text-muted">{t(body)}</p> : null}
    </div>
  )
}

export function LoadingBlock({ lines = 6 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="h-8 animate-pulse rounded-md bg-canvas" />
      ))}
    </div>
  )
}

export function Pager({
  page,
  hasPrev,
  hasNext,
  onPage,
  totalLabel,
}: {
  page: number
  hasPrev: boolean
  hasNext: boolean
  onPage: (page: number) => void
  totalLabel?: string
}) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
      <button
        type="button"
        disabled={!hasPrev}
        onClick={() => onPage(page - 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-medium text-ink disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" /> {t("Previous")}
      </button>
      <span className="text-muted">
        {totalLabel ? t("Page {page} · {total}", { page, total: t(totalLabel) }) : t("Page {page}", { page })}
      </span>
      <button
        type="button"
        disabled={!hasNext}
        onClick={() => onPage(page + 1)}
        className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 font-medium text-ink disabled:opacity-40"
      >
        {t("Next")} <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function OpSummary({ op }: { op: OpView }) {
  return <SummaryBits bits={opSummaryBits(op)} />
}

export function SummaryBits({ bits }: { bits: SummaryBit[] }) {
  return (
    <>
      {bits.map((bit, index) => {
        if (typeof bit === "string" || !bit) return <span key={index}>{bit}</span>
        if (bit.kind === "account") return <AccountLink key={index} id={bit.id} />
        if (bit.kind === "asset") return <AssetLink key={index} id={bit.id} />
        if (bit.kind === "account-name") {
          return <Link key={index} to={`/account/${encodeURIComponent(bit.name)}`} className={linkClass}>{bit.name}</Link>
        }
        if (bit.kind === "asset-symbol") {
          return <Link key={index} to={`/asset/${encodeURIComponent(bit.symbol)}`} className={linkClass}>{bit.symbol}</Link>
        }
        return <Link key={index} to={routeForObject(bit.id)} className={linkClass}>{bit.id}</Link>
      })}
    </>
  )
}

export function OpTable({ rows }: { rows: OpView[] }) {
  const { t } = useI18n()
  if (!rows.length) {
    if (!networkHasEs()) {
      return (
        <div className="px-4 py-6 text-sm text-muted">
          {t("This network has no public operation index. Blocks and accounts still load from the node.")}
        </div>
      )
    }
    return <Empty title="No operations" body="Nothing matched this view yet." />
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{t("Txn")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Type")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Block")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Age")}</th>
            <th className="px-4 py-2.5 font-medium">{t("From")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Summary")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Fee")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((op) => (
            <tr key={op.key} className="align-top hover:bg-row">
              <td className="px-4 py-3">
                {op.trxId ? <TxLink id={op.trxId} /> : op.opId ? <IdLink id={op.opId} /> : <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-3">
                <TypeBadge type={op.type} virtual={op.virtual} />
              </td>
              <td className="px-4 py-3">
                {op.blockNum ? (
                  <Link to={`/block/${op.blockNum}`} className={linkClass}>
                    {formatInt(op.blockNum)}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                <TimeAgo time={op.time} />
              </td>
              <td className="px-4 py-3">
                <AccountLink id={op.feePayer} />
              </td>
              <td className="max-w-md px-4 py-3 text-ink"><OpSummary op={op} /></td>
              <td className="whitespace-nowrap px-4 py-3">
                <AmountView value={op.fee} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function LineChart({
  points,
  unit = "operations",
  compact = false,
}: {
  points: { date: string; value: number }[]
  unit?: string
  compact?: boolean
}) {
  const { t } = useI18n()
  const gid = `area-${useId().replace(/:/g, "")}`
  const [hover, setHover] = useState<number | null>(null)
  if (!points.length) return <Empty title="No chart data" />
  const width = compact ? 360 : 760
  const height = compact ? 92 : 220
  const padL = compact ? 2 : 12
  const padR = compact ? 2 : 12
  const padT = compact ? 16 : 28
  const padB = compact ? 16 : 26
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const max = Math.max(...points.map((point) => point.value), 1)
  const coords = points.map((point, index) => {
    const x = padL + (index / Math.max(points.length - 1, 1)) * innerW
    const y = padT + innerH - (point.value / max) * innerH
    return { x, y }
  })
  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ")
  const baseY = padT + innerH
  const area = `${line} L${coords[coords.length - 1]!.x.toFixed(2)},${baseY} L${coords[0]!.x.toFixed(2)},${baseY} Z`
  const labelEvery = Math.ceil(points.length / (compact ? 2 : 7))
  const caption =
    hover == null
      ? compact
        ? ""
        : unit === "operations"
          ? t("Unique operations per day")
          : t("Daily close ({unit})", { unit })
      : t("{date}: {value} {unit}", {
          date: /^\d{4}-\d{2}-\d{2}/.test(points[hover]!.date) ? formatTime(`${points[hover]!.date.slice(0, 10)}T00:00:00Z`) : points[hover]!.date,
          value: unit === "operations" ? formatInt(points[hover]!.value) : points[hover]!.value.toLocaleString(undefined, { maximumFractionDigits: 8 }),
          unit: unit === "operations" ? t("operations") : unit,
        })

  function nearest(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * width
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    coords.forEach((point, index) => {
      const dist = Math.abs(point.x - x)
      if (dist < bestDist) {
        best = index
        bestDist = dist
      }
    })
    setHover(best)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={compact ? "h-full w-full" : "h-52 w-full"}
      role="img"
      aria-label={unit === "operations" ? t("BitShares operation history") : t("Daily close ({unit})", { unit })}
      onMouseMove={nearest}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-link)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--color-link)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <text x={padL} y={compact ? 11 : 16} fontSize={compact ? 10 : 12} fill={hover == null ? "var(--color-muted)" : "var(--color-ink)"}>
        {caption}
      </text>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="var(--color-link)" strokeWidth={compact ? 1.6 : 2} strokeLinejoin="round" strokeLinecap="round" />
      {hover != null ? (
        <circle cx={coords[hover]!.x} cy={coords[hover]!.y} r={compact ? 2.4 : 3.2} fill="var(--color-card)" stroke="var(--color-link)" strokeWidth="1.5" />
      ) : null}
      {points.map((point, index) =>
        compact ? (
          index === 0 || index === points.length - 1 ? (
            <text
              key={point.date}
              x={index === 0 ? padL : width - padR}
              y={height - 3}
              textAnchor={index === 0 ? "start" : "end"}
              fontSize="10"
              fill="var(--color-muted)"
            >
              {point.date.slice(5)}
            </text>
          ) : null
        ) : index % labelEvery === 0 ? (
          <text key={point.date} x={coords[index]!.x} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
            {point.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

export function KeyValue({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  const { t } = useI18n()
  return (
    <dl className="divide-y divide-line">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_1fr] sm:gap-4">
          <dt className="text-sm text-muted">{t(row.label)}</dt>
          <dd className="min-w-0 break-all text-sm text-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value == null) return <span className="text-muted">null</span>
  if (typeof value === "string") {
    if (/^\d+\.\d+\.\d+$/.test(value)) return <IdLink id={value} />
    if (value.length > 24 && /^[0-9a-fA-F]+$/.test(value)) {
      return <span className="text-emerald-700" title={value}>"{value.slice(0, 10)}…{value.slice(-6)}"</span>
    }
    return <span className="text-emerald-700">"{value}"</span>
  }
  if (typeof value === "number" || typeof value === "bigint") return <span className="text-link">{String(value)}</span>
  if (typeof value === "boolean") return <span className="text-violet-700">{String(value)}</span>
  if (Array.isArray(value)) {
    if (!value.length) return <span>[]</span>
    return (
      <div className={depth ? "border-l border-line pl-3" : ""}>
        {value.map((item, index) => (
          <div key={index} className="py-0.5">
            <span className="text-muted">{index}: </span>
            <JsonTree value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
    if (!entries.length) return <span>{"{}"}</span>
    return (
      <div className={depth ? "border-l border-line pl-3" : ""}>
        {entries.map(([key, item]) => (
          <div key={key} className="py-0.5">
            <span className="text-muted">{key}: </span>
            <JsonTree value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    )
  }
  return <span>{String(value)}</span>
}
