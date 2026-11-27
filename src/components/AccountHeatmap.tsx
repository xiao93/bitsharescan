import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarDays } from "lucide-react"
import { useTimeMode } from "./Now.tsx"
import { ErrorBox } from "./widgets.tsx"
import { useQuery } from "../hooks/useQuery.ts"
import { formatInt } from "../lib/format.ts"
import { fetchAccountActiveYears, fetchAccountActivityDays, type ActivityDay } from "../lib/history.ts"
import { useI18n } from "../lib/i18n.tsx"
import { localeTag } from "../lib/locale.ts"
import { localOffsetLabel, localTimeZoneName } from "../lib/timePref.ts"
import { cn } from "../lib/utils.ts"

const DAY = 86400000
const CELL = 13
const GAP = 3

/** "YYYY-MM-DD" for `at` in an IANA zone (or UTC). */
function dateIn(zone: string, at = new Date()): string {
  if (zone === "UTC") return at.toISOString().slice(0, 10)
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)
/** 0 = Monday … 6 = Sunday */
const weekday = (date: string) => (new Date(toMs(date)).getUTCDay() + 6) % 7

type Range = { key: string; start: string; end: string }

function rangeFor(key: string, today: string): Range {
  if (key === "last") return { key, start: fromMs(toMs(today) - 364 * DAY), end: today }
  const year = Number(key)
  const end = `${year}-12-31` < today ? `${year}-12-31` : today
  return { key, start: `${year}-01-01`, end }
}

type Cell = { date: string; ops: number; inRange: boolean }

function buildGrid(range: Range, days: ActivityDay[]): Cell[][] {
  const counts = new Map(days.map((day) => [day.date, day.ops]))
  const first = toMs(range.start) - weekday(range.start) * DAY
  const last = toMs(range.end) + (6 - weekday(range.end)) * DAY
  const weeks: Cell[][] = []
  for (let ms = first; ms <= last; ms += 7 * DAY) {
    const week: Cell[] = []
    for (let i = 0; i < 7; i++) {
      const date = fromMs(ms + i * DAY)
      const inRange = date >= range.start && date <= range.end
      week.push({ date, ops: inRange ? counts.get(date) ?? 0 : 0, inRange })
    }
    weeks.push(week)
  }
  return weeks
}

/** Quartile thresholds over the non-zero days, so busy and quiet accounts both get a readable scale. */
function thresholds(days: ActivityDay[]): number[] {
  const values = days.map((day) => day.ops).filter((n) => n > 0).sort((a, b) => a - b)
  if (!values.length) return [1, 1, 1]
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]!
  return [at(0.25), at(0.5), at(0.75)]
}

function level(ops: number, cuts: number[]): number {
  if (ops <= 0) return 0
  if (ops <= cuts[0]!) return 1
  if (ops <= cuts[1]!) return 2
  if (ops <= cuts[2]!) return 3
  return 4
}

const LEVELS = ["bg-line", "bg-link/25", "bg-link/50", "bg-link/75", "bg-link"]

export function AccountHeatmap({ accountId }: { accountId: string }) {
  const { t, lang } = useI18n()
  const mode = useTimeMode()
  const zone = mode === "local" ? localTimeZoneName() : "UTC"
  const zoneLabel = mode === "local" ? `${localTimeZoneName()} (${localOffsetLabel()})` : "UTC"
  const today = dateIn(zone)
  const [rangeKey, setRangeKey] = useState("last")
  const range = rangeFor(rangeKey, today)
  const years = useQuery(() => fetchAccountActiveYears(accountId, zone), [accountId, zone])
  const days = useQuery(() => fetchAccountActivityDays(accountId, range.start, range.end, zone), [accountId, range.start, range.end, zone])
  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null)

  useEffect(() => {
    setRangeKey("last")
  }, [accountId])

  useEffect(() => {
    if (!tip) return
    const hide = () => setTip(null)
    window.addEventListener("scroll", hide, true)
    window.addEventListener("resize", hide)
    return () => {
      window.removeEventListener("scroll", hide, true)
      window.removeEventListener("resize", hide)
    }
  }, [tip])

  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // On narrow screens start at the newest weeks, like GitHub.
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [days.data])

  const rows = days.data ?? []
  const weeks = useMemo(() => buildGrid(range, rows), [range.start, range.end, rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const cuts = useMemo(() => thresholds(rows), [rows])
  const total = rows.reduce((sum, day) => sum + day.ops, 0)
  const busiest = rows.reduce<ActivityDay | null>((best, day) => (!best || day.ops > best.ops ? day : best), null)
  const locale = localeTag(lang)
  const monthFmt = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
  const fmtDay = (date: string) => dayFmt.format(new Date(toMs(date)))

  const monthLabels: { index: number; label: string }[] = []
  weeks.forEach((week, index) => {
    const firstOfMonth = week.find((cell) => cell.inRange && cell.date.endsWith("-01"))
    const label = firstOfMonth ? monthFmt.format(new Date(toMs(firstOfMonth.date))) : index === 0 ? monthFmt.format(new Date(toMs(range.start))) : null
    if (label && !(index === 0 && weeks.length > 1 && weeks[1]!.some((cell) => cell.inRange && cell.date.endsWith("-01")))) monthLabels.push({ index, label })
  })

  const options = [{ key: "last", label: t("Last 12 months") }, ...(years.data ?? []).map((year) => ({ key: String(year), label: String(year) }))]
  const periodLabel = rangeKey === "last" ? t("in the last 12 months") : t("in {year}", { year: rangeKey })

  return (
    <div className="px-4 py-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CalendarDays className="h-4 w-4 text-muted" />
            {t("Transaction Heatmap")}
          </h3>
          <p className="mt-1 text-xs text-muted">{t("Operations per day involving this account · days in {zone}", { zone: zoneLabel })}</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Period")}>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setRangeKey(option.key)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                option.key === rangeKey ? "border-link bg-link text-white" : "border-line text-muted hover:bg-row hover:text-ink",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {days.error ? <ErrorBox message={days.error} onRetry={days.reload} /> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Stat label={t("Active days")} value={days.loading ? "…" : formatInt(rows.length)} sub={periodLabel} />
            <Stat label={t("Total operations")} value={days.loading ? "…" : formatInt(total)} sub={periodLabel} />
            <Stat
              label={t("Busiest day")}
              value={days.loading ? "…" : busiest ? formatInt(busiest.ops) : "—"}
              sub={busiest && !days.loading ? fmtDay(busiest.date) : periodLabel}
            />
          </div>
          <div ref={scroller} dir="ltr" className={cn("overflow-x-auto pb-2", days.loading && "animate-pulse opacity-60")}>
            <div className="inline-block">
              <div className="relative ml-8 h-4 text-[10px] text-muted" style={{ width: weeks.length * (CELL + GAP) }}>
                {monthLabels.map((month) => (
                  <span key={`${month.index}-${month.label}`} className="absolute top-0 whitespace-nowrap" style={{ left: month.index * (CELL + GAP) }}>
                    {month.label}
                  </span>
                ))}
              </div>
              <div className="flex">
                <div className="mr-1 flex w-7 flex-col text-[10px] text-muted" style={{ gap: GAP }}>
                  {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                    <span key={index} className="leading-none" style={{ height: CELL, lineHeight: `${CELL}px` }}>
                      {index % 2 === 0 ? new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + index))) : ""}
                    </span>
                  ))}
                </div>
                <div className="flex" style={{ gap: GAP }}>
                  {weeks.map((week) => (
                    <div key={week[0]!.date} className="flex flex-col" style={{ gap: GAP }}>
                      {week.map((cell) =>
                        cell.inRange ? (
                          <span
                            key={cell.date}
                            role="img"
                            aria-label={`${fmtDay(cell.date)}: ${cell.ops}`}
                            className={cn("rounded-[2px] ring-link/60 hover:ring-1", days.loading ? "bg-line" : LEVELS[level(cell.ops, cuts)])}
                            style={{ width: CELL, height: CELL }}
                            onMouseEnter={(event) => {
                              if (days.loading) return
                              const rect = event.currentTarget.getBoundingClientRect()
                              const left = Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90)
                              setTip({
                                text: `${t(cell.ops === 1 ? "{n} operation" : "{n} operations", { n: formatInt(cell.ops) })} · ${fmtDay(cell.date)}`,
                                top: rect.top - 6,
                                left,
                              })
                            }}
                            onMouseLeave={() => setTip(null)}
                          />
                        ) : (
                          <span key={cell.date} style={{ width: CELL, height: CELL }} />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>{t("Source: BitShares Elasticsearch operation index")}</span>
            <span className="flex items-center gap-1">
              {t("Less")}
              {LEVELS.map((cls) => <span key={cls} className={cn("inline-block rounded-[2px]", cls)} style={{ width: CELL, height: CELL }} />)}
              {t("More")}
            </span>
          </div>
        </>
      )}
      {tip
        ? createPortal(
            <span
              role="tooltip"
              style={{ position: "fixed", top: tip.top, left: tip.left, transform: "translate(-50%, -100%)", zIndex: 60 }}
              className="pointer-events-none whitespace-nowrap rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-ink shadow-lg"
            >
              {tip.text}
            </span>,
            document.body,
          )
        : null}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-muted">{sub}</div>
    </div>
  )
}
