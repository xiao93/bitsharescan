export type TimeMode = "utc" | "local"

const KEY = "bitscan.time"
const listeners = new Set<(mode: TimeMode) => void>()

function readMode(): TimeMode {
  try {
    return localStorage.getItem(KEY) === "local" ? "local" : "utc"
  } catch {
    return "utc"
  }
}

let current: TimeMode = readMode()

export function getTimeMode(): TimeMode {
  return current
}

export function setTimeMode(mode: TimeMode) {
  current = mode
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* ignore */
  }
  for (const listener of listeners) listener(mode)
}

export function subscribeTimeMode(listener: (mode: TimeMode) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function localTimeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"
  } catch {
    return "Local"
  }
}

export function localOffsetLabel(at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "longOffset", hour: "2-digit" }).formatToParts(at)
    const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT"
    return normalizeOffset(raw)
  } catch {
    const minutes = -at.getTimezoneOffset()
    const sign = minutes >= 0 ? "+" : "-"
    const abs = Math.abs(minutes)
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`
  }
}

export function timeZoneSuffix(at = new Date()): string {
  if (current === "utc") return "UTC"
  return localOffsetLabel(at)
}

function normalizeOffset(raw: string): string {
  const text = raw.replace(/^GMT/, "UTC")
  if (text === "UTC") return "UTC+00:00"
  const match = text.match(/^UTC([+-])(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return text
  return `UTC${match[1]}${match[2]!.padStart(2, "0")}:${match[3] ?? "00"}`
}

/** Etherscan-style Age <-> Date Time view, shared by every timestamp on the site. */
export type TimeView = "age" | "date"

const VIEW_KEY = "bitscan.timeview"
const viewListeners = new Set<(view: TimeView) => void>()

function readView(): TimeView {
  try {
    return localStorage.getItem(VIEW_KEY) === "date" ? "date" : "age"
  } catch {
    return "age"
  }
}

let currentView: TimeView = readView()

export function getTimeView(): TimeView {
  return currentView
}

export function setTimeView(view: TimeView) {
  currentView = view
  try {
    localStorage.setItem(VIEW_KEY, view)
  } catch {
    /* ignore */
  }
  for (const listener of viewListeners) listener(view)
}

export function subscribeTimeView(listener: (view: TimeView) => void) {
  viewListeners.add(listener)
  return () => {
    viewListeners.delete(listener)
  }
}
