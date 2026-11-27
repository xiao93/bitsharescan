import { Link } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, OpTable, Panel } from "../components/widgets.tsx"
import { fetchAllFunds, fetchRecentOps } from "../lib/defi.ts"
import { peekAsset, resolveAccounts, resolveAssets } from "../lib/directory.ts"
import { feeRatePercent, formatRaw } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function FlashLoans() {
  const { t } = useI18n()
  useTitle("Flash loans")
  const query = useQuery(async () => {
    const [funds, recent] = await Promise.all([
      fetchAllFunds(),
      fetchRecentOps([64, 65, 66, 67, 68], 12).catch(() => []),
    ])
    await Promise.all([
      resolveAccounts(funds.map((fund) => fund.owner_account)),
      resolveAssets(funds.map((fund) => fund.asset_type)),
    ])
    const sorted = [...funds].sort((a, b) => Number(b.balance) - Number(a.balance))
    return { funds: sorted, recent }
  }, [])

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Flash loans" }]} />
      <h1 className="text-2xl font-semibold">{t("Flash loans")}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">
        {t("SameT funds (1.20.x) lend an asset inside one transaction. The borrower must repay principal plus the fund fee before the transaction closes. Fee rate uses the chain scale where 1,000,000 equals 100%.")}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Mini label={t("Funds")} value={query.data ? String(query.data.funds.length) : "—"} hint={t("Live samet_fund objects")} />
        <Mini label={t("Assets")} value={query.data ? String(new Set(query.data.funds.map((fund) => fund.asset_type)).size) : "—"} hint={t("Distinct lendable assets")} />
        <Mini label={t("Recent borrows")} value={query.data ? String(query.data.recent.filter((row) => row.type === 67).length) : "—"} hint={t("In the indexed sample")} />
      </div>
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      <Panel title={t("Funds")} className="mb-4">
        {query.loading && !query.data ? <LoadingBlock /> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-start text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Fund")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Owner")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Balance")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Fee")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {query.data?.funds.map((fund) => {
                const asset = peekAsset(fund.asset_type)
                return (
                  <tr key={fund.id} className="hover:bg-row">
                    <td className="px-4 py-3"><Link to={`/samet/${fund.id}`} className={`${linkClass} font-mono text-xs`}>{fund.id}</Link></td>
                    <td className="px-4 py-3"><AccountLink id={fund.owner_account} /></td>
                    <td className="px-4 py-3">{formatRaw(fund.balance, asset?.precision ?? 5)} {asset?.symbol ?? ""}</td>
                    <td className="px-4 py-3">{feeRatePercent(fund.fee_rate)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("Recent create, borrow, and repay operations")}>
        {query.data && !query.data.recent.length ? <p className="px-4 py-8 text-center text-sm text-muted">{t("No SameT operations were found in the operation index. The fund balances above are still live chain state.")}</p> : <OpTable rows={query.data?.recent ?? []} />}
      </Panel>
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
