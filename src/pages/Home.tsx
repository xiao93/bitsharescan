import { ArrowLeftRight, Box } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { HeroAd, heroAdEmpty } from "../components/HeroAd.tsx"
import { SearchBar } from "../components/SearchBar.tsx"
import { TimeAgo } from "../components/Now.tsx"
import { AccountLink, ErrorBox, LineChart, LoadingBlock, OpSummary, Panel, TxLink, TypeBadge } from "../components/widgets.tsx"
import { blockFeeText, fetchBlocks, fetchChainId, fetchDynamic, fetchGlobal, type BlockRow, type DynamicGlobal, type GlobalProps } from "../lib/chain.ts"
import { db } from "../lib/node.ts"
import { asBig, compactNumber, compactUsd, formatDecimal, formatInt, formatRaw, toFloat } from "../lib/format.ts"
import { fetchDefiStats, type DefiStats } from "../lib/defi.ts"
import { fetchDailyOps, fetchLatestTransactions, fetchOperationTotal } from "../lib/history.ts"
import type { OpView } from "../lib/ops.ts"
import { cleanError, linkClass } from "../lib/utils.ts"
import { useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { coreSymbol, networkHasEs, networkInfo } from "../lib/network.ts"
import { fetchBtsUsd, priceHint, type BtsUsd } from "../lib/usd.ts"

export default function Home() {
  const { t } = useI18n()
  useTitle("")
  const [dgp, setDgp] = useState<DynamicGlobal | null>(null)
  const [global, setGlobal] = useState<GlobalProps | null>(null)
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [txs, setTxs] = useState<OpView[]>([])
  const [chart, setChart] = useState<{ date: string; ops: number }[]>([])
  const [price, setPrice] = useState<number | null>(null)
  const [priceSource, setPriceSource] = useState("")
  const [quoteInfo, setQuoteInfo] = useState<BtsUsd | null>(null)
  const [supply, setSupply] = useState<string | number | null>(null)
  const [defi, setDefi] = useState<DefiStats | null>(null)
  const [chainId, setChainId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [chartError, setChartError] = useState<string | null>(null)
  const [totalOps, setTotalOps] = useState<number | null>(null)
  const [accounts, setAccounts] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const chainRef = useRef("")
  const supplyRef = useRef<string | number | null>(null)

  useEffect(() => {
    let stop = false
    let timer = 0
    let lastHead = 0
    let lastSlow = 0
    const tick = async () => {
      try {
        const next = await fetchDynamic()
        if (stop) return
        setDgp(next)
        setError(null)
        const headChanged = next.head_block_number !== lastHead
        const slow = Date.now() - lastSlow > 30_000
        if (headChanged) {
          lastHead = next.head_block_number
          const nums = Array.from({ length: 6 }, (_, index) => next.head_block_number - index).filter((num) => num > 0)
          const [nextBlocks, nextTxs] = await Promise.all([
            fetchBlocks(nums),
            fetchLatestTransactions(6, 1).catch((err: unknown) => {
              if (!stop) setTxError(cleanError(err))
              return null
            }),
          ])
          if (stop) return
          setBlocks(nextBlocks)
          if (nextTxs) {
            setTxs(nextTxs.rows)
            setTxError(null)
          }
        }
        if (slow || lastSlow === 0) {
          lastSlow = Date.now()
          const [quote, props, id, asset, accountCount] = await Promise.all([
            fetchBtsUsd().catch((): BtsUsd => ({ price: null, source: "", anchor: null })),
            fetchGlobal().catch(() => null),
            chainRef.current ? Promise.resolve(chainRef.current) : fetchChainId().catch(() => ""),
            supplyRef.current == null ? fetchDynamicSupply().catch(() => null) : Promise.resolve(supplyRef.current),
            db<number>("get_account_count", []).catch(() => null),
          ])
          if (stop) return
          if (quote.price != null && quote.price > 0) {
            setPrice(quote.price)
            setPriceSource(quote.source)
            setQuoteInfo(quote)
          }
          if (props) setGlobal(props)
          if (id) {
            chainRef.current = id
            setChainId(id)
          }
          if (asset != null) {
            supplyRef.current = asset
            setSupply(asset)
          }
          if (typeof accountCount === "number") setAccounts(accountCount)
        }
        if (!stop) setLoading(false)
      } catch (err) {
        if (!stop) {
          setError(cleanError(err))
          setLoading(false)
        }
      } finally {
        if (!stop) timer = window.setTimeout(() => void tick(), 3000)
      }
    }
    void tick()
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    let stop = false
    fetchDefiStats().then(
      (stats) => {
        if (!stop) setDefi(stats)
      },
      () => {
        if (!stop) setDefi(null)
      },
    )
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    let stop = false
    if (!networkHasEs()) return
    fetchOperationTotal().then(
      (value) => {
        if (!stop && value != null) setTotalOps(value)
      },
      () => {
        /* the chart already explains a missing index */
      },
    )
    return () => {
      stop = true
    }
  }, [])

  useEffect(() => {
    let stop = false
    const load = () => {
      fetchDailyOps(14).then(
        (rows) => {
          if (!stop) {
            setChart(rows)
            setChartError(null)
          }
        },
        (err: unknown) => {
          if (!stop) setChartError(cleanError(err))
        },
      )
    }
    load()
    const timer = window.setInterval(load, 60_000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [])

  const core = coreSymbol()
  const net = networkInfo()
  const supplyWhole = supply == null ? null : asBig(supply) / 100000n
  const btsFloat = supply == null ? null : toFloat(supply, 5)
  const marketCap = btsFloat != null && price != null ? btsFloat * price : null
  const today = chart.at(-1)
  const historyGap = !networkHasEs()
  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const elapsed = Math.max(1, (Date.now() - dayStart.getTime()) / 1000)
  const opsRate = today ? today.ops / elapsed : null
  const blockInterval = global?.parameters.block_interval
  const transferRaw = transferBaseFee(global)
  const transferCore = transferRaw == null ? null : toFloat(transferRaw, 5)
  const transferUsd = transferCore != null && price != null ? transferCore * price : null

  return (
    <div>
      <section className="hero-band mb-3 rounded-xl border border-line px-4 py-2.5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-4">
          <div className="min-w-0 md:w-2/3">
            <div className="mb-1.5 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                <span className="shrink-0 text-xs font-medium text-link">
                  {t(net.label)}
                  {chainId ? <span className="font-mono font-normal text-muted"> {chainId.slice(0, 8)}…{chainId.slice(-4)}</span> : null}
                </span>
              </span>
              <h1 className="text-base font-semibold leading-snug tracking-tight text-ink sm:truncate sm:text-lg">{t("The BitShares Blockchain Explorer")}</h1>
            </div>
            <SearchBar id="hero-search" />
          </div>
          <div className={`${heroAdEmpty() ? "bx-ad " : ""}flex shrink-0 md:w-1/3 md:justify-end`}>
            <HeroAd />
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      <section className="mb-3 overflow-hidden rounded-xl border border-line bg-card">
        <div className="grid divide-y divide-line lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          <div className="grid grid-cols-2 gap-3 px-4 py-3 lg:grid-cols-1 lg:content-center">
            <Link to="/charts/bts-price" className="group block min-w-0 cursor-pointer" title={priceSource || undefined}>
              <Stat
                label={t("{sym} price", { sym: core })}
                value={price == null ? "—" : `$${formatDecimal(price, 6)}`}
                title={priceSource}
                hint={price == null ? null : priceHint(quoteInfo, t)}
              />
            </Link>
            <Stat
              label={t("Market cap")}
              value={marketCap == null ? "—" : compactUsd(marketCap)}
              hint={supplyWhole == null ? null : t("{n} {sym} supply", { n: formatInt(supplyWhole), sym: core })}
            />
          </div>
          <div className="divide-y divide-line">
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <Stat
                label={t("Operations")}
                value={totalOps != null ? `${formatDecimal(totalOps / 1_000_000, 2)} M` : "—"}
                title={t("Approximate: Elasticsearch cardinality estimate of non-virtual operations")}
                hint={opsRate == null ? (historyGap ? null : t("All time")) : t("{rate} ops/s", { rate: opsRate.toFixed(2) })}
              />
              <Link to="/network" className="group shrink-0 cursor-pointer text-end" title={priceSource || undefined}>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("Transfer cost")}</div>
                <div className="mt-0.5 text-sm font-semibold leading-tight text-ink group-hover:text-link">{transferUsd == null ? "—" : `$${formatDecimal(transferUsd, transferUsd < 0.01 ? 6 : 2)}`}</div>
                <div className="text-[11px] leading-snug text-muted">{transferCore == null ? t("Fee schedule") : `${formatRaw(transferRaw ?? 0, 5)} ${core}`}</div>
              </Link>
            </div>
            <div className="flex items-start justify-between gap-4 px-4 py-3">
              <Stat
                label={t("Head block")}
                value={dgp ? `#${formatInt(dgp.head_block_number)}` : "—"}
                hint={
                  dgp ? (
                    <>
                      <TimeAgo compact time={dgp.time} />
                      {` · ${t("Irreversible {n}", { n: formatInt(dgp.last_irreversible_block_num) })}`}
                      {blockInterval ? ` · ${blockInterval}s` : ""}
                    </>
                  ) : (
                    t("Waiting for the node")
                  )
                }
              />
              <div className="shrink-0 text-end">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("Total accounts")}</div>
                <div className="mt-0.5 text-sm font-semibold leading-tight text-ink">{accounts == null ? "—" : formatInt(accounts)}</div>
              </div>
            </div>
          </div>
          <div className="flex h-full min-h-[7.25rem] flex-col px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <Link to="/charts/daily-ops" className="text-xs font-semibold text-ink hover:text-link">{t("BitShares operation history")}</Link>
              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{t("14 days")}</span>
            </div>
            <div className="mt-1 min-h-[4.25rem] flex-1">
              {chartError ? (
                <p className="pt-3 text-xs leading-snug text-muted">{t(chartError)}</p>
              ) : chart.length ? (
                <LineChart compact points={chart.map((row) => ({ date: row.date, value: row.ops }))} />
              ) : (
                <div className="h-full animate-pulse rounded-md bg-canvas" />
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid items-stretch gap-3 lg:grid-cols-2">
        <Panel
          className="flex h-full flex-col"
          bodyClassName="flex flex-1 flex-col"
          title={t("Latest blocks")}
          footer={
            <Link to="/blocks" className={linkClass}>
              {t("View all")}
            </Link>
          }
        >
          {loading && !blocks.length ? (
            <LoadingBlock />
          ) : (
            <ul className="divide-y divide-line">
              {blocks.map((block) => (
                <li key={block.num}>
                  <Link to={`/block/${block.num}`} className="flex h-[74px] items-center gap-4 px-4 hover:bg-row">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tint text-link">
                      <Box className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-4">
                        <span className="text-[15px] font-medium leading-5 text-link">#{formatInt(block.num)}</span>
                        <TimeAgo compact className="shrink-0 text-xs leading-5 text-muted" time={block.time} />
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-4 text-[13px] leading-5">
                        <span className="truncate text-muted">
                          {t("Witness")} <span className="text-link">{block.witnessName}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted" title={t("Sum of the fees of every operation in the block. An operation paid in another asset counts the standard BTS fee for its type (marked ≈).")}><span className="hidden sm:inline">{t("Fees")} </span><span className="tabular-nums text-ink">{blockFeeText(block)}</span></span>
                          <span className="rounded bg-canvas px-1.5 py-0.5 text-xs text-ink">{t("{n} txns", { n: block.txCount })}</span>
                        </span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          className="flex h-full flex-col"
          bodyClassName="flex flex-1 flex-col"
          title={t("Latest transactions")}
          footer={
            <Link to="/txs" className={linkClass}>
              {t("View all")}
            </Link>
          }
        >
          {txError ? (
            <div className="flex flex-1 items-center p-4"><ErrorBox message={txError} /></div>
          ) : loading && !txs.length ? (
            <LoadingBlock />
          ) : (
            <ul className="divide-y divide-line">
              {txs.map((tx) => (
                <li key={tx.key} className="flex h-[74px] items-center gap-4 px-4 hover:bg-row">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tint text-link">
                    <ArrowLeftRight className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-4">
                      <TxLink id={tx.trxId} />
                      <TimeAgo compact className="shrink-0 text-xs leading-5 text-muted" time={tx.time} />
                    </span>
                    <span className="mt-1.5 flex min-w-0 items-center gap-2 overflow-hidden text-[13px] leading-5">
                      <TypeBadge type={tx.type} virtual={tx.virtual} />
                      <AccountLink id={tx.feePayer} className="shrink-0" />
                      <span className="truncate text-ink"><OpSummary op={tx} /></span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Link to="/pools" className="rounded-xl border border-line bg-card px-3 py-2.5 hover:border-link">
          <div className="text-xs text-muted">{t("Liquidity pools")}</div>
          <div className="text-base font-semibold">{defi ? formatInt(defi.pools) : "—"}</div>
          <div className="truncate text-xs text-muted">{defi && price != null ? `${compactUsd(defi.tvlBts * price)} ${t("est. TVL")}` : t("{sym}-paired estimate", { sym: core })}</div>
        </Link>
        <Link to="/lending" className="rounded-xl border border-line bg-card px-3 py-2.5 hover:border-link">
          <div className="text-xs text-muted">{t("Lending")}</div>
          <div className="text-base font-semibold">{defi ? formatInt(defi.deals) : "—"}</div>
          <div className="truncate text-xs text-muted">{defi ? t("{n} enabled offers", { n: formatInt(defi.enabledOffers) }) : t("Credit deals")}</div>
        </Link>
        <Link to="/flash" className="rounded-xl border border-line bg-card px-3 py-2.5 hover:border-link">
          <div className="text-xs text-muted">{t("Flash loans")}</div>
          <div className="text-base font-semibold">{defi ? formatInt(defi.funds) : "—"}</div>
          <div className="truncate text-xs text-muted">{t("SameT funds")}</div>
        </Link>
        <Link to="/locking" className="rounded-xl border border-line bg-card px-3 py-2.5 hover:border-link">
          <div className="text-xs text-muted">{t("{sym} locked", { sym: core })}</div>
          <div className="text-base font-semibold">{defi ? compactNumber(defi.lockedBts) : "—"}</div>
          <div className="truncate text-xs text-muted">{defi ? t("{n} voting power", { n: compactNumber(defi.votingPower) }) : t("Tickets")}</div>
        </Link>
      </div>

    </div>
  )
}

function Stat({ label, value, hint, title }: { label: string; value: ReactNode; hint?: ReactNode; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 truncate text-base font-semibold leading-tight text-ink group-hover:text-link sm:text-lg">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</div> : null}
    </div>
  )
}

function transferBaseFee(global: GlobalProps | null): bigint | null {
  const fees = global?.parameters.current_fees
  if (!fees) return null
  const row = fees.parameters.find(([index]) => index === 0)
  const raw = row?.[1]?.fee
  if (typeof raw !== "number" && typeof raw !== "string") return null
  return (asBig(raw) * asBig(fees.scale ?? 10000)) / 10000n
}

async function fetchDynamicSupply(): Promise<string | number> {
  const rows = await db<Array<{ current_supply?: string | number } | null>>("get_objects", [["2.3.0"]])
  return rows?.[0]?.current_supply ?? 0
}

