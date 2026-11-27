import { Link, useParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, KeyValue, LoadingBlock, Panel } from "../components/widgets.tsx"
import { TimeAgo } from "../components/Now.tsx"
import { fetchDeal } from "../lib/defi.ts"
import { assetSymbol, peekAsset } from "../lib/directory.ts"
import { feeRatePercent, formatRaw, formatTime } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"

export default function CreditDealDetail() {
  const { id = "" } = useParams()
  const dealId = decodeURIComponent(id)
  useTitle(dealId)
  const query = useQuery(async () => {
    const deal = await fetchDeal(dealId)
    if (!deal) throw new Error(`Credit deal ${dealId} was not found.`)
    return deal
  }, [dealId])
  const deal = query.data

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Lending", to: "/lending?tab=deals" }, { label: dealId }]} />
      <h1 className="mb-4 font-mono text-2xl font-semibold">{dealId}</h1>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {deal ? (
        <Panel title="Credit deal">
          <KeyValue rows={[
            { label: "Borrower", value: <AccountLink id={deal.borrower} /> },
            { label: "Lender", value: <AccountLink id={deal.offer_owner} /> },
            { label: "Offer", value: <Link className={`${linkClass} font-mono text-xs`} to={`/credit-offer/${deal.offer_id}`}>{deal.offer_id}</Link> },
            { label: "Debt", value: `${formatRaw(deal.debt_amount, peekAsset(deal.debt_asset)?.precision ?? 5)} ${assetSymbol(deal.debt_asset)}` },
            { label: "Collateral", value: `${formatRaw(deal.collateral_amount, peekAsset(deal.collateral_asset)?.precision ?? 5)} ${assetSymbol(deal.collateral_asset)}` },
            { label: "Fee rate", value: feeRatePercent(deal.fee_rate) },
            { label: "Repay by", value: <>{formatTime(deal.latest_repay_time)} · <TimeAgo time={deal.latest_repay_time} /></> },
            { label: "Auto repay", value: Number(deal.auto_repay) ? String(deal.auto_repay) : "Off" },
          ]} />
        </Panel>
      ) : null}
    </div>
  )
}
