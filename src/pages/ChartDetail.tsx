import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { Crumbs, ErrorBox, LoadingBlock } from "../components/widgets.tsx"
import { RANGES, chartById, loadChart, type LineSeries, type Point, type RangeId, type RankRow } from "../lib/charts.ts"
import { formatDecimal, formatInt, formatTime } from "../lib/format.ts"
import { timeZoneSuffix } from "../lib/timePref.ts"
import { coreSymbol } from "../lib/network.ts"
import { fetchBtsUsd, priceHint, type BtsUsd } from "../lib/usd.ts"
import { useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const COLORS = ["#0784c3", "#00a186", "#d97706", "#7c3aed", "#e11d48", "#0f766e"]

export default function ChartDetail() {
  const { id = "" } = useParams()
  const chart = chartById(id)
  const { t } = useI18n()
  const isPrice = chart?.id === "bts-price"
  useTitle(isPrice ? "BitShares (BTS) Price Chart" : (chart?.title ?? "Chart"))
  const [range, setRange] = useState<RangeId>("1y")
  const [points, setPoints] = useState<Point[] | null>(null)
  const [rows, setRows] = useState<RankRow[] | null>(null)
  const [grid, setGrid] = useState<number[][] | null>(null)
  const [series, setSeries] = useState<LineSeries[] | null>(null)
  const [shown, setShown] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [bucket, setBucket] = useState<"day" | "month">("day")
  const [monthlyUnique, setMonthlyUnique] = useState(false)
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [quote, setQuote] = useState<BtsUsd | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    if (!isPrice) {
      setQuote(null)
      return
    }
    let stop = false
    void fetchBtsUsd().then((value) => {
      if (!stop) setQuote(value)
    })
    return () => {
      stop = true
    }
  }, [isPrice])

  useEffect(() => {
    if (!chart) return
    let stop = false
    setError(null)
    setPoints(null)
    setZoom(null)
    setUpdatedAt(null)
    loadChart(chart.id, range).then(
      (data) => {
        if (stop) return
        setPoints(data.points)
        setRows(data.rows ?? null)
        setGrid(data.grid ?? null)
        setSeries(data.series ?? null)
        setBucket(data.bucket)
        setMonthlyUnique(data.monthlyUnique)
        setShown(data.series?.map((row) => row.id) ?? [])
        setUpdatedAt(data.updatedAt ?? null)
      },
      (err: unknown) => {
        if (!stop) setError(err instanceof Error ? err.message : "Failed")
      },
    )
    return () => {
      stop = true
    }
  }, [chart, range, attempt])

  const view = chart?.view ?? "line"
  const ranges = view === "heatmap" ? [] : view === "line" ? RANGES : RANGES.filter((item) => item !== "all")

  const visible = useMemo(() => {
    if (!series) return points ? [{ id: "value", label: chart?.unit ?? "", points }] : []
    return series.filter((row) => shown.includes(row.id))
  }, [series, shown, points, chart])

  const sliced = useMemo(() => {
    return visible.map((row) => {
      if (!zoom) return row
      return { ...row, points: row.points.slice(zoom[0], zoom[1] + 1) }
    })
  }, [visible, zoom])

  if (!chart) {
    return (
      <div>
        <Crumbs items={[{ label: "Home", to: "/" }, { label: "Charts", to: "/charts" }, { label: "Not found" }]} />
        <ErrorBox message="That chart does not exist." />
      </div>
    )
  }

  function download() {
    if (view !== "line" && rows?.length) {
      const lines = ["label,value", ...rows.map((row) => `${row.label},${row.value}`)]
      const blob = new Blob([lines.join("\n")], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${chart!.id}.csv`
      link.click()
      URL.revokeObjectURL(url)
      return
    }
    const rowsCsv = sliced
    const header = ["date", ...rowsCsv.map((row) => row.label || chart!.unit)]
    const dates = rowsCsv[0]?.points.map((point) => point.date) ?? []
    const lines = [header.join(",")]
    dates.forEach((date, index) => {
      lines.push([date, ...rowsCsv.map((row) => row.points[index]?.value ?? "")].join(","))
    })
    const blob = new Blob([lines.join("\n")], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${chart!.id}-${range}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Charts", to: "/charts" }, { label: isPrice ? "BitShares (BTS) Price Chart" : chart.title }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t(isPrice ? "BitShares (BTS) Price Chart" : chart.title)}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t(chart.description)}</p>
          {monthlyUnique ? <p className="mt-1 text-sm text-muted">{t("All range shows monthly unique accounts, not a daily average.")}</p> : null}
          {isPrice ? (
            <div className="mt-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("Current BTS price")}</div>
              <div className="mt-0.5 text-2xl font-semibold text-ink">{quote?.price == null ? "—" : `$${formatDecimal(quote.price, 6)}`}</div>
              {priceHint(quote, t) ? <div className="mt-0.5 text-xs text-muted" title={quote?.source || undefined}>{priceHint(quote, t)}</div> : null}
              {updatedAt ? <p className="mt-1 text-xs text-muted">{t("History via CoinMarketCap, updated {time}", { time: formatTime(updatedAt) })}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ranges.map((item) => (
            <button key={item} type="button" onClick={() => setRange(item)} className={`h-8 rounded-md border px-2.5 text-xs font-medium ${range === item ? "border-link bg-tint text-link" : "border-line text-ink"}`}>
              {item === "all" ? t("All") : item.toUpperCase()}
            </button>
          ))}
          <button type="button" onClick={download} className="h-8 rounded-md border border-line px-2.5 text-xs font-medium text-ink">{t("Download CSV")}</button>
          {zoom ? <button type="button" onClick={() => setZoom(null)} className="h-8 text-xs text-link">{t("Reset zoom")}</button> : null}
        </div>
      </div>
      {series ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {series.map((row, index) => (
            <label key={row.id} className="inline-flex items-center gap-1.5 text-xs text-ink">
              <input
                type="checkbox"
                checked={shown.includes(row.id)}
                onChange={() => setShown((current) => current.includes(row.id) ? current.filter((item) => item !== row.id) : [...current, row.id])}
              />
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
              {t(row.label)}
            </label>
          ))}
        </div>
      ) : null}
      {error ? <ErrorBox message={error} onRetry={() => setAttempt((value) => value + 1)} /> : null}
      {!points && !rows && !grid && !error ? <LoadingBlock lines={6} /> : null}
      {view !== "line" && (rows || grid) ? <RankView chartId={chart.id} view={view} rows={rows ?? []} grid={grid} digits={chart.digits} unit={chart.unit === "core" ? coreSymbol() : chart.unit} /> : null}
      {view === "line" && points ? (
        <>
          <ChartSummary series={sliced} digits={chart.digits} bucket={bucket} />
          <AreaChart series={sliced} digits={chart.digits} bucket={bucket} onZoom={(start, end) => setZoom([start, end])} />
        </>
      ) : null}
      {isPrice && (sliced[0]?.points.length || points?.length) ? (
        <PriceTable points={sliced[0]?.points ?? points ?? []} digits={chart.digits} />
      ) : null}
      <p className="mt-3 text-xs text-muted">
        <Link to="/charts" className="text-link">{t("All charts")}</Link>
      </p>
    </div>
  )
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function RankView({ chartId, view, rows, grid, digits, unit }: { chartId: string; view: string; rows: RankRow[]; grid?: number[][] | null; digits: number; unit: string }) {
  const { t } = useI18n()
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1
  const max = Math.max(1, ...rows.map((row) => row.value))
  const text = (value: number) => `${digits ? formatDecimal(value, digits) : formatInt(Math.round(value))}${unit && unit !== "operations" && unit !== "accounts" && unit !== "fills" && unit !== "amount" ? ` ${unit}` : ""}`
  if (view === "heatmap" && grid) {
    const peak = Math.max(1, ...grid.flat())
    return (
      <div className="overflow-x-auto rounded-xl border border-line bg-card p-4">
        <div className="min-w-[720px]">
          {grid.map((day, index) => (
            <div key={WEEKDAYS[index]} className="mb-1 grid items-center gap-2" style={{ gridTemplateColumns: "88px 1fr" }}>
              <span className="text-xs text-muted">{t(WEEKDAYS[index]!)}</span>
              <div className="grid gap-px" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                {day.map((value, hour) => (
                  <span key={hour} title={`${t(WEEKDAYS[index]!)} ${hourLabel(hour)} · ${formatInt(Math.round(value))}`} className="h-6 rounded-[2px]" style={{ background: `rgba(7, 132, 195, ${0.08 + 0.92 * (value / peak)})` }} />
                ))}
              </div>
            </div>
          ))}
          <div className="mt-2 grid text-[11px] text-muted" style={{ gridTemplateColumns: "88px 1fr" }}>
            <span />
            <div className="flex justify-between"><span>{hourLabel(0, false)}</span><span>{hourLabel(6, false)}</span><span>{hourLabel(12, false)}</span><span>{hourLabel(18, false)}</span><span>{hourLabel(23)}</span></div>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">{t("Name")}</th>
            <th className="px-4 py-2 font-medium">{view === "share" ? t("Share") : ""}</th>
            <th className="px-4 py-2 text-right font-medium">{t("Amount")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-4 py-2">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{rowLink(chartId, row, t)}</span>
                  <span className="font-mono text-xs tabular-nums text-muted sm:hidden">{text(row.value)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-canvas">
                  <div className="h-full bg-link" style={{ width: `${Math.max(2, (row.value / (view === "share" ? total : max)) * 100)}%` }} />
                </div>
              </td>
              <td className="px-4 py-2 font-mono text-xs tabular-nums text-muted">{view === "share" ? `${((row.value / total) * 100).toFixed(1)}%` : ""}</td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">{text(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <p className="px-4 py-6 text-sm text-muted">{t("No chart data")}</p> : null}
    </div>
  )
}

function rowLink(chartId: string, row: RankRow, t: (text: string) => string) {
  if (chartId === "top-accounts" || chartId === "registrars") return <Link to={`/account/${row.label}`} className="text-link">{row.label}</Link>
  if (chartId === "top-assets") return <Link to={`/asset/${row.label}`} className="text-link">{row.label}</Link>
  return t(row.label)
}

function formatTick(value: number, digits: number) {
  const abs = Math.abs(value)
  if (digits > 0 && abs < 1000) return formatDecimal(value, digits)
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
  if (abs >= 1000) return `${(value / 1000).toFixed(abs >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`
  return digits ? formatDecimal(value, digits) : formatInt(Math.round(value))
}

function dateLabel(date: string, bucket: "day" | "month", long: boolean) {
  if (bucket === "month" || long) return date.slice(0, 7)
  return date
}

function dated(date: string, bucket: "day" | "month") {
  const day = bucket === "month" || date.length === 7 ? `${date.slice(0, 7)}-01` : date
  return formatTime(`${day}T00:00:00Z`)
}

function hourLabel(utcHour: number, withZone = true) {
  const stamp = new Date(Date.UTC(2026, 0, 4, utcHour, 0, 0)).toISOString()
  const clock = formatTime(stamp)
  const match = clock.match(/(\d{2}:\d{2}:\d{2})/)
  const hhmm = (match?.[1] ?? `${String(utcHour).padStart(2, "0")}:00:00`).slice(0, 5)
  return withZone ? `${hhmm} ${timeZoneSuffix(new Date(stamp))}` : hhmm
}

function spansYears(points: Point[]) {
  if (points.length < 2) return false
  return points.at(-1)!.date.slice(0, 4) !== points[0]!.date.slice(0, 4)
}

function PriceTable({ points, digits }: { points: Point[]; digits: number }) {
  const { t } = useI18n()
  const rows = [...points].reverse()
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-canvas text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("Date")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("Close price")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.date}>
                <td className="px-4 py-2">{row.date}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">${formatDecimal(row.value, digits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChartSummary({ series, digits, bucket }: { series: LineSeries[]; digits: number; bucket: "day" | "month" }) {
  const { t } = useI18n()
  const row = series[0]
  const points = row?.points ?? []
  if (points.length < 2) return null
  const latest = points.at(-1)!
  let high = points[0]!
  let low = points[0]!
  for (const point of points) {
    if (point.value > high.value) high = point
    if (point.value < low.value) low = point
  }
  const text = (value: number) => (digits ? formatDecimal(value, digits) : formatInt(Math.round(value)))
  return (
    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
      <span>{t("Latest {value}", { value: text(latest.value) })}</span>
      <span>{t("Highest {value} on {date}", { value: text(high.value), date: dated(high.date, bucket) })}</span>
      <span>{t("Lowest {value} on {date}", { value: text(low.value), date: dated(low.date, bucket) })}</span>
    </div>
  )
}

function AreaChart({ series, digits, bucket, onZoom }: { series: LineSeries[]; digits: number; bucket: "day" | "month"; onZoom: (start: number, end: number) => void }) {
  const { t } = useI18n()
  const host = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(960)
  const [hover, setHover] = useState<number | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  useEffect(() => {
    const node = host.current
    if (!node) return
    const measure = () => setWidth(Math.max(320, Math.round(node.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const base = series[0]?.points ?? []
  if (base.length < 2) return <p className="text-sm text-muted">{t("No chart data")}</p>
  const height = 340
  const pad = { l: 56, r: 16, t: 16, b: 32 }
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const values = series.flatMap((row) => row.points.map((point) => point.value))
  const hi = Math.max(...values)
  const lo = Math.min(...values)
  const cushion = hi === lo ? Math.abs(hi) * 0.08 || 1 : (hi - lo) * 0.08
  const min = lo > 0 && lo > hi * 0.35 ? lo - cushion : 0
  const max = hi + cushion
  const span = Math.max(max - min, 1e-9)
  const xAt = (index: number) => pad.l + (index / (base.length - 1)) * innerW
  const yAt = (value: number) => pad.t + innerH - ((value - min) / span) * innerH
  const paths = series.map((row) => row.points.map((point, index) => `${index ? "L" : "M"}${xAt(index).toFixed(1)},${yAt(point.value).toFixed(1)}`).join(" "))
  const area = `${paths[0]} L${xAt(base.length - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)} L${xAt(0).toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`
  const yTicks = Array.from({ length: 5 }, (_, index) => min + (span * index) / 4)
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(fraction * (base.length - 1)))

  function indexAt(clientX: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * width
    return Math.max(0, Math.min(base.length - 1, Math.round(((x - pad.l) / innerW) * (base.length - 1))))
  }

  return (
    <div ref={host} className="relative w-full rounded-xl border border-line bg-card p-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        onMouseMove={(event) => setHover(indexAt(event.clientX, event.currentTarget))}
        onMouseLeave={() => setHover(null)}
        onMouseDown={(event) => setDrag(indexAt(event.clientX, event.currentTarget))}
        onMouseUp={(event) => {
          if (drag == null) return
          const end = indexAt(event.clientX, event.currentTarget)
          if (Math.abs(end - drag) > 2) onZoom(Math.min(drag, end), Math.max(drag, end))
          setDrag(null)
        }}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={yAt(tick)} y2={yAt(tick)} stroke="var(--color-line)" />
            <text x={pad.l - 8} y={yAt(tick) + 4} fontSize="11" fill="var(--color-muted)" textAnchor="end">{formatTick(tick, digits)}</text>
          </g>
        ))}
        <path d={area} fill="var(--color-link)" opacity="0.12" />
        {paths.map((path, index) => (
          <path key={series[index]?.id ?? index} d={path} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="2" />
        ))}
        {hover != null ? <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.t} y2={pad.t + innerH} stroke="var(--color-muted)" strokeDasharray="3 3" /> : null}
        {xTicks.map((index) => (
          <text key={index} x={xAt(index)} y={height - 8} fontSize="11" fill="var(--color-muted)" textAnchor={index === 0 ? "start" : index === base.length - 1 ? "end" : "middle"}>{dateLabel(base[index]?.date ?? "", bucket, bucket === "month" || spansYears(base)).slice(bucket === "day" && !spansYears(base) ? 5 : 0)}</text>
        ))}
      </svg>
      {hover != null ? (
        <div className="pointer-events-none absolute right-4 top-3 rounded-md border border-line bg-card px-2 py-1 text-xs text-ink shadow">
          <div className="text-muted">{dated(base[hover]?.date ?? "", bucket)}</div>
          {series.map((row) => (
            <div key={row.id}>{t(row.label || "Value")}: {digits ? formatDecimal(row.points[hover]?.value ?? 0, digits) : formatInt(Math.round(row.points[hover]?.value ?? 0))}</div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
