import { useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { Crumbs, ErrorBox, LoadingBlock } from "../components/widgets.tsx"
import { CATEGORIES, CHARTS, loadChart, loadSnapshots, networkNotice, type ChartData, type ChartDef, type Point, type RankRow, type Snapshots } from "../lib/charts.ts"
import { networkHasEs } from "../lib/network.ts"
import { useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function Charts() {
  const { t } = useI18n()
  useTitle("BitShares Charts & Statistics")
  const [query, setQuery] = useState("")
  const [snaps, setSnaps] = useState<Snapshots | null>(null)
  const [snapError, setSnapError] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  const visible = useMemo(
    () => CHARTS.filter((chart) => !needle || t(chart.title).toLowerCase().includes(needle) || chart.title.toLowerCase().includes(needle)),
    [needle, t],
  )

  useEffect(() => {
    let stop = false
    loadSnapshots().then(
      (value) => {
        if (!stop) setSnaps(value)
      },
      (error: unknown) => {
        if (!stop) setSnapError(error instanceof Error ? error.message : "Failed")
      },
    )
    return () => {
      stop = true
    }
  }, [])

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Charts" }]} />
      <h1 className="text-2xl font-semibold tracking-tight">{t("BitShares Charts & Statistics")}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">{t("Daily chain statistics from the operation index and the node. Thumbnails load as they scroll into view.")}</p>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("Find a chart")}
        className="mt-4 h-10 w-full max-w-md rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none focus:border-link"
        aria-label={t("Find a chart")}
      />
      {!networkHasEs() ? <div className="mt-4"><ErrorBox message={networkNotice} /></div> : null}
      {CATEGORIES.map((category) => {
        const cards = visible.filter((chart) => chart.category === category)
        if (!cards.length) return null
        return (
          <section key={category} className="mt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t(category)}</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map((chart) => (
                <ChartCard key={chart.id} chart={chart} disabled={!networkHasEs() && chart.id !== "bts-price"} />
              ))}
            </div>
          </section>
        )
      })}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("Current snapshot")}</h2>
        {snapError ? <ErrorBox message={snapError} /> : null}
        {!snaps && !snapError ? <LoadingBlock lines={2} /> : null}
        {snaps ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Snap label={t("Core supply")} value={snaps.supply} />
            <Snap label={t("Total accounts")} value={snaps.accounts} />
            <Snap label={t("Witness seats")} value={snaps.witnesses} />
            <Snap label={t("Committee seats")} value={snaps.committee} />
            <Snap label={t("Pool TVL")} value={snaps.tvl} />
          </div>
        ) : null}
      </section>
    </div>
  )
}

function Snap({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-ink">{value}</div>
    </div>
  )
}

function ChartCard({ chart, disabled }: { chart: ChartDef; disabled: boolean }) {
  const { t } = useI18n()
  const ref = useRef<HTMLAnchorElement>(null)
  const [data, setData] = useState<ChartData | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (disabled) return
    const node = ref.current
    if (!node) return
    let stop = false
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      loadChart(chart.id, chart.view === "heatmap" ? "1m" : "1y").then(
        (value) => {
          if (!stop) setData(value)
        },
        () => {
          if (!stop) setFailed(true)
        },
      )
    }, { rootMargin: "120px" })
    observer.observe(node)
    return () => {
      stop = true
      observer.disconnect()
    }
  }, [chart.id, chart.view, disabled])
  const points = data?.series?.[0]?.points ?? data?.points ?? null
  return (
    <Link ref={ref} to={`/charts/${chart.id}`} className="block rounded-xl border border-line bg-card p-3 hover:border-link">
      <div className="h-16">
        {disabled ? null : failed ? <div className="flex h-full items-center text-xs text-danger">{t("Chart unavailable")}</div> : data ? <Thumb chart={chart} points={points ?? []} rows={data.rows} grid={data.grid} /> : <div className="h-full animate-pulse rounded bg-canvas" />}
      </div>
      <div className="mt-2 text-sm font-medium text-ink">{t(chart.title)}</div>
    </Link>
  )
}

function Thumb({ chart, points, rows, grid }: { chart: ChartDef; points: Point[]; rows?: RankRow[]; grid?: number[][] }) {
  const { t } = useI18n()
  if (chart.view === "heatmap" && grid) return <HeatCells grid={grid} />
  if ((chart.view === "share" || chart.view === "rank") && rows) {
    if (!rows.length) return <div className="flex h-full items-center text-xs text-muted">—</div>
    if (chart.view === "share") return <MiniShare rows={rows} />
    return (
      <ul className="flex h-full flex-col justify-center gap-0.5">
        {rows.slice(0, 4).map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-ink">{t(row.label)}</span>
            <span className="font-mono tabular-nums text-muted">{formatCompact(row.value, chart.digits)}</span>
          </li>
        ))}
      </ul>
    )
  }
  return points ? <Spark points={points} /> : null
}

function MiniShare({ rows }: { rows: RankRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  const colors = ["#0784c3", "#00a186", "#d97706", "#7c3aed", "#e11d48", "#0f766e", "#64748b", "#b45309"]
  let cursor = 0
  const stops = rows.map((row, index) => {
    const start = cursor
    cursor += row.value / total * 100
    return `${colors[index % colors.length]} ${start}% ${cursor}%`
  }).join(", ")
  return <div className="mx-auto h-16 w-16 rounded-full" style={{ background: `conic-gradient(${stops})` }} />
}

function HeatCells({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat())
  return (
    <div className="grid h-full grid-rows-7 gap-px">
      {grid.map((row, day) => (
        <div key={day} className="grid gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
          {row.map((value, hour) => (
            <span key={hour} className="rounded-[1px]" style={{ background: `rgba(7, 132, 195, ${0.12 + 0.88 * (value / max)})` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

function formatCompact(value: number, digits: number) {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return digits ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : Math.round(value).toLocaleString()
}

function Spark({ points }: { points: Point[] }) {
  if (points.length < 2) return <div className="flex h-full items-center text-xs text-muted">—</div>
  const width = 280
  const height = 64
  const values = points.map((point) => point.value)
  const hi = Math.max(...values)
  const lo = Math.min(...values)
  const pad = hi === lo ? Math.abs(hi) * 0.1 || 1 : (hi - lo) * 0.12
  const min = lo > 0 && lo > hi * 0.4 ? lo - pad : 0
  const max = hi + pad
  const span = Math.max(max - min, 1e-9)
  const step = width / (points.length - 1)
  const line = points.map((point, index) => `${index ? "L" : "M"}${(index * step).toFixed(1)},${(height - ((point.value - min) / span) * (height - 4) - 2).toFixed(1)}`).join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" aria-hidden>
      <path d={line} fill="none" stroke="var(--color-link)" strokeWidth="1.6" />
    </svg>
  )
}
