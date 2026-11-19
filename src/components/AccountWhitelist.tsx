import { Link } from "react-router-dom"
import { fetchAuthorityAssets, fetchWhitelistOps } from "../lib/history.ts"
import type { AuthorityAsset } from "../lib/history.ts"
import { resolveAccounts } from "../lib/directory.ts"
import type { FullAccount } from "../lib/chain.ts"
import { AssetLink, AccountLink, ErrorBox, KeyValue, LoadingBlock, OpTable } from "./widgets.tsx"
import { useQuery } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { linkClass } from "../lib/utils.ts"

type Authority = FullAccount["account"]["owner_special_authority"]

export function AccountWhitelist({ account }: { account: FullAccount["account"] }) {
  const { t } = useI18n()
  const query = useQuery(async () => {
    const lists = [
      ...(account.whitelisting_accounts ?? []),
      ...(account.blacklisting_accounts ?? []),
      ...(account.whitelisted_accounts ?? []),
      ...(account.blacklisted_accounts ?? []),
    ]
    const [assets, ops] = await Promise.all([
      fetchAuthorityAssets(account.id).catch(() => [] as AuthorityAsset[]),
      fetchWhitelistOps(account.id).catch(() => []),
      resolveAccounts(lists),
    ])
    return { assets, ops }
  }, [account.id])

  return (
    <div className="space-y-4 px-4 pb-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <NameList title={t("Whitelisted by")} ids={account.whitelisting_accounts ?? []} empty={t("No accounts have whitelisted this account.")} />
        <NameList title={t("Blacklisted by")} ids={account.blacklisting_accounts ?? []} empty={t("No accounts have blacklisted this account.")} />
        <NameList title={t("Accounts this account whitelisted")} ids={account.whitelisted_accounts ?? []} empty={t("This account has not whitelisted anyone.")} />
        <NameList title={t("Accounts this account blacklisted")} ids={account.blacklisted_accounts ?? []} empty={t("This account has not blacklisted anyone.")} />
      </div>
      <KeyValue rows={[
        { label: "Owner special authority", value: <SpecialAuthority value={account.owner_special_authority} /> },
        { label: "Active special authority", value: <SpecialAuthority value={account.active_special_authority} /> },
      ]} />
      <section>
        <h3 className="pb-2 text-sm font-semibold">{t("Asset authorities")}</h3>
        {query.loading && !query.data ? <LoadingBlock lines={3} /> : null}
        {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
        {query.data && !query.data.assets.length ? <p className="text-sm text-muted">{t("No assets use this account as a whitelist or blacklist authority.")}</p> : null}
        {query.data?.assets.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {query.data.assets.map((asset) => (
              <li key={`${asset.id}-${asset.role}`} className="flex items-center justify-between px-3 py-2 text-sm">
                <Link className={linkClass} to={`/asset/${asset.symbol}`}>{asset.symbol}</Link>
                <span className="text-xs text-muted">{t(asset.role === "whitelist" ? "Whitelist" : "Blacklist")}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section>
        <h3 className="pb-2 text-sm font-semibold">{t("Whitelist operations")}</h3>
        {query.data && !query.data.ops.length ? <p className="text-sm text-muted">{t("No whitelist operations were indexed for this account.")}</p> : null}
        {query.data?.ops.length ? <OpTable rows={query.data.ops} /> : null}
      </section>
    </div>
  )
}

function NameList({ title, ids, empty }: { title: string; ids: string[]; empty: string }) {
  return (
    <section className="min-w-0">
      <h3 className="pb-2 text-sm font-semibold">{title}</h3>
      {ids.length ? (
        <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
          {ids.map((id) => (
            <li key={id} className="px-3 py-2 text-sm"><AccountLink id={id} /></li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">{empty}</p>}
    </section>
  )
}

function SpecialAuthority({ value }: { value: Authority }) {
  const { t } = useI18n()
  if (!value || value[0] === 0) return <span className="text-muted">{t("No special authority")}</span>
  const body = value[1] ?? {}
  if (value[0] === 1 && body.asset) {
    return <span>{t("Top {n} holders of", { n: body.num_top_holders ?? 0 })} <AssetLink id={body.asset} /></span>
  }
  return <span className="break-all font-mono text-xs">{JSON.stringify(value)}</span>
}
