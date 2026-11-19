import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { formatTime, timeAgo } from "../lib/format.ts"
import { getTimeMode, subscribeTimeMode, type TimeMode } from "../lib/timePref.ts"

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

export function TimeAgo({ time, className }: { time?: string | null; className?: string }) {
  const now = useContext(NowContext)
  if (!time) return <span className={className}>—</span>
  return (
    <span className={className} title={formatTime(time)}>
      {timeAgo(time, now)}
    </span>
  )
}
