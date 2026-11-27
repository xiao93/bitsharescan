import { getLanguage, localeTag, type Lang } from "./locale.ts"
import { getTimeMode, timeZoneSuffix } from "./timePref.ts"

function numberLocale() {
  return localeTag()
}

function isCjk() {
  const lang = getLanguage()
  return lang === "zh" || lang === "zh-TW" || lang === "ja" || lang === "ko"
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
  const lang = getLanguage()
  const loc = numberLocale()
  const compactFrom = lang === "en" || lang === "ru" ? 1e3 : 1e4
  if (Math.abs(value) < compactFrom) return value.toLocaleString(loc, { maximumFractionDigits: 2 })
  return new Intl.NumberFormat(loc, { notation: "compact", compactDisplay: "short", maximumFractionDigits: 2 }).format(value)
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
    month: isCjk() ? "2-digit" : "short",
    day: isCjk() ? "2-digit" : "numeric",
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
  const rtf = new Intl.RelativeTimeFormat(numberLocale(), { numeric: "always" })
  if (sec < 60) return rtf.format(-sec, "second")
  const min = Math.floor(sec / 60)
  if (min < 60) return rtf.format(-min, "minute")
  const hr = Math.floor(min / 60)
  if (hr < 48) return rtf.format(-hr, "hour")
  const day = Math.floor(hr / 24)
  if (day < 60) return rtf.format(-day, "day")
  return formatTime(iso)
}

export function shortHash(value: string | null | undefined, left = 10, right = 8): string {
  if (!value) return "—"
  if (value.length <= left + right + 1) return value
  return `${value.slice(0, left)}…${value.slice(-right)}`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—"
  const loc = numberLocale()
  const unit = (count: number, name: "day" | "hour" | "minute" | "second") =>
    new Intl.NumberFormat(loc, { style: "unit", unit: name, unitDisplay: "long" }).format(count)
  if (seconds % 86400 === 0 && seconds >= 86400) return unit(seconds / 86400, "day")
  if (seconds % 3600 === 0 && seconds >= 3600) return unit(seconds / 3600, "hour")
  if (seconds % 60 === 0 && seconds >= 60) return unit(seconds / 60, "minute")
  return unit(seconds, "second")
}

export function percentFromScale(value: number, denom = 10000): string {
  if (!Number.isFinite(value)) return "—"
  return `${(value / denom) * 100}%`
}

/** BitShares fee rates use 10,000 = 100%. Pool fees, SameT fees, and credit rates share this scale. */
export function protocolPercent(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return "—"
  return `${(n / 100).toLocaleString(numberLocale(), { maximumFractionDigits: 2 })}%`
}

const MEMBERSHIP: Record<Lang, { lifetime: string; basic: string; annual: string }> = {
  en: { lifetime: "Lifetime", basic: "Basic", annual: "Annual" },
  zh: { lifetime: "终身", basic: "普通", annual: "年费" },
  "zh-TW": { lifetime: "終身", basic: "普通", annual: "年費" },
  ko: { lifetime: "평생", basic: "일반", annual: "연간" },
  ru: { lifetime: "Пожизненный", basic: "Базовый", annual: "Годовой" },
  ja: { lifetime: "生涯会員", basic: "一般", annual: "年会費" },
}

export function membershipOf(expiration: string | undefined): { label: string; className: string } {
  const t = parseChainTime(expiration)
  const labels = MEMBERSHIP[getLanguage()]
  if (!expiration || expiration.startsWith("2106") || (Number.isFinite(t) && new Date(t).getUTCFullYear() >= 2100)) {
    return { label: labels.lifetime, className: "bg-[#e7f6ef] text-success" }
  }
  if (!Number.isFinite(t) || t < Date.now()) {
    return { label: labels.basic, className: "bg-canvas text-muted" }
  }
  return { label: labels.annual, className: "bg-[#e8f4fb] text-link" }
}
