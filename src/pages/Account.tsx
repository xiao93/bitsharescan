import { useEffect, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import { TimeAgo } from "../components/Now.tsx"
import { AccountPositions } from "../components/AccountPositions.tsx"
import { AccountWhitelist } from "../components/AccountWhitelist.tsx"
import { AccountRelations } from "../components/AccountRelations.tsx"
import { AccountLink, CopyButton, Crumbs, Empty, ErrorBox, KeyValue, LoadingBlock, OpTable, Pager, Panel } from "../components/widgets.tsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx"
import {
  fetchAccountOrders,
  fetchFullAccount,
  fetchVoteMap,
  moreFlag,
  priceOfAssetInBts,
  type Authority,
  type FullAccount,
  type LimitOrder,
} from "../lib/chain.ts"
import { accountLabel, assetTitle, peekAsset } from "../lib/directory.ts"
import type { AssetInfo } from "../lib/directory.ts"
import { asBig, compactUsd, formatInt, formatRaw, formatTime, membershipOf, toFloat } from "../lib/format.ts"
import { fetchAccountOps } from "../lib/history.ts"
import { opLabel, OPERATIONS } from "../lib/ops.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { coreSymbol } from "../lib/network.ts"
import { fetchBtsUsd } from "../lib/usd.ts"

const PAGE_SIZE = 50

type PricedBalance = {
  asset: AssetInfo
  raw: string | number
  bts: number | null
  usd: number | null
}

export default function AccountPage() {
  const params = useParams()
  const id = decodeURIComponent(params.id ?? "")
  const [search, setSearch] = useSearchParams()
  const page = Math.max(1, Number(search.get("page") || "1") || 1)
  const typeRaw = search.get("type")
  const type = typeRaw == null || typeRaw === "" ? null : Number(typeRaw)
  const tab = search.get("tab") || "overview"
  const { t } = useI18n()
  useTitle(id)
  const account = useQuery(() => fetchFullAccount(id), [id])
  const accountId = account.data?.account.id ?? ""
  const ops = useQuery(
    () => (accountId ? fetchAccountOps(accountId, page, PAGE_SIZE, Number.isFinite(type) ? type : null) : Promise.resolve(null)),
    [accountId, page, type],
  )
  const [orders, setOrders] = useState<LimitOrder[] | null>(null)
  const [balances, setBalances] = useState<PricedBalance[] | null>(null)
  const [showZero, setShowZero] = useState(false)
  const [votes, setVotes] = useState<Awaited<ReturnType<typeof fetchVoteMap>> | null>(null)
  const [voteError, setVoteError] = useState<string | null>(null)

  useEffect(() => {
    const full = account.data
    if (!full) return
    let cancel = false
    setOrders(full.limit_orders)
    if (full.limit_orders.length >= 100 || moreFlag(full.more_data_available, "limit_orders")) {
      void fetchAccountOrders(full.account.name).then((rows) => {
        if (!cancel) setOrders(rows)
      }).catch(() => {
        if (!cancel) setOrders(full.limit_orders)
      })
    }
    void priceBalances(full).then((rows) => {
      if (!cancel) setBalances(rows)
    })
    return () => {
      cancel = true
    }
  }, [account.data])

  useEffect(() => {
    if (tab !== "votes" || votes) return
    let cancel = false
    void fetchVoteMap().then(
      (map) => {
        if (!cancel) setVotes(map)
      },
      (error: unknown) => {
        if (!cancel) setVoteError(error instanceof Error ? error.message : "Could not load votes")
      },
    )
    return () => {
      cancel = true
    }
  }, [tab, votes])

  const full = account.data
  const member = membershipOf(full?.account.membership_expiration_date)
  const visibleBalances = (balances ?? []).filter((row) => showZero || asBig(row.raw) !== 0n)
  const totalUsd = visibleBalances.reduce((sum, row) => sum + (row.usd ?? 0), 0)

  function setTab(next: string) {
    const copy = new URLSearchParams(search)
    copy.set("tab", next)
    setSearch(copy, { replace: true })
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Accounts" }, { label: full?.account.name ?? id }]} />
      {account.loading ? <LoadingBlock lines={5} /> : null}
      {account.error ? <ErrorBox message={account.error} onRetry={account.reload} /> : null}
      {full ? (
        <>
          <header className="mb-4 flex flex-wrap items-center gap-4">
            <Identicon name={full.account.name} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="truncate text-2xl font-semibold leading-none text-ink">{full.account.name}</h1>
                <CopyButton value={full.account.name} />
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${member.className}`}>{member.label}</span>
              </div>
              <p className="mt-1 flex items-center gap-1 font-mono text-sm leading-none text-muted">
                {full.account.id}
                <CopyButton value={full.account.id} />
              </p>
            </div>
          </header>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Mini label={t("{sym} balance", { sym: coreSymbol() })} value={btsBalance(full)} />
            <Mini label={t("Estimated value")} value={balances ? compactUsd(totalUsd) : "…"} hint={t("Priced balances only")} />
            <Mini label={t("Operations")} value={formatInt(full.statistics?.total_ops ?? ops.data?.total ?? 0)} />
          </div>
          <Panel>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="px-2">
                <TabsTrigger value="overview">{t("Overview")}</TabsTrigger>
                <TabsTrigger value="operations">{t("Operations")}</TabsTrigger>
                <TabsTrigger value="orders">{t("Limit orders")}</TabsTrigger>
                <TabsTrigger value="votes">{t("Votes")}</TabsTrigger>
                <TabsTrigger value="authorities">{t("Authorities")}</TabsTrigger>
                <TabsTrigger value="whitelist">{t("Whitelist")}</TabsTrigger>
                <TabsTrigger value="positions">{t("Positions")}</TabsTrigger>
                <TabsTrigger value="registered">{t("Registered")}</TabsTrigger>
                <TabsTrigger value="referred">{t("Referred")}</TabsTrigger>
                <TabsTrigger value="proxies">{t("Vote proxies")}</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="px-4 pb-2 text-sm font-semibold">{t("Profile")}</h3>
                    <KeyValue
                      rows={[
                        { label: t("Registrar"), value: full.registrar_name ? <Link className={linkClass} to={`/account/${full.registrar_name}`}>{full.registrar_name}</Link> : <AccountLink id={full.account.registrar} /> },
                        { label: t("Referrer"), value: full.referrer_name ?? accountLabel(full.account.referrer) },
                        { label: t("Lifetime referrer"), value: full.lifetime_referrer_name ?? accountLabel(full.account.lifetime_referrer) },
                        { label: t("Created"), value: full.account.creation_time ? formatTime(full.account.creation_time) : "—" },
                        { label: t("Creation block"), value: full.account.creation_block_num ? <Link className={linkClass} to={`/block/${full.account.creation_block_num}`}>{formatInt(full.account.creation_block_num)}</Link> : "—" },
                        { label: t("Lifetime fees"), value: `${formatRaw(full.statistics?.lifetime_fees_paid ?? 0, 5)} ${coreSymbol()}` },
                        { label: t("Memo key"), value: <span className="inline-flex items-center gap-1 break-all font-mono text-xs">{full.account.options.memo_key}<CopyButton value={full.account.options.memo_key} /></span> },
                      ]}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between px-4 pb-2">
                      <h3 className="text-sm font-semibold">{t("Balances")}</h3>
                      <label className="flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" checked={showZero} onChange={(event) => setShowZero(event.target.checked)} />
                        {t("Show zero")}
                      </label>
                    </div>
                    {!balances ? <LoadingBlock lines={4} /> : visibleBalances.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="text-[11px] uppercase tracking-wide text-muted">
                            <tr>
                              <th className="px-4 py-2 font-medium">{t("Asset")}</th>
                              <th className="px-4 py-2 font-medium">{t("Balance")}</th>
                              <th className="px-4 py-2 font-medium">{t("Value")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line">
                            {visibleBalances.map((row) => (
                              <tr key={row.asset.id}>
                                <td className="px-4 py-2.5">
                                  <Link to={`/asset/${row.asset.symbol}`} className={linkClass}>{row.asset.symbol}</Link>
                                  <div className="max-w-[12rem] truncate text-xs text-muted">{assetTitle(row.asset)}</div>
                                </td>
                                <td className="px-4 py-2.5">{formatRaw(row.raw, row.asset.precision)}</td>
                                <td className="px-4 py-2.5 text-muted">{row.usd == null ? "—" : compactUsd(row.usd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : <Empty title={t("No balances")} />}
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="operations" className="pt-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <p className="text-sm text-muted">
                    {ops.data ? t("{n} operations", { n: `${formatInt(ops.data.total)}${ops.data.relation === "gte" ? "+" : ""}` }) : t("History from Elasticsearch")}
                  </p>
                  <select
                    value={type == null || !Number.isFinite(type) ? "" : String(type)}
                    onChange={(event) => {
                      const copy = new URLSearchParams(search)
                      if (event.target.value === "") copy.delete("type")
                      else copy.set("type", event.target.value)
                      copy.set("page", "1")
                      copy.set("tab", "operations")
                      setSearch(copy)
                    }}
                    className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink"
                    aria-label={t("Filter by operation type")}
                  >
                    <option value="">{t("All types")}</option>
                    {OPERATIONS.map((op, index) => (
                      <option key={op.slug} value={index}>{opLabel(index)}</option>
                    ))}
                  </select>
                </div>
                {ops.loading && !ops.data ? <LoadingBlock /> : null}
                {ops.error ? <div className="p-4"><ErrorBox message={ops.error} onRetry={ops.reload} /></div> : null}
                {ops.data ? <OpTable rows={ops.data.rows} /> : null}
                <div className="border-t border-line px-4 py-3 text-left">
                  <Link className="text-sm text-link hover:underline" to={`/export?type=operations&a=${encodeURIComponent(full.account.name)}`}>
                    [ {t("Download CSV Export")} ]
                  </Link>
                </div>
                <Pager
                  page={page}
                  hasPrev={page > 1}
                  hasNext={Boolean(ops.data && (page * PAGE_SIZE < ops.data.total || ops.data.rows.length === PAGE_SIZE))}
                  onPage={(next) => {
                    const copy = new URLSearchParams(search)
                    copy.set("page", String(next))
                    copy.set("tab", "operations")
                    setSearch(copy)
                  }}
                />
              </TabsContent>
              <TabsContent value="orders">
                <OrderTable orders={orders ?? []} />
              </TabsContent>
              <TabsContent value="votes">
                {voteError ? <div className="p-4"><ErrorBox message={voteError} /></div> : null}
                {!votes && !voteError ? <LoadingBlock /> : null}
                {votes ? <VoteTable votes={full.account.options.votes} map={votes} /> : null}
              </TabsContent>
              <TabsContent value="registered">
                <AccountRelations accountId={full.account.id} field="registrar" kind="registered" />
              </TabsContent>
              <TabsContent value="referred">
                <AccountRelations accountId={full.account.id} field="referrer" kind="referred" />
              </TabsContent>
              <TabsContent value="proxies">
                <AccountRelations accountId={full.account.id} field="options.voting_account" kind="proxies" />
              </TabsContent>
              <TabsContent value="positions">
                <AccountPositions
                  accountId={full.account.id}
                  vesting={full.vesting_balances ?? []}
                  callOrders={full.call_orders ?? []}
                />
              </TabsContent>
              <TabsContent value="whitelist" className="pt-4">
                <AccountWhitelist account={full.account} />
              </TabsContent>
              <TabsContent value="authorities">
                <div className="grid gap-4 lg:grid-cols-2">
                  <AuthorityCard title={t("Owner")} authority={full.account.owner} />
                  <AuthorityCard title={t("Active")} authority={full.account.active} />
                </div>
              </TabsContent>
            </Tabs>
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint ? <div className="text-xs text-muted">{hint}</div> : null}
    </div>
  )
}

function Identicon({ name }: { name: string }) {
  let hash = 0
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  const color = `hsl(${hash % 360} 58% 42%)`
  const cells = Array.from({ length: 25 }, (_, index) => ((hash >> (index % 24)) ^ index) % 3 !== 0)
  return (
    <div className="grid h-14 w-14 shrink-0 grid-cols-5 gap-0.5 rounded-xl p-1.5" style={{ background: color }} aria-hidden>
      {cells.map((on, index) => (
        <span key={index} className={`rounded-[2px] ${on ? "bg-white/90" : "bg-black/10"}`} />
      ))}
    </div>
  )
}

function btsBalance(full: FullAccount): string {
  const row = full.balances.find((balance) => balance.asset_type === "1.3.0")
  return `${formatRaw(row?.balance ?? 0, 5)} ${coreSymbol()}`
}

async function priceBalances(full: FullAccount): Promise<PricedBalance[]> {
  const core = coreSymbol()
  const quote = await fetchBtsUsd()
  const btsUsd = quote.price ?? Number.NaN
  const nonzero = full.balances.filter((row) => asBig(row.balance) !== 0n)
  const zeros = full.balances.filter((row) => asBig(row.balance) === 0n)
  const priced: PricedBalance[] = []
  for (const row of nonzero.slice(0, 30)) {
    const asset = peekAsset(row.asset_type)
    if (!asset) continue
    const amount = toFloat(row.balance, asset.precision)
    let bts: number | null = asset.symbol === core ? amount : null
    if (asset.symbol !== core) {
      const px = await priceOfAssetInBts(asset.symbol)
      bts = px == null ? null : amount * px
    }
    const usd = bts != null && Number.isFinite(btsUsd) && btsUsd > 0 ? bts * btsUsd : null
    priced.push({ asset, raw: row.balance, bts, usd })
  }
  for (const row of zeros) {
    const asset = peekAsset(row.asset_type)
    if (asset) priced.push({ asset, raw: row.balance, bts: 0, usd: 0 })
  }
  priced.sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
  return priced
}

function OrderTable({ orders }: { orders: LimitOrder[] }) {
  const { t } = useI18n()
  if (!orders.length) return <Empty title="No open limit orders" body="This account has no orders in the book." />
  const shown = orders.slice(0, 200)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{t("Order")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Selling")}</th>
            <th className="px-4 py-2.5 font-medium">{t("For")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Price")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Expires")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {shown.map((order) => {
            const base = order.sell_price.base
            const quote = order.sell_price.quote
            const baseAsset = peekAsset(base.asset_id)
            const quoteAsset = peekAsset(quote.asset_id)
            const receive = asBig(base.amount) === 0n ? 0n : (asBig(order.for_sale) * asBig(quote.amount)) / asBig(base.amount)
            const price = toFloat(quote.amount, quoteAsset?.precision ?? 0) / toFloat(base.amount, baseAsset?.precision ?? 0)
            return (
              <tr key={order.id}>
                <td className="px-4 py-3"><Link className={`${linkClass} font-mono text-xs`} to={`/object/${order.id}`}>{order.id}</Link></td>
                <td className="px-4 py-3">{formatRaw(order.for_sale, baseAsset?.precision ?? 0)} {baseAsset?.symbol ?? base.asset_id}</td>
                <td className="px-4 py-3">{formatRaw(receive, quoteAsset?.precision ?? 0)} {quoteAsset?.symbol ?? quote.asset_id}</td>
                <td className="px-4 py-3">{Number.isFinite(price) ? price.toLocaleString("en-US", { maximumFractionDigits: 8 }) : "—"}</td>
                <td className="px-4 py-3 text-muted"><TimeAgo time={order.expiration} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {orders.length > shown.length ? <p className="px-4 py-3 text-xs text-muted">{t("Showing {shown} of {total} orders.", { shown: shown.length, total: orders.length })}</p> : null}
    </div>
  )
}

function VoteTable({ votes, map }: { votes: string[]; map: Awaited<ReturnType<typeof fetchVoteMap>> }) {
  const { t } = useI18n()
  if (!votes.length) return <Empty title="No votes" body="This account is not voting for witnesses, committee members, or workers." />
  const groups = ["Witness", "Committee", "Worker"] as const
  return (
    <div className="space-y-4 px-4 pb-4">
      {groups.map((kind) => {
        const rows = votes
          .map((vote) => map.get(vote))
          .filter((row): row is NonNullable<typeof row> => !!row && row.kind === kind)
        const unknown = votes.filter((vote) => {
          const info = map.get(vote)
          const prefix = vote.split(":")[0]
          const expected = kind === "Witness" ? "1" : kind === "Committee" ? "0" : "2"
          return prefix === expected && !info
        })
        if (!rows.length && !unknown.length) return null
        return (
          <div key={kind}>
            <h3 className="mb-2 text-sm font-semibold">{t(kind === "Witness" ? "Witnesses" : kind === "Committee" ? "Committee" : "Workers")}</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {rows.map((row) => (
                <li key={row.voteId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <AccountLink id={row.account} />
                  <span className="text-muted">{row.name}</span>
                  <Link to={`/object/${row.objectId}`} className={`${linkClass} font-mono text-xs`}>{row.objectId}</Link>
                </li>
              ))}
              {unknown.map((vote) => (
                <li key={vote} className="px-3 py-2 font-mono text-xs text-muted">{vote}</li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function AuthorityCard({ title, authority }: { title: string; authority: Authority }) {
  const { t } = useI18n()
  return (
    <div className="px-4 pb-4">
      <h3 className="mb-2 text-sm font-semibold">{title} · {t("threshold {n}", { n: authority.weight_threshold })}</h3>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {authority.account_auths.map(([id, weight]) => (
          <li key={id} className="flex items-center justify-between px-3 py-2 text-sm">
            <AccountLink id={id} />
            <span className="text-muted">{t("weight {n}", { n: weight })}</span>
          </li>
        ))}
        {authority.key_auths.map(([key, weight]) => (
          <li key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="inline-flex min-w-0 items-center gap-1 break-all font-mono text-xs">
              {key}
              <CopyButton value={key} />
            </span>
            <span className="shrink-0 text-muted">{t("weight {n}", { n: weight })}</span>
          </li>
        ))}
        {!authority.account_auths.length && !authority.key_auths.length ? (
          <li className="px-3 py-3 text-sm text-muted">{t("No keys or accounts.")}</li>
        ) : null}
      </ul>
    </div>
  )
}
