import { Link, useSearchParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, OpTable, Pager, Panel } from "../components/widgets.tsx"
import { TimeAgo } from "../components/Now.tsx"
import { fetchAllDeals, fetchAllOffers, fetchRecentOps } from "../lib/defi.ts"
import type { CreditDeal, CreditOffer } from "../lib/defi.ts"
import { peekAsset, resolveAccounts, resolveAssets } from "../lib/directory.ts"
import { feeRatePercent, formatDuration, formatRaw } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 50

export default function Lending() {
  const { t } = useI18n()
  useTitle("Lending")
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "deals" ? "deals" : params.get("tab") === "activity" ? "activity" : "offers"
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const query = useQuery(async () => {
    const [offers, deals, recent] = await Promise.all([
      fetchAllOffers(),
      fetchAllDeals(),
      fetchRecentOps([69, 70, 71, 72, 73, 74], 10).catch(() => []),
    ])
    const offerSorted = [...offers].sort((a, b) => Number(b.enabled) - Number(a.enabled) || Number(b.current_balance) - Number(a.current_balance))
    const dealSorted = [...deals].sort((a, b) => (a.latest_repay_time < b.latest_repay_time ? 1 : -1))
    const offerSlice = offerSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    const dealSlice = dealSorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    await Promise.all([
      resolveAccounts([...offerSlice.map((row) => row.owner_account), ...dealSlice.flatMap((row) => [row.borrower, row.offer_owner])]),
      resolveAssets([...offerSlice.map((row) => row.asset_type), ...dealSlice.flatMap((row) => [row.debt_asset, row.collateral_asset])]),
    ])
    return {
      offers: offerSlice,
      offerTotal: offers.length,
      enabled: offers.filter((row) => row.enabled).length,
      deals: dealSlice,
      dealTotal: deals.length,
      recent,
    }
  }, [page])

  function setTab(next: string) {
    const copy = new URLSearchParams(params)
    copy.set("tab", next)
    copy.set("page", "1")
    setParams(copy)
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Lending" }]} />
      <h1 className="text-2xl font-semibold">{t("Lending")}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">
        {t("Credit offers (1.21.x) and outstanding credit deals (1.22.x). Fee rate uses the chain scale where 1,000,000 equals 100%. Margin call orders are not globally indexed; they show on the account that holds them.")}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label={t("Offers")} value={query.data ? String(query.data.offerTotal) : "—"} hint={query.data ? t("{n} enabled", { n: query.data.enabled }) : ""} />
        <Mini label={t("Open deals")} value={query.data ? String(query.data.dealTotal) : "—"} hint={t("Borrower still owes debt")} />
        <Mini label={t("Enabled rate")} value={query.data && query.data.offerTotal ? `${Math.round((query.data.enabled / query.data.offerTotal) * 100)}%` : "—"} hint={t("Offers currently taking deals")} />
        <Mini label={t("Collateral")} value={t("Per offer")} hint={t("Acceptable assets are set by the lender")} />
      </div>
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      <Panel>
        <div className="flex gap-1 border-b border-line px-2">
          {[
            ["offers", t("Offers")],
            ["deals", t("Deals")],
            ["activity", t("Recent activity")],
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`border-b-2 px-3 py-2.5 text-sm font-medium ${tab === value ? "border-link text-link" : "border-transparent text-muted"}`}>
              {label}
            </button>
          ))}
        </div>
        {query.loading && !query.data ? <LoadingBlock /> : null}
        {tab === "offers" && query.data ? <OfferTable rows={query.data.offers} /> : null}
        {tab === "deals" && query.data ? <DealTable rows={query.data.deals} /> : null}
        {tab === "activity" ? <OpTable rows={query.data?.recent ?? []} /> : null}
        {tab !== "activity" ? (
          <Pager
            page={page}
            hasPrev={page > 1}
            hasNext={Boolean(query.data && page * PAGE_SIZE < (tab === "deals" ? query.data.dealTotal : query.data.offerTotal))}
            totalLabel={query.data ? `${tab === "deals" ? query.data.dealTotal : query.data.offerTotal} rows` : undefined}
            onPage={(next) => {
              const copy = new URLSearchParams(params)
              copy.set("page", String(next))
              copy.set("tab", tab)
              setParams(copy)
            }}
          />
        ) : null}
      </Panel>
    </div>
  )
}

function OfferTable({ rows }: { rows: CreditOffer[] }) {
  const { t } = useI18n()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-start text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{t("Offer")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Lender")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Available")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Fee rate")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Max term")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((offer) => {
            const asset = peekAsset(offer.asset_type)
            return (
              <tr key={offer.id} className="hover:bg-row">
                <td className="px-4 py-3"><Link to={`/credit-offer/${offer.id}`} className={`${linkClass} font-mono text-xs`}>{offer.id}</Link></td>
                <td className="px-4 py-3"><AccountLink id={offer.owner_account} /></td>
                <td className="px-4 py-3">{formatRaw(offer.current_balance, asset?.precision ?? 5)} {asset?.symbol ?? ""}</td>
                <td className="px-4 py-3">{feeRatePercent(offer.fee_rate)}</td>
                <td className="px-4 py-3">{formatDuration(offer.max_duration_seconds)}</td>
                <td className="px-4 py-3">{offer.enabled ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-success">{t("Enabled")}</span> : <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{t("Disabled")}</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function DealTable({ rows }: { rows: CreditDeal[] }) {
  const { t } = useI18n()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-start text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{t("Deal")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Borrower")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Debt")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Collateral")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Repay by")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((deal) => (
            <tr key={deal.id} className="hover:bg-row">
              <td className="px-4 py-3"><Link to={`/credit-deal/${deal.id}`} className={`${linkClass} font-mono text-xs`}>{deal.id}</Link></td>
              <td className="px-4 py-3"><AccountLink id={deal.borrower} /></td>
              <td className="px-4 py-3">{formatRaw(deal.debt_amount, peekAsset(deal.debt_asset)?.precision ?? 5)} {peekAsset(deal.debt_asset)?.symbol}</td>
              <td className="px-4 py-3">{formatRaw(deal.collateral_amount, peekAsset(deal.collateral_asset)?.precision ?? 5)} {peekAsset(deal.collateral_asset)?.symbol}</td>
              <td className="px-4 py-3 text-muted"><TimeAgo time={deal.latest_repay_time} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="truncate text-lg font-semibold">{value}</div>
      {hint ? <div className="truncate text-xs text-muted">{hint}</div> : null}
    </div>
  )
}
