import { Check, ChevronDown, Clock, Copy } from "lucide-react"
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { formatScanTime, formatTime, timeAgo, unixTimestamp } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import {
  getTimeMode,
  getTimeView,
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

/** Etherscan-style detail-page timestamp: age + a UTC date button that opens copyable time formats. */
export function TimeDetail({ time }: { time?: string | null }) {
  const { t } = useI18n()
  const now = useContext(NowContext)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  useEffect(() => {
    setOpen(false)
  }, [time])
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const utc = time ? formatScanTime(time, "utc") : "—"
  const local = time ? formatScanTime(time, "local") : "—"
  const unix = time ? unixTimestamp(time) : "—"

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const el = buttonRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.min(19 * 16, window.innerWidth - 16)
      const height = 220
      let left = rect.left
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width)
      if (left < 8) left = 8
      let top = rect.bottom + 4
      if (top + height > window.innerHeight - 8 && rect.top - height - 4 > 8) {
        top = rect.top - height - 4
      }
      setMenuPos({ top, left })
    }
    place()
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if ((event.target as HTMLElement | null)?.closest?.("[data-time-formats]")) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointer)
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", place)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", place)
    }
  }, [open])

  if (!time) return <>—</>

  return (
    <span ref={rootRef} className="relative inline-flex flex-wrap items-center gap-x-2 gap-y-1 break-normal">
      <Clock className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
      <span>{timeAgo(time, now)}</span>
      <span className="relative inline-flex">
        <HoverLabel text={t("Click to show time formats")} disabled={open}>
          <button
            ref={buttonRef}
            type="button"
            aria-label={t("Click to show time formats")}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-line bg-card px-2 py-0.5 text-sm text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:bg-canvas"
          >
            {utc}
            <ChevronDown className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
          </button>
        </HoverLabel>
        {open && menuPos
          ? createPortal(
              <div
                id={menuId}
                data-time-formats=""
                role="dialog"
                aria-label={t("Time Formats")}
                style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 70 }}
                className="w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-card shadow-lg"
              >
                <div className="border-b border-line px-3 py-2 text-sm font-semibold text-ink">{t("Time Formats")}</div>
                <FormatRow label="UTC" value={utc} />
                <FormatRow label={t("Local time")} value={local} />
                <FormatRow label={t("Unix Timestamp")} value={unix} last />
              </div>,
              document.body,
            )
          : null}
      </span>
    </span>
  )
}

function FormatRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-2 px-3 py-2", last ? "" : "border-b border-line")}>
      <div className="min-w-0">
        <div className="text-[11px] leading-4 text-muted">{label}</div>
        <div className="break-all text-sm text-ink">{value}</div>
      </div>
      <FormatCopy value={value} />
    </div>
  )
}

function FormatCopy({ value }: { value: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  const tip = done ? t("Copied!") : t("Copy")
  return (
    <HoverLabel text={tip} immediate>
      <button
        type="button"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-canvas hover:text-link"
        aria-label={tip}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void navigator.clipboard.writeText(value).then(() => {
            setDone(true)
            window.setTimeout(() => setDone(false), 1500)
          })
        }}
      >
        {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </HoverLabel>
  )
}

/** A dark Etherscan-style hover tooltip. `immediate` repositions when the label text changes (Copy → Copied!). */
export function HoverLabel({ text, children, immediate, disabled }: { text: string; children: ReactNode; immediate?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const visible = open && !disabled

  const place = () => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const left = Math.min(Math.max(rect.left + rect.width / 2, 16), Math.max(16, window.innerWidth - 16))
    setCoords({ top: rect.bottom + 6, left })
  }

  useEffect(() => {
    if (visible && immediate) place()
  }, [text, visible, immediate])

  return (
    <span
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => {
        if (disabled) return
        place()
        setOpen(true)
      }}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        if (disabled) return
        place()
        setOpen(true)
      }}
      onBlur={() => setOpen(false)}
    >
      {children}
      {visible && coords
        ? createPortal(
            <span
              role="tooltip"
              style={{ position: "fixed", top: coords.top, left: coords.left, transform: "translateX(-50%)", zIndex: 80 }}
              className="pointer-events-none max-w-[min(20rem,calc(100vw-16px))] whitespace-pre-line rounded-md bg-[#1e2329] px-2 py-1 text-center text-[11px] leading-snug text-white shadow-lg"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
