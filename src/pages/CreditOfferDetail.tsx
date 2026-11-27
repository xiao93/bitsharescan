import { Link, useParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, KeyValue, LoadingBlock, Panel } from "../components/widgets.tsx"
import { TimeAgo } from "../components/Now.tsx"
import { borrowerIds, fetchDealsForOffer, fetchOffer } from "../lib/defi.ts"
import { assetSymbol, peekAsset } from "../lib/directory.ts"
import { feeRatePercent, formatDuration, formatRaw, formatTime } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function CreditOfferDetail() {
  const { id = "" } = useParams()
  const offerId = decodeURIComponent(id)
  const { t } = useI18n()
  useTitle(offerId)
  const query = useQuery(async () => {
    const offer = await fetchOffer(offerId)
    if (!offer) throw new Error(`Credit offer ${offerId} was not found.`)
    const deals = await fetchDealsForOffer(offerId).catch(() => [])
    return { offer, deals }
  }, [offerId])
  const offer = query.data?.offer
  const asset = peekAsset(offer?.asset_type)

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Lending", to: "/lending" }, { label: offerId }]} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{offerId}</h1>
        {offer ? (offer.enabled ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-success">{t("Enabled")}</span> : <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">{t("Disabled")}</span>) : null}
      </div>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {offer && query.data ? (
        <>
          <Panel title="Credit offer" className="mb-4">
            <KeyValue rows={[
              { label: "Lender", value: <AccountLink id={offer.owner_account} /> },
              { label: "Asset", value: <Link className={linkClass} to={`/asset/${assetSymbol(offer.asset_type)}`}>{assetSymbol(offer.asset_type)}</Link> },
              { label: "Available", value: `${formatRaw(offer.current_balance, asset?.precision ?? 5)} of ${formatRaw(offer.total_balance, asset?.precision ?? 5)}` },
              { label: "Fee rate", value: feeRatePercent(offer.fee_rate) },
              { label: "Minimum deal", value: formatRaw(offer.min_deal_amount, asset?.precision ?? 5) },
              { label: "Maximum term", value: formatDuration(offer.max_duration_seconds) },
              { label: "Auto disable", value: <>{formatTime(offer.auto_disable_time)} · <TimeAgo time={offer.auto_disable_time} /></> },
              { label: "Allowed borrowers", value: borrowerIds(offer).length ? borrowerIds(offer).map((account) => <span key={account} className="me-3"><AccountLink id={account} /></span>) : "Anyone" },
              { label: "Collateral", value: offer.acceptable_collateral?.length ? offer.acceptable_collateral.map(([assetId]) => assetSymbol(assetId)).join(", ") : "None listed" },
            ]} />
          </Panel>
          <Panel title={`Deals from this offer (${query.data.deals.length})`}>
            {query.data.deals.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">{t("Deal")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("Borrower")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("Debt")}</th>
                      <th className="px-4 py-2.5 font-medium">{t("Collateral")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {query.data.deals.slice(0, 50).map((deal) => (
                      <tr key={deal.id}>
                        <td className="px-4 py-3"><Link className={`${linkClass} font-mono text-xs`} to={`/credit-deal/${deal.id}`}>{deal.id}</Link></td>
                        <td className="px-4 py-3"><AccountLink id={deal.borrower} /></td>
                        <td className="px-4 py-3">{formatRaw(deal.debt_amount, peekAsset(deal.debt_asset)?.precision ?? 5)} {peekAsset(deal.debt_asset)?.symbol}</td>
                        <td className="px-4 py-3">{formatRaw(deal.collateral_amount, peekAsset(deal.collateral_asset)?.precision ?? 5)} {peekAsset(deal.collateral_asset)?.symbol}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 py-8 text-center text-sm text-muted">{t("No open deals on this offer.")}</p>}
          </Panel>
        </>
      ) : null}
    </div>
  )
}
