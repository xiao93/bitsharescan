import { getLanguage } from "./locale.ts"
import { getTimeMode, timeZoneSuffix } from "./timePref.ts"

function isZh() {
  return getLanguage() === "zh"
}

function numberLocale() {
  return isZh() ? "zh-CN" : "en-US"
}

export function asBig(value: string | number | bigint | null | undefined): bigint {
  if (typeof value === "bigint") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n
    return BigInt(Math.trunc(value))
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim())
  return 0n
}

export function groupInt(value: string): string {
  const neg = value.startsWith("-")
  const digits = neg ? value.slice(1) : value
  const body = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return neg ? `-${body}` : body
}

export function formatInt(value: string | number | bigint | null | undefined): string {
  return groupInt(asBig(value).toString())
}

export function formatRaw(
  amount: string | number | bigint | null | undefined,
  precision: number,
  trim = true,
): string {
  if (amount == null || amount === "") return "—"
  if (typeof amount === "string" && !/^-?\d+$/.test(amount.trim())) return amount
  const bi = asBig(amount)
  const neg = bi < 0n
  const v = neg ? -bi : bi
  const prec = Math.max(0, precision)
  const scale = 10n ** BigInt(prec)
  const whole = v / scale
  let frac = prec > 0 ? (v % scale).toString().padStart(prec, "0") : ""
  if (trim) frac = frac.replace(/0+$/, "")
  const body = frac ? `${groupInt(whole.toString())}.${frac}` : groupInt(whole.toString())
  return neg ? `-${body}` : body
}

/** Voting stake stored as core satoshis, always shown with 5 decimal places. */
export function formatStake(amount: string | number | bigint | null | undefined): string {
  return formatRaw(amount, 5, false)
}

export function toFloat(amount: string | number | bigint | null | undefined, precision: number): number {
  const bi = asBig(amount)
  const neg = bi < 0n
  const v = neg ? -bi : bi
  const scale = 10n ** BigInt(Math.max(precision, 0))
  const whole = Number(v / scale)
  const frac = Number(v % scale) / Number(scale)
  return (neg ? -1 : 1) * (whole + frac)
}

export function formatSignificant(value: number, digits = 8): string {
  if (!Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  if (abs === 0) return "0"
  if (abs >= 1) return value.toLocaleString(numberLocale(), { maximumFractionDigits: 2 })
  return value.toLocaleString(numberLocale(), { maximumSignificantDigits: digits })
}

/** Decimal places for one market price: about six significant digits, with an extra place from 100 to 9,999. */
export function priceFractionDigits(typical: number, assetPrecision = 8): number {
  const cap = Math.max(8, Math.max(0, assetPrecision))
  if (!(typical > 0) || !Number.isFinite(typical)) return Math.min(4, cap)
  const mag = Math.floor(Math.log10(typical))
  const sig = typical >= 100 && typical < 10_000 ? 7 : 6
  return Math.max(0, Math.min(cap, sig - 1 - mag))
}

/** One fixed count for an amount or total column, never past the asset precision. */
export function columnFractionDigits(precision: number, typical: number, mode: "amount" | "total"): number {
  const cap = Math.max(0, Math.min(8, precision))
  if (mode === "total") return cap
  if (!(typical > 0) || !Number.isFinite(typical) || typical >= 1) return Math.min(cap, 4)
  const mag = Math.floor(Math.log10(typical))
  return Math.min(cap, Math.max(4, 4 - mag))
}

export function formatFixed(value: number | null | undefined, digits: number): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"
  const places = Math.max(0, Math.min(12, digits))
  return n.toLocaleString(numberLocale(), { minimumFractionDigits: places, maximumFractionDigits: places })
}

export function formatDecimal(value: string | number | null | undefined, maxDigits = 8): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"
  const abs = Math.abs(n)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : maxDigits
  return n.toLocaleString(numberLocale(), { maximumFractionDigits: digits })
}

export function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const sign = value < 0 ? "-" : ""
  const v = Math.abs(value)
  if (isZh()) {
    if (v >= 1e8) return `${sign}${(v / 1e8).toFixed(2)}亿`
    if (v >= 1e4) return `${sign}${(v / 1e4).toFixed(v >= 1e6 ? 2 : 2)}万`
    return `${sign}${v.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`
  }
  const unit = (div: number, suffix: string, places: number) => `${sign}${(v / div).toFixed(places)}${suffix}`
  if (v >= 1e12) return unit(1e12, "T", 2)
  if (v >= 1e9) return unit(1e9, "B", v >= 10e9 ? 2 : 3)
  if (v >= 1e6) return unit(1e6, "M", 2)
  if (v >= 1e3) return unit(1e3, "K", v >= 10e3 ? 1 : 2)
  return `${sign}${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

export function compactUsd(value: number): string {
  if (!Number.isFinite(value)) return "—"
  const sign = value < 0 ? "-" : ""
  return `${sign}$${compactNumber(Math.abs(value)).replace(/^-/, "")}`
}

export function parseChainTime(iso: string | null | undefined): number {
  if (!iso) return Number.NaN
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) return Date.parse(iso)
  return Date.parse(`${iso}Z`)
}

export function formatTime(iso: string | null | undefined): string {
  const t = parseChainTime(iso)
  if (!Number.isFinite(t)) return "—"
  const when = new Date(t)
  const formatted = when.toLocaleString(numberLocale(), {
    year: "numeric",
    month: isZh() ? "2-digit" : "short",
    day: isZh() ? "2-digit" : "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: getTimeMode() === "utc" ? "UTC" : undefined,
  })
  return `${formatted} ${timeZoneSuffix(when)}`
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  const t = parseChainTime(iso)
  if (!Number.isFinite(t)) return "—"
  const sec = Math.max(0, Math.round((now - t) / 1000))
  if (isZh()) {
    if (sec < 60) return `${sec} 秒前`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min} 分钟前`
    const hr = Math.floor(min / 60)
    if (hr < 48) return `${hr} 小时前`
    const day = Math.floor(hr / 24)
    if (day < 60) return `${day} 天前`
    return formatTime(iso)
  }
  if (sec < 60) return `${sec} sec${sec === 1 ? "" : "s"} ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr} hr${hr === 1 ? "" : "s"} ago`
  const day = Math.floor(hr / 24)
  if (day < 60) return `${day} day${day === 1 ? "" : "s"} ago`
  return formatTime(iso)
}

export function shortHash(value: string | null | undefined, left = 10, right = 8): string {
  if (!value) return "—"
  if (value.length <= left + right + 1) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—"
  const zh = isZh()
  if (seconds % 86400 === 0 && seconds >= 86400) {
    const days = seconds / 86400
    return zh ? `${days} 天` : `${days} day${days === 1 ? "" : "s"}`
  }
  if (seconds % 3600 === 0 && seconds >= 3600) {
    const hours = seconds / 3600
    return zh ? `${hours} 小时` : `${hours} hour${hours === 1 ? "" : "s"}`
  }
  if (seconds % 60 === 0 && seconds >= 60) {
    const mins = seconds / 60
    return zh ? `${mins} 分钟` : `${mins} min`
  }
  return zh ? `${seconds} 秒` : `${seconds} sec`
}

export function percentFromScale(value: number, denom = 10000): string {
  if (!Number.isFinite(value)) return "—"
  return `${(value / denom) * 100}%`
}

/** BitShares fee rates use 10,000 = 100%. Pool fees, SameT fees, and credit rates share this scale. */
export function protocolPercent(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"
  return `${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`
}

export function membershipOf(expiration: string | undefined): { label: string; className: string } {
  const t = parseChainTime(expiration)
  if (!expiration || expiration.startsWith("2106") || (Number.isFinite(t) && new Date(t).getUTCFullYear() >= 2100)) {
    return { label: isZh() ? "终身" : "Lifetime", className: "bg-[#e7f6ef] text-success" }
  }
  if (!Number.isFinite(t) || t < Date.now()) {
    return { label: isZh() ? "普通" : "Basic", className: "bg-canvas text-muted" }
  }
  return { label: isZh() ? "年费" : "Annual", className: "bg-[#e8f4fb] text-link" }
}
