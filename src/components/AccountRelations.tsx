import { useSearchParams } from "react-router-dom"
import { AccountLink, Empty, ErrorBox, LoadingBlock, Pager } from "./widgets.tsx"
import { fetchRelatedAccounts, PROXY_TOTAL_LIMIT, proxyStake, totalProxyStake, type RelatedAccount } from "../lib/relations.ts"
import { formatDecimal, formatInt } from "../lib/format.ts"
import { coreSymbol } from "../lib/network.ts"
import { useQuery } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 50

export function AccountRelations({
  accountId,
  field,
  kind,
}: {
  accountId: string
  field: "registrar" | "referrer" | "options.voting_account"
  kind: "registered" | "referred" | "proxies"
}) {
  const { t } = useI18n()
  const [search, setSearch] = useSearchParams()
  const page = Math.max(1, Number(search.get("page") || "1") || 1)
  const list = useQuery(() => fetchRelatedAccounts(field, accountId, page, PAGE_SIZE), [field, accountId, page])
  const ids = (list.data?.rows ?? []).map((row) => row.id).join(",")
  const stakes = useQuery(
    () => (kind === "proxies" && ids ? proxyStake(ids.split(",")) : Promise.resolve(null)),
    [kind, ids],
  )
  const total = list.data?.total ?? 0
  const canTotal = kind === "proxies" && total > 0 && total <= PROXY_TOTAL_LIMIT
  const grand = useQuery(() => (canTotal ? totalProxyStake(accountId) : Promise.resolve(null)), [canTotal ? accountId : ""])
  const pageStake = kind === "proxies" ? (list.data?.rows ?? []).reduce((sum, row) => sum + (stakes.data?.get(row.id) ?? 0), 0) : 0
  const fullReady = canTotal && !grand.loading && grand.data != null && Number.isFinite(grand.data)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm text-muted">
        <span>{t("{n} accounts", { n: formatInt(total) })}</span>
        {kind === "proxies" && list.data ? (
          <span>
            {fullReady
              ? <>{t("Total proxied votes")}: {formatDecimal(grand.data, 2)} {coreSymbol()}</>
              : canTotal
                ? <>{t("Total proxied votes")}: …</>
                : <>{t("Sum of this page")}: {stakes.loading ? "…" : formatDecimal(pageStake, 2)} {coreSymbol()}</>}
            <span className="ml-2 text-xs">{t("Liquid and vesting BTS. Tickets are not included.")}</span>
            {kind === "proxies" && total > PROXY_TOTAL_LIMIT ? <span className="ml-2 text-xs">{t("Too many proxies to total. Showing this page.")}</span> : null}
          </span>
        ) : null}
      </div>
      {list.loading && !list.data ? <LoadingBlock /> : null}
      {list.error ? <div className="p-4"><ErrorBox message={list.error} onRetry={list.reload} /></div> : null}
      {list.data && !list.data.rows.length ? <Empty title="No accounts" body="Nothing matched this view yet." /> : null}
      {list.data?.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">{t("Account")}</th>
                {kind === "proxies" ? <th className="px-4 py-2.5 font-medium">{t("Voting power")}</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data.rows.map((row, index) => (
                <Row key={row.id} row={row} index={(page - 1) * PAGE_SIZE + index + 1} stake={kind === "proxies" ? stakes.data?.get(row.id) : undefined} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Pager
        page={page}
        hasPrev={page > 1}
        hasNext={page * PAGE_SIZE < total}
        onPage={(next) => {
          const copy = new URLSearchParams(search)
          copy.set("page", String(next))
          setSearch(copy)
        }}
      />
    </div>
  )
}

function Row({ row, index, stake }: { row: RelatedAccount; index: number; stake?: number }) {
  return (
    <tr>
      <td className="px-4 py-2.5 text-muted">{index}</td>
      <td className="px-4 py-2.5"><AccountLink id={row.name || row.id} /></td>
      {stake != null ? <td className="px-4 py-2.5">{formatDecimal(stake, 2)} {coreSymbol()}</td> : null}
    </tr>
  )
}
