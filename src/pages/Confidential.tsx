import { useState, type MouseEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { AccountLink, AmountView, Crumbs, ErrorBox, LoadingBlock, Pager, Panel } from "../components/widgets.tsx"
import { fetchConfidentialOps, fetchConfidentialStats, publicSide, type ConfDay } from "../lib/confidential.ts"
import { FormatTime } from "../components/Now.tsx"
import { formatInt, formatRaw } from "../lib/format.ts"
import { opLabel } from "../lib/ops.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 50
const SERIES = [
  { key: "toBlind" as const, type: 39, color: "var(--color-link)" },
  { key: "blind" as const, type: 40, color: "#c2410c" },
  { key: "fromBlind" as const, type: 41, color: "#0f766e" },
]

export default function Confidential() {
  const { t } = useI18n()
  useTitle("Confidential transfers")
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const typeParam = params.get("type")
  const type = typeParam === "39" || typeParam === "40" || typeParam === "41" ? Number(typeParam) : null
  const stats = useQuery(() => fetchConfidentialStats(), [])
  const list = useQuery(() => fetchConfidentialOps(page, PAGE_SIZE, type), [page, type])

  function setType(value: string) {
    const copy = new URLSearchParams(params)
    if (value) copy.set("type", value)
    else copy.delete("type")
    copy.set("page", "1")
    setParams(copy)
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Confidential transfers" }]} />
      <h1 className="text-2xl font-semibold">{t("Confidential transfers")}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">
        {t("A transfer to blind publishes the sender, the asset, and the amount. A transfer from blind publishes the receiver, the asset, and the amount. A blind transfer publishes only the fee and the commitments; the amounts inside those commitments stay hidden.")}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={t("Last 30 days")} value={stats.data ? formatInt(stats.data.recent) : "—"} hint={t("Confidential operations")} />
        <Card label={t("All-time operations")} value={stats.data ? formatInt(stats.data.total) : "—"} hint={stats.data ? t("{to} to blind · {blind} blind · {from} from blind", { to: formatInt(stats.data.byType[39] ?? 0), blind: formatInt(stats.data.byType[40] ?? 0), from: formatInt(stats.data.byType[41] ?? 0) }) : ""} />
      </div>
      {stats.data?.supplies.length ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stats.data.supplies.map((row) => (
            <Link key={row.assetId} to={`/asset/${row.symbol}`} className="rounded-xl border border-line bg-card p-3 hover:border-link">
              <div className="truncate text-xs text-muted">{t("Confidential supply")}</div>
              <div className="truncate text-sm font-semibold text-link">{row.symbol}</div>
              <div className="truncate font-mono text-sm tabular-nums">{formatRaw(row.raw, row.precision)}</div>
            </Link>
          ))}
        </div>
      ) : null}
      {stats.data && !stats.data.supplies.length ? <p className="mb-4 text-sm text-muted">{t("No asset currently holds a confidential balance.")}</p> : null}
      {stats.error ? <div className="mb-4"><ErrorBox message={stats.error} onRetry={stats.reload} /></div> : null}
      <Panel className="mb-4" title={t("Confidential operations")}>
        {stats.loading && !stats.data ? <LoadingBlock lines={4} /> : null}
        {stats.data ? <DailyChart days={stats.data.days} /> : null}
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("Operation type")}</span>
            <select
              value={type == null ? "" : String(type)}
              aria-label={t("Operation type")}
              onChange={(event) => setType(event.target.value)}
              className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink"
            >
              <option value="">{t("All types")}</option>
              {[39, 40, 41].map((item) => <option key={item} value={item}>{opLabel(item)}</option>)}
            </select>
          </label>
        </div>
        {list.loading && !list.data ? <LoadingBlock /> : null}
        {list.error ? <div className="p-4"><ErrorBox message={list.error} onRetry={list.reload} /></div> : null}
        {list.data && !list.data.rows.length ? <p className="px-4 py-8 text-center text-sm text-muted">{t("No confidential operations in this view.")}</p> : null}
        {list.data?.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-start text-sm">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{t("Type")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Block")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Time")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Account")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Public amount")}</th>
                  <th className="px-4 py-2.5 text-end font-medium">{t("Inputs / outputs")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Fee")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.data.rows.map((op) => {
                  const side = publicSide(op)
                  return (
                    <tr key={op.key} className="hover:bg-row">
                      <td className="px-4 py-3">{op.opId ? <Link className={linkClass} to={`/op/${op.opId}`}>{opLabel(op.type)}</Link> : opLabel(op.type)}</td>
                      <td className="px-4 py-3"><Link className={linkClass} to={`/block/${op.blockNum}`}>{formatInt(op.blockNum)}</Link></td>
                      <td className="px-4 py-3 text-xs text-muted"><FormatTime time={op.time} /></td>
                      <td className="px-4 py-3">{side.account ? <AccountLink id={side.account} /> : "—"}</td>
                      <td className="px-4 py-3">{side.amount ? <AmountView value={side.amount} /> : <span className="text-muted">{t("Hidden")}</span>}</td>
                      <td className="px-4 py-3 text-end font-mono tabular-nums">{side.inputs} / {side.outputs}</td>
                      <td className="px-4 py-3"><AmountView value={op.fee} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <Pager
          page={page}
          hasPrev={page > 1}
          hasNext={Boolean(list.data && list.data.rows.length === PAGE_SIZE)}
          onPage={(next) => {
            const copy = new URLSearchParams(params)
            copy.set("page", String(next))
            setParams(copy)
          }}
        />
      </Panel>
    </div>
  )
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="truncate text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  )
}

function DailyChart({ days }: { days: ConfDay[] }) {
  const { t } = useI18n()
  const [hover, setHover] = useState<number | null>(null)
  if (days.length < 2) return <p className="px-4 py-6 text-sm text-muted">{t("No confidential operations in this view.")}</p>
  const width = 760
  const height = 220
  const padL = 12
  const padR = 12
  const padT = 28
  const padB = 26
  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const max = Math.max(...days.map((day) => day.toBlind + day.blind + day.fromBlind), 1)
  const xAt = (index: number) => padL + (index / (days.length - 1)) * innerW
  const yAt = (value: number) => padT + innerH - (value / max) * innerH

  function path(pick: (day: ConfDay) => number) {
    return days.map((day, index) => `${index === 0 ? "M" : "L"}${xAt(index).toFixed(1)},${yAt(pick(day)).toFixed(1)}`).join(" ")
  }

  function nearest(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * width
    let best = 0
    let bestDist = Number.POSITIVE_INFINITY
    days.forEach((_, index) => {
      const dist = Math.abs(xAt(index) - x)
      if (dist < bestDist) {
        best = index
        bestDist = dist
      }
    })
    setHover(best)
  }

  const labelEvery = Math.ceil(days.length / 7)
  const day = hover == null ? null : days[hover]
  const caption = day
    ? `${day.date}: ${day.toBlind} / ${day.blind} / ${day.fromBlind}`
    : t("Unique operations per day")
  return (
    <div className="px-2 pt-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label={t("Confidential operations")} onMouseMove={nearest} onMouseLeave={() => setHover(null)}>
        <text x={padL} y={16} fontSize="12" fill="var(--color-muted)">{caption}</text>
        {SERIES.map((series) => <path key={series.key} d={path((row) => row[series.key])} fill="none" stroke={series.color} strokeWidth="1.6" />)}
        {days.map((day, index) => index % labelEvery === 0 ? (
          <text key={day.date} x={xAt(index)} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--color-muted)"><tspan>{day.date.slice(0, 7)}</tspan></text>
        ) : null)}
      </svg>
      <div className="flex flex-wrap gap-4 px-3 pb-3 text-xs text-muted">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: series.color }} />
            {opLabel(series.type)}
          </span>
        ))}
      </div>
    </div>
  )
}
