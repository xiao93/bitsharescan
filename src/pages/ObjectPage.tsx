import { Link, useParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, JsonTree, KeyValue, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchObject } from "../lib/chain.ts"
import { formatRaw, formatStake } from "../lib/format.ts"
import { coreSymbol } from "../lib/network.ts"
import { linkClass, routeForObject } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function ObjectPage() {
  const { id = "" } = useParams()
  const objectId = decodeURIComponent(id)
  const { t } = useI18n()
  useTitle(objectId)
  const query = useQuery(() => fetchObject(objectId), [objectId])
  const known = routeForObject(objectId)
  const value = query.data

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: objectId }]} />
      <h1 className="mb-4 font-mono text-2xl font-semibold">{objectId}</h1>
      {known !== `/object/${objectId}` ? (
        <p className="mb-4 text-sm">
          <Link className={linkClass} to={known}>{t("Open the dedicated page")}</Link>
        </p>
      ) : null}
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {!query.loading && value == null && !query.error ? <ErrorBox message={t("That object id does not exist.")} /> : null}
      {value && typeof value === "object" ? <ObjectBody id={objectId} value={value as Record<string, unknown>} /> : null}
    </div>
  )
}

function ObjectBody({ id, value }: { id: string; value: Record<string, unknown> }) {
  if (typeof value.witness_account === "string") {
    return (
      <Panel title="Witness">
        <KeyValue rows={[
          { label: "Account", value: <AccountLink id={value.witness_account} /> },
          { label: "Votes", value: `${formatStake(value.total_votes as string | number)} ${coreSymbol()}` },
          { label: "Missed", value: String(value.total_missed ?? "—") },
          { label: "Signing key", value: <span className="font-mono text-xs">{String(value.signing_key ?? "")}</span> },
          { label: "URL", value: typeof value.url === "string" && value.url ? <a className={linkClass} href={value.url}>{value.url}</a> : "—" },
        ]} />
      </Panel>
    )
  }
  if (typeof value.committee_member_account === "string") {
    return (
      <Panel title="Committee member">
        <KeyValue rows={[
          { label: "Account", value: <AccountLink id={value.committee_member_account} /> },
          { label: "Votes", value: `${formatStake(value.total_votes as string | number)} ${coreSymbol()}` },
          { label: "URL", value: typeof value.url === "string" && value.url ? <a className={linkClass} href={value.url}>{value.url}</a> : "—" },
        ]} />
      </Panel>
    )
  }
  if (typeof value.worker_account === "string" && "daily_pay" in value) {
    return (
      <Panel title="Worker">
        <KeyValue rows={[
          { label: "Name", value: String(value.name ?? "") },
          { label: "Account", value: <AccountLink id={value.worker_account} /> },
          { label: "Daily pay", value: `${formatRaw(value.daily_pay as string | number, 5)} ${coreSymbol()}` },
          { label: "Votes for", value: `${formatStake(value.total_votes_for as string | number)} ${coreSymbol()}` },
          { label: "Votes against", value: `${formatStake(value.total_votes_against as string | number)} ${coreSymbol()}` },
        ]} />
      </Panel>
    )
  }
  if (typeof value.seller === "string" && value.sell_price) {
    return (
      <Panel title="Limit order">
        <KeyValue rows={[
          { label: "Seller", value: <AccountLink id={value.seller} /> },
          { label: "For sale", value: String(value.for_sale ?? "") },
          { label: "Expiration", value: String(value.expiration ?? "") },
        ]} />
        <div className="border-t border-line px-4 py-3 font-mono text-xs"><JsonTree value={value.sell_price} /></div>
      </Panel>
    )
  }
  return (
    <Panel title={id}>
      <div className="px-4 py-4 font-mono text-xs"><JsonTree value={value} /></div>
    </Panel>
  )
}
