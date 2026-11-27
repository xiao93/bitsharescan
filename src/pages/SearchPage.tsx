import { Link, useSearchParams } from "react-router-dom"
import { AccountLink, Crumbs, Empty, ErrorBox, LoadingBlock, Panel } from "../components/widgets.tsx"
import { accountLabel } from "../lib/directory.ts"
import { searchDirectory } from "../lib/search.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get("q") ?? ""
  const type = params.get("type") ?? "all"
  const { t } = useI18n()
  useTitle(q ? `${t("Search")} ${q}` : t("Search"))
  const query = useQuery(() => searchDirectory(q), [q])
  const data = query.data
  const scoped = type === "account" || type === "asset" || type === "key"
  const showAccounts = !scoped || type === "account"
  const showAssets = !scoped || type === "asset"
  const showKeys = !scoped || type === "key"
  const empty = data && !(
    (showAccounts && data.accounts.length) ||
    (showAssets && data.assets.length) ||
    (showKeys && data.keys.length)
  )
  const emptyTitle = type === "account" ? "No matching accounts" : type === "asset" ? "No matching assets" : type === "key" ? "No matching public keys" : "No exact or prefix matches"
  const emptyBody = type === "account"
    ? "Try a full or prefix account name."
    : type === "asset"
      ? "Try a full or prefix asset symbol."
      : type === "key"
        ? "Enter a public key starting with the network address prefix."
        : "Try a block number, a 40-character transaction id, an account name, or an asset symbol."

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Search" }]} />
      <h1 className="text-2xl font-semibold">{t("Search results")}</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        {q ? <>{t("Matches for")} <span className="font-medium text-ink">{q}</span></> : t("Type a query in the search bar.")}
      </p>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {empty ? <Panel><Empty title={emptyTitle} body={emptyBody} /></Panel> : null}
      {showAccounts && data?.accounts.length ? (
        <Panel title={t("Accounts")} className="mb-4">
          <ul className="divide-y divide-line">
            {data.accounts.map(([name, id]) => (
              <li key={id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link to={`/account/${name}`} className={linkClass}>{name}</Link>
                <span className="font-mono text-xs text-muted">{id}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {showAssets && data?.assets.length ? (
        <Panel title={t("Assets")} className="mb-4">
          <ul className="divide-y divide-line">
            {data.assets.map((asset) => (
              <li key={asset.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link to={`/asset/${asset.symbol}`} className={linkClass}>{asset.symbol}</Link>
                <span className="font-mono text-xs text-muted">{asset.id}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
      {showKeys && data?.keys.length ? (
        <Panel title={t("Key references")}>
          <ul className="divide-y divide-line">
            {data.keys.map((id) => (
              <li key={id} className="px-4 py-3 text-sm">
                <AccountLink id={id} />
                <span className="ms-2 font-mono text-xs text-muted">{accountLabel(id) === id ? "" : id}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
