import { useEffect, useMemo, useState } from "react"
import { ArrowDown, ArrowLeftRight, ChevronDown, Settings } from "lucide-react"
import type { Pool } from "../lib/defi.ts"
import { poolPrice } from "../lib/defi.ts"
import { peekAsset } from "../lib/directory.ts"
import { asBig, compactNumber, formatRaw, formatSignificant, percentFromScale, toFloat } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import { localeTag } from "../lib/locale.ts"
import { KeyValue, Panel } from "./widgets.tsx"

const CHARGE_MARKET_FEE = 0x01
const GRAPHENE = 10000n

function marketFeeRaw(assetId: string, gross: bigint): bigint {
  const asset = peekAsset(assetId)
  const flags = Number(asset?.options.flags ?? 0)
  const percent = BigInt(Math.trunc(Number(asset?.options.market_fee_percent ?? 0)))
  if ((flags & CHARGE_MARKET_FEE) === 0 || percent <= 0n || gross <= 0n) return 0n
  let fee = (gross * percent) / GRAPHENE
  const cap = asBig(asset?.options.max_market_fee ?? 0)
  if (cap > 0n && fee > cap) fee = cap
  return fee
}

function decimalToRaw(text: string, precision: number): bigint | null {
  const trimmed = text.trim()
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") return null
  const [whole, frac = ""] = trimmed.split(".")
  const prec = Math.max(0, precision)
  const digits = (frac + "0".repeat(prec)).slice(0, prec)
  let raw = BigInt(whole || "0") * 10n ** BigInt(prec) + BigInt(digits || "0")
  if (frac.length > prec && frac[prec]! >= "5") raw += 1n
  return raw > 0n ? raw : null
}

function rawToInput(raw: bigint, precision: number): string {
  const scale = 10n ** BigInt(Math.max(0, precision))
  const whole = raw / scale
  const frac = precision > 0 ? (raw % scale).toString().padStart(precision, "0").replace(/0+$/, "") : ""
  return frac ? `${whole.toString()}.${frac}` : whole.toString()
}

export type SwapQuote = {
  inputRaw: bigint
  precIn: number
  precOut: number
  takerRaw: bigint
  marketRaw: bigint
  netRaw: bigint
  netFloat: number
  spot: number
  exec: number
  impact: number
}

export function quoteSwap(pool: Pool, sellA: boolean, amountRaw: bigint): SwapQuote | null {
  const assetIn = sellA ? pool.asset_a : pool.asset_b
  const assetOut = sellA ? pool.asset_b : pool.asset_a
  const precIn = peekAsset(assetIn)?.precision ?? 5
  const precOut = peekAsset(assetOut)?.precision ?? 5
  const reserveIn = asBig(sellA ? pool.balance_a : pool.balance_b)
  const reserveOut = asBig(sellA ? pool.balance_b : pool.balance_a)
  if (amountRaw <= 0n || reserveIn <= 0n || reserveOut <= 0n) return null
  const takerPct = BigInt(Math.trunc(Number(pool.taker_fee_percent) || 0))
  const takerRaw = (amountRaw * takerPct) / GRAPHENE
  const sold = amountRaw - takerRaw
  if (sold <= 0n) return null
  const gross = (reserveOut * sold) / (reserveIn + sold)
  const marketRaw = marketFeeRaw(assetOut, gross)
  const netRaw = gross > marketRaw ? gross - marketRaw : 0n

  const scaleIn = 10 ** precIn
  const scaleOut = 10 ** precOut
  const input = Number(amountRaw) / scaleIn
  const poolIn = Number(reserveIn) / scaleIn
  const poolOut = Number(reserveOut) / scaleOut
  const taker = Number(takerPct) / 10000
  const soldF = input * (1 - taker)
  const grossF = (poolOut * soldF) / (poolIn + soldF)
  const outAsset = peekAsset(assetOut)
  const flags = Number(outAsset?.options.flags ?? 0)
  const mPercent = Number(outAsset?.options.market_fee_percent ?? 0)
  let marketF = 0
  if ((flags & CHARGE_MARKET_FEE) !== 0 && mPercent > 0 && grossF > 0) {
    const capRaw = Number(outAsset?.options.max_market_fee ?? 0)
    const cap = capRaw > 0 ? capRaw / scaleOut : Number.POSITIVE_INFINITY
    marketF = Math.min(grossF * (mPercent / 10000), cap)
  }
  const netFloat = Math.max(0, grossF - marketF)
  const spot = poolOut / poolIn
  const beforeFees = (poolOut * input) / (poolIn + input)
  const exec = beforeFees / input
  const impact = spot > 0 ? 1 - beforeFees / (input * spot) : 0
  return { inputRaw: amountRaw, precIn, precOut, takerRaw, marketRaw, netRaw, netFloat, spot, exec, impact }
}

function solveInput(pool: Pool, sellA: boolean, outputRaw: bigint): SwapQuote | null {
  const precIn = peekAsset(sellA ? pool.asset_a : pool.asset_b)?.precision ?? 5
  let low = 0n
  let high = outputRaw > 0n ? outputRaw : 1n
  let found = quoteSwap(pool, sellA, high)
  const ceiling = 10n ** 30n
  while (found && found.netRaw < outputRaw && high < ceiling) {
    high *= 2n
    found = quoteSwap(pool, sellA, high)
  }
  if (!found || found.netRaw < outputRaw) {
    const unit = 10n ** BigInt(precIn)
    high = outputRaw * unit + unit
    found = quoteSwap(pool, sellA, high)
    while (found && found.netRaw < outputRaw && high < ceiling) {
      high *= 2n
      found = quoteSwap(pool, sellA, high)
    }
  }
  if (!found || found.netRaw < outputRaw) return null
  for (let i = 0; i < 80 && high - low > 1n; i += 1) {
    const mid = (low + high) / 2n
    const trial = quoteSwap(pool, sellA, mid)
    if (trial && trial.netRaw >= outputRaw) high = mid
    else low = mid
  }
  return quoteSwap(pool, sellA, high)
}

function formatImpact(impact: number): string {
  if (!Number.isFinite(impact) || impact <= 0) return "<0.01%"
  const pct = impact * 100
  if (pct < 0.01) return `${formatSignificant(pct, 3)}%`
  return `${pct.toLocaleString(localeTag(), { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
}

function formatUsd(value: number): string {
  if (value >= 0.01) return `$${value.toLocaleString(localeTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${formatSignificant(value, 3)}`
}

function reserveHint(raw: string | number, precision: number): string {
  const amount = toFloat(raw, precision)
  if (amount >= 1000) return compactNumber(amount)
  return formatRaw(raw, precision)
}

export function PoolSwap({ pool, btsUsd }: { pool: Pool; btsUsd?: number | null }) {
  const { t } = useI18n()
  const [sellA, setSellA] = useState(true)
  const [field, setField] = useState<"in" | "out">("in")
  const [text, setText] = useState("1")
  const [inverted, setInverted] = useState(false)
  const [open, setOpen] = useState(false)
  const [gear, setGear] = useState(false)
  const [slippageMode, setSlippageMode] = useState<"auto" | "custom">("auto")
  const [slippage, setSlippage] = useState("0.50")

  const symbolA = peekAsset(pool.asset_a)?.symbol ?? "A"
  const symbolB = peekAsset(pool.asset_b)?.symbol ?? "B"
  const precA = peekAsset(pool.asset_a)?.precision ?? 5
  const precB = peekAsset(pool.asset_b)?.precision ?? 5
  const payId = sellA ? pool.asset_a : pool.asset_b
  const recvId = sellA ? pool.asset_b : pool.asset_a
  const paySymbol = sellA ? symbolA : symbolB
  const recvSymbol = sellA ? symbolB : symbolA
  const precPay = sellA ? precA : precB
  const precRecv = sellA ? precB : precA
  const payReserve = sellA ? pool.balance_a : pool.balance_b
  const recvReserve = sellA ? pool.balance_b : pool.balance_a
  const customSlip = Number(slippage)
  const slipPct = slippageMode === "custom" && Number.isFinite(customSlip) && customSlip >= 0 ? Math.min(customSlip, 50) : 0.5
  const slipBps = BigInt(Math.min(10000, Math.round(slipPct * 100)))

  const quote = useMemo(() => {
    const raw = decimalToRaw(text, field === "in" ? precPay : precRecv)
    if (!raw) return null
    return field === "in" ? quoteSwap(pool, sellA, raw) : solveInput(pool, sellA, raw)
  }, [text, field, pool, sellA, precPay, precRecv])

  useEffect(() => {
    if (!gear) return
    const close = () => setGear(false)
    window.addEventListener("pointerdown", close)
    return () => window.removeEventListener("pointerdown", close)
  }, [gear])

  const payText = field === "in" ? text : quote ? rawToInput(quote.inputRaw, quote.precIn) : ""
  const recvText = field === "out" ? text : quote ? rawToInput(quote.netRaw, quote.precOut) : ""
  const payAmount = quote ? Number(quote.inputRaw) / 10 ** quote.precIn : Number(field === "in" ? text : "")
  const recvAmount = quote ? quote.netFloat : Number.NaN
  const usd = (assetId: string, amount: number) => unitUsd(pool, precA, precB, assetId, btsUsd) != null && Number.isFinite(amount) && amount > 0
    ? formatUsd(amount * (unitUsd(pool, precA, precB, assetId, btsUsd) as number))
    : null

  const outPerIn = quote && payAmount > 0 ? quote.netFloat / payAmount : 0
  const rateLabel = outPerIn > 0
    ? inverted
      ? `1 ${recvSymbol} = ${formatSignificant(1 / outPerIn, 6)} ${paySymbol}`
      : `1 ${paySymbol} = ${formatSignificant(outPerIn, 6)} ${recvSymbol}`
    : null
  const minRaw = quote ? (quote.netRaw * (GRAPHENE - slipBps)) / GRAPHENE : null
  const maxRaw = quote ? (quote.inputRaw * (GRAPHENE + slipBps) + GRAPHENE - 1n) / GRAPHENE : null

  return (
    <Panel
      className="relative"
      title="Swap"
      extra={(
        <button
          type="button"
          aria-label={t("Slippage tolerance")}
          aria-expanded={gear}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setGear((value) => !value)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2 text-xs font-medium text-ink hover:bg-canvas"
        >
          <Settings className="h-3.5 w-3.5" />
          {slipPct}%
        </button>
      )}
    >
      {gear ? (
        <div
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute right-3 top-12 z-20 w-[min(18rem,calc(100%-1.5rem))] rounded-lg border border-line bg-card p-3 shadow-lg"
        >
          <div className="mb-2 text-xs text-muted">{t("Slippage tolerance")}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSlippageMode("auto")}
              className={`h-9 rounded-lg border px-3 text-sm font-medium ${slippageMode === "auto" ? "border-link bg-canvas text-ink" : "border-line text-muted"}`}
            >
              {t("Automatic")}
            </button>
            <label className="flex h-9 min-w-0 flex-1 items-center gap-1 rounded-lg border border-line bg-card px-3 text-sm">
              <input
                value={slippageMode === "custom" ? slippage : ""}
                placeholder="0.50"
                inputMode="decimal"
                onFocus={() => setSlippageMode("custom")}
                onChange={(event) => {
                  setSlippageMode("custom")
                  setSlippage(event.target.value)
                }}
                className="w-full bg-transparent text-ink outline-none"
              />
              <span className="text-muted">%</span>
            </label>
          </div>
        </div>
      ) : null}
      <div className="space-y-3 p-4">
        <AmountField
          label={t("You pay")}
          reserve={`${t("Balance")} ${reserveHint(payReserve, precPay)}`}
          value={payText}
          symbol={paySymbol}
          usd={usd(payId, payAmount)}
          onChange={(value) => {
            setField("in")
            setText(value)
          }}
        />
        <div className="flex justify-center">
          <button
            type="button"
            aria-label={t("Flip direction")}
            onClick={() => setSellA((value) => !value)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-card text-muted hover:text-ink"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
        <AmountField
          label={t("You receive")}
          reserve={`${t("Balance")} ${reserveHint(recvReserve, precRecv)}`}
          value={recvText}
          symbol={recvSymbol}
          usd={usd(recvId, recvAmount)}
          onChange={(value) => {
            setField("out")
            setText(value)
          }}
        />
        {rateLabel ? (
          <div className="flex items-center gap-2 text-sm">
            <button type="button" onClick={() => setInverted((value) => !value)} className="inline-flex min-w-0 flex-1 items-center gap-2 text-left text-ink">
              <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted" />
              <span className="truncate font-mono text-xs">{rateLabel}</span>
            </button>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs font-medium text-ink"
            >
              {t("Swap details")}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
        ) : null}
      </div>
      {open && quote ? (
        <>
          <KeyValue rows={[
            { label: "Price impact", value: <span className={quote.impact >= 0.05 ? "text-danger" : ""}>{formatImpact(quote.impact)}</span> },
            { label: "Taker fee", value: `${formatRaw(quote.takerRaw, quote.precIn)} ${paySymbol} (${percentFromScale(Number(pool.taker_fee_percent))})` },
            { label: "Market fee", value: `${formatRaw(quote.marketRaw, quote.precOut)} ${recvSymbol}` },
            {
              label: field === "out" ? "Maximum sent" : "Minimum received",
              value: field === "out"
                ? `${formatRaw(maxRaw ?? 0n, quote.precIn)} ${paySymbol}`
                : `${formatRaw(minRaw ?? 0n, quote.precOut)} ${recvSymbol}`,
            },
            { label: "Max. slippage", value: slippageMode === "auto" ? `${t("Automatic")} · ${slipPct}%` : `${slipPct}%` },
          ]} />
          <p className="border-t border-line px-4 py-3 text-xs text-muted">{t("Price impact is the constant-product move before taker and market fees.")}</p>
        </>
      ) : null}
      <div className="border-t border-line px-4 py-3">
        <button type="button" disabled className="h-10 w-full cursor-not-allowed rounded-lg border border-line text-sm font-medium text-muted">
          {t("Read-only estimate")}
        </button>
      </div>
    </Panel>
  )
}

function unitUsd(pool: Pool, precA: number, precB: number, assetId: string, btsUsd: number | null | undefined): number | null {
  if (btsUsd == null || !Number.isFinite(btsUsd) || btsUsd <= 0) return null
  if (assetId === "1.3.0") return btsUsd
  const spot = poolPrice(pool, precA, precB)
  if (!spot) return null
  if (pool.asset_a === "1.3.0" && assetId === pool.asset_b) return spot * btsUsd
  if (pool.asset_b === "1.3.0" && assetId === pool.asset_a) return btsUsd / spot
  if (peekAsset(assetId)?.symbol === "USD") return 1
  return null
}

function AmountField({
  label,
  reserve,
  value,
  symbol,
  usd,
  onChange,
}: {
  label: string
  reserve: string
  value: string
  symbol: string
  usd: string | null
  onChange: (value: string) => void
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 flex items-center justify-between gap-3 text-muted">
        <span>{label}</span>
        <span className="truncate font-mono text-xs">{reserve}</span>
      </span>
      <span className="flex h-10 items-center rounded-lg border border-line bg-card">
        <input
          value={value}
          placeholder="0"
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))}
          className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-sm text-ink outline-none"
        />
        <span className="h-full border-l border-line px-3 font-mono text-sm leading-10 text-ink">{symbol}</span>
      </span>
      <span className="mt-1 block h-4 text-xs text-muted">{usd ?? ""}</span>
    </label>
  )
}
