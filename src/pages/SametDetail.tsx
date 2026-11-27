import { Link, useParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, KeyValue, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchFund } from "../lib/defi.ts"
import { assetSymbol, peekAsset } from "../lib/directory.ts"
import { feeRatePercent, formatRaw } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"

export default function SametDetail() {
  const { id = "" } = useParams()
  const fundId = decodeURIComponent(id)
  useTitle(fundId)
  const query = useQuery(async () => {
    const fund = await fetchFund(fundId)
    if (!fund) throw new Error(`SameT fund ${fundId} was not found.`)
    return fund
  }, [fundId])
  const fund = query.data
  const asset = peekAsset(fund?.asset_type)

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Flash loans", to: "/flash" }, { label: fundId }]} />
      <h1 className="mb-4 font-mono text-2xl font-semibold">{fundId}</h1>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {fund ? (
        <Panel title="SameT fund">
          <KeyValue rows={[
            { label: "Owner", value: <AccountLink id={fund.owner_account} /> },
            { label: "Asset", value: <Link className={linkClass} to={`/asset/${assetSymbol(fund.asset_type)}`}>{assetSymbol(fund.asset_type)}</Link> },
            { label: "Balance", value: formatRaw(fund.balance, asset?.precision ?? 5) },
            { label: "Fee rate", value: feeRatePercent(fund.fee_rate) },
            { label: "Unpaid amount", value: formatRaw(fund.unpaid_amount, asset?.precision ?? 5) },
          ]} />
        </Panel>
      ) : null}
    </div>
  )
}
