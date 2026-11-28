import { Link, useSearchParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, OpTable, Panel } from "../components/widgets.tsx"
import { fetchAllFunds, fetchRecentOps } from "../lib/defi.ts"
import { peekAsset, resolveAccounts, resolveAssets } from "../lib/directory.ts"
import { feeRatePercent, formatRaw } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const SAMET_TYPES = [64, 65, 66, 67, 68]

export default function FlashLoans() {
  const { t } = useI18n()
  useTitle("Flash loans")
  const [params, setParams] = useSearchParams()
  const assetParam = (params.get("asset") ?? "").trim()
  const fundsQuery = useQuery(async () => {
    const funds = await fetchAllFunds()
    await Promise.all([
      resolveAccounts(funds.map((fund) => fund.owner_account)),
      resolveAssets(funds.map((fund) => fund.asset_type)),
    ])
    const assets = uniqueAssets(funds)
    const sorted = [...funds].sort((a, b) => Number(b.balance) - Number(a.balance))
    return { funds: sorted, assets }
  }, [])
  const assets = fundsQuery.data?.assets ?? []
  const selected = matchAsset(assetParam, assets)
  const visibleFunds = selected
    ? (fundsQuery.data?.funds ?? []).filter((fund) => fund.asset_type === selected.id)
    : (fundsQuery.data?.funds ?? [])
  const fundIds = visibleFunds.map((fund) => fund.id)
  const opsQuery = useQuery(async () => {
    if (!assetParam) return fetchRecentOps(SAMET_TYPES, 12).catch(() => [])
    await resolveAssets([assetParam])
    const matched = matchAsset(assetParam, assets) ?? matchAsset(assetParam, [])
    if (!matched) return []
    const ids = (fundsQuery.data?.funds ?? [])
      .filter((fund) => fund.asset_type === matched.id)
      .map((fund) => fund.id)
    return fetchRecentOps(SAMET_TYPES, 12, { assetId: matched.id, fundIds: ids }).catch(() => [])
  }, [assetParam, selected?.id ?? "", fundIds.join(",")])

  function setAsset(value: string) {
    const copy = new URLSearchParams(params)
    if (value) copy.set("asset", value)
    else copy.delete("asset")
    setParams(copy)
  }

  const selectedLabel = selected?.symbol ?? (assetParam || null)
  const fundsError = fundsQuery.error
  const opsError = !fundsError ? opsQuery.error : null

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Flash loans" }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Flash loans")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            {t("SameT funds (1.20.x) lend an asset inside one transaction. The borrower must repay principal plus the fund fee before the transaction closes. Fee rate uses the chain scale where 1,000,000 equals 100%.")}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">{t("Asset")}</span>
          <select
            value={selected?.symbol ?? assetParam.toUpperCase()}
            aria-label={t("Asset")}
            onChange={(event) => setAsset(event.target.value)}
            className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink"
          >
            <option value="">{t("All assets")}</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.symbol}>{asset.symbol}</option>
            ))}
            {assetParam && !selected && !assets.some((asset) => asset.symbol === assetParam.toUpperCase()) ? (
              <option value={assetParam.toUpperCase()}>{assetParam.toUpperCase()}</option>
            ) : null}
          </select>
        </label>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Mini
          label={t("Funds")}
          value={fundsQuery.data ? String(visibleFunds.length) : "—"}
          hint={selected && fundsQuery.data ? t("{n} of {total} funds", { n: visibleFunds.length, total: fundsQuery.data.funds.length }) : t("Live samet_fund objects")}
        />
        <Mini label={t("Assets")} value={fundsQuery.data ? String(selected ? 1 : assets.length) : "—"} hint={t("Distinct lendable assets")} />
        <Mini label={t("Recent borrows")} value={opsQuery.data ? String(opsQuery.data.filter((row) => row.type === 67).length) : "—"} hint={t("In the indexed sample")} />
      </div>
      {fundsError ? <ErrorBox message={fundsError} onRetry={fundsQuery.reload} /> : null}
      {opsError ? <ErrorBox message={opsError} onRetry={opsQuery.reload} /> : null}
      <Panel title={t("Funds")} className="mb-4">
        {fundsQuery.loading && !fundsQuery.data ? <LoadingBlock /> : null}
        {fundsQuery.data && !visibleFunds.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted">{selectedLabel ? t("No funds for this asset.") : t("No funds.")}</p>
        ) : null}
        {visibleFunds.length ? (
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
                {visibleFunds.map((fund) => {
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
        ) : null}
      </Panel>
      <Panel title={t("Recent create, borrow, and repay operations")}>
        {opsQuery.loading && !opsQuery.data ? <LoadingBlock /> : null}
        {opsQuery.data && !opsQuery.data.length ? (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {selectedLabel
              ? t("No SameT operations were found for this asset.")
              : t("No SameT operations were found in the operation index. The fund balances above are still live chain state.")}
          </p>
        ) : (
          <OpTable rows={opsQuery.data ?? []} />
        )}
      </Panel>
    </div>
  )
}

function uniqueAssets(funds: Array<{ asset_type: string }>) {
  const seen = new Set<string>()
  const rows: Array<{ id: string; symbol: string }> = []
  for (const fund of funds) {
    if (seen.has(fund.asset_type)) continue
    seen.add(fund.asset_type)
    const asset = peekAsset(fund.asset_type)
    rows.push({ id: fund.asset_type, symbol: asset?.symbol || fund.asset_type })
  }
  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol))
}

function matchAsset(raw: string, assets: Array<{ id: string; symbol: string }>) {
  if (!raw) return null
  const needle = raw.trim()
  const fromList = assets.find((asset) => asset.symbol.toUpperCase() === needle.toUpperCase() || asset.id === needle)
  if (fromList) return fromList
  const looked = peekAsset(needle) ?? peekAsset(needle.toUpperCase())
  if (looked?.id) return { id: looked.id, symbol: looked.symbol }
  return null
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
