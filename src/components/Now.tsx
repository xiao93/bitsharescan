import { Clock } from "lucide-react"
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { formatTime, timeAgo } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import {
  getTimeMode,
  getTimeView,
  setTimeMode,
  setTimeView,
  subscribeTimeMode,
  subscribeTimeView,
  timeZoneSuffix,
  type TimeMode,
  type TimeView,
} from "../lib/timePref.ts"
import { cn } from "../lib/utils.ts"

const NowContext = createContext(Date.now())

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000)
    return () => window.clearInterval(timer)
  }, [])
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>
}

export function useTimeMode(): TimeMode {
  const [mode, setMode] = useState(getTimeMode)
  useEffect(() => subscribeTimeMode(setMode), [])
  return mode
}

export function useTimeView(): TimeView {
  const [view, setView] = useState(getTimeView)
  useEffect(() => subscribeTimeView(setView), [])
  return view
}

/**
 * A timestamp in a table or list. Follows the site-wide Age / Date Time view
 * (toggled from a column header or a detail page); `compact` places always show the age.
 */
export function TimeAgo({ time, className, compact }: { time?: string | null; className?: string; compact?: boolean }) {
  const now = useContext(NowContext)
  const view = useTimeView()
  useTimeMode()
  if (!time) return <span className={className}>—</span>
  if (view === "date" && !compact) {
    return (
      <span className={className} title={timeAgo(time, now)}>
        {formatTime(time, false)}
      </span>
    )
  }
  return (
    <span className={className} title={formatTime(time)}>
      {timeAgo(time, now)}
    </span>
  )
}

/** Column header that flips every timestamp on the site between Age and Date Time (like Etherscan). */
export function TimeHead({ className }: { className?: string }) {
  const { t } = useI18n()
  const view = useTimeView()
  useTimeMode()
  return (
    <button
      type="button"
      onClick={() => setTimeView(view === "age" ? "date" : "age")}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap font-medium [letter-spacing:inherit] [text-transform:inherit] hover:text-link", className)}
      title={t("Click to switch between age and date time")}
      aria-label={t("Click to switch between age and date time")}
    >
      {view === "age" ? t("Age") : `${t("Date Time")} (${timeZoneSuffix()})`}
      <Clock className="h-3 w-3 opacity-70" aria-hidden="true" />
    </button>
  )
}

/** A timestamp on a detail page: a clock button flips the leading form; the other form follows in brackets. */
export function TimeDetail({ time }: { time?: string | null }) {
  const { t } = useI18n()
  const now = useContext(NowContext)
  const view = useTimeView()
  const mode = useTimeMode()
  if (!time) return <>—</>
  const age = timeAgo(time, now)
  const date = formatTime(time)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => setTimeView(view === "age" ? "date" : "age")}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-canvas hover:text-link"
        title={t("Click to switch between age and date time")}
        aria-label={t("Click to switch between age and date time")}
      >
        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <span>{view === "age" ? age : date}</span>
      <span className="text-muted">({view === "age" ? date : age})</span>
      <button
        type="button"
        onClick={() => setTimeMode(mode === "utc" ? "local" : "utc")}
        className="rounded border border-line px-1.5 py-0.5 text-[11px] leading-none text-muted hover:text-link"
        title={t("Switch between UTC and local time")}
        aria-label={t("Switch between UTC and local time")}
      >
        {mode === "utc" ? "UTC" : t("Local")}
      </button>
    </span>
  )
}
