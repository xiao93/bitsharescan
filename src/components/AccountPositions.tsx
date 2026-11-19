import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { AccountLink, Empty, ErrorBox, LoadingBlock } from "./widgets.tsx"
import {
  fetchAccountDeals,
  fetchAccountFunds,
  fetchAccountOffers,
  fetchAccountPools,
  fetchAccountTickets,
  lockInfo,
  poolTvlBts,
} from "../lib/defi.ts"
import { assetSymbol, peekAsset } from "../lib/directory.ts"
import { formatDuration, formatRaw, protocolPercent } from "../lib/format.ts"
import type { Amount } from "../lib/directory.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery } from "../hooks/useQuery.ts"
import { translate, useI18n } from "../lib/i18n.tsx"

type Vesting = {
  id: string
  balance?: Amount
  policy?: [number, { vesting_seconds?: number }]
}

type CallOrder = {
  id?: string
  collateral?: Amount
  debt?: Amount
}

export function AccountPositions({
  accountId,
  vesting,
  callOrders,
}: {
  accountId: string
  vesting: Vesting[]
  callOrders: CallOrder[]
}) {
  const { t } = useI18n()
  const query = useQuery(async () => {
    const [pools, offers, deals, funds, tickets] = await Promise.all([
      fetchAccountPools(accountId),
      fetchAccountOffers(accountId),
      fetchAccountDeals(accountId),
      fetchAccountFunds(accountId),
      fetchAccountTickets(accountId),
    ])
    return { pools, offers, deals, funds, tickets }
  }, [accountId])
  const data = query.data

  return (
    <div className="space-y-6 px-4 pb-4">
      {query.loading ? <LoadingBlock lines={4} /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {data ? (
        <>
          <Section title={t("Liquidity pools")} empty={!data.pools.length} emptyText={t("This account has not created a liquidity pool.")}>
            <SimpleTable
              headers={[t("Pool"), t("Pair"), t("Balances"), t("Fee")]}
              rows={data.pools.map((pool) => [
                <Link key="id" className={`${linkClass} font-mono text-xs`} to={`/pool/${pool.id}`}>{pool.id}</Link>,
                `${assetSymbol(pool.asset_a)}/${assetSymbol(pool.asset_b)}`,
                `${formatRaw(pool.balance_a, peekAsset(pool.asset_a)?.precision ?? 5)} / ${formatRaw(pool.balance_b, peekAsset(pool.asset_b)?.precision ?? 5)}`,
                poolTvlBts(pool) == null ? protocolPercent(pool.taker_fee_percent) : `${protocolPercent(pool.taker_fee_percent)} taker`,
              ])}
            />
          </Section>
          <Section title={t("Credit offers")} empty={!data.offers.length} emptyText={t("No credit offers from this account.")}>
            <SimpleTable
              headers={[t("Offer"), t("Available"), t("Rate"), t("Status")]}
              rows={data.offers.map((offer) => [
                <Link key="id" className={`${linkClass} font-mono text-xs`} to={`/credit-offer/${offer.id}`}>{offer.id}</Link>,
                `${formatRaw(offer.current_balance, peekAsset(offer.asset_type)?.precision ?? 5)} ${assetSymbol(offer.asset_type)}`,
                protocolPercent(offer.fee_rate),
                offer.enabled ? t("Enabled") : t("Disabled"),
              ])}
            />
          </Section>
          <Section title={t("Credit deals")} empty={!data.deals.length} emptyText={t("No open deals as borrower or lender.")}>
            <SimpleTable
              headers={[t("Deal"), t("Role"), t("Counterparty"), t("Debt")]}
              rows={data.deals.map((deal) => [
                <Link key="id" className={`${linkClass} font-mono text-xs`} to={`/credit-deal/${deal.id}`}>{deal.id}</Link>,
                t(deal.role),
                <AccountLink key="who" id={deal.role === "Lender" ? deal.borrower : deal.offer_owner} />,
                `${formatRaw(deal.debt_amount, peekAsset(deal.debt_asset)?.precision ?? 5)} ${assetSymbol(deal.debt_asset)}`,
              ])}
            />
          </Section>
          <Section title={t("Flash-loan funds")} empty={!data.funds.length} emptyText={t("No SameT funds owned by this account.")}>
            <SimpleTable
              headers={[t("Fund"), t("Balance"), t("Fee")]}
              rows={data.funds.map((fund) => [
                <Link key="id" className={`${linkClass} font-mono text-xs`} to={`/samet/${fund.id}`}>{fund.id}</Link>,
                `${formatRaw(fund.balance, peekAsset(fund.asset_type)?.precision ?? 5)} ${assetSymbol(fund.asset_type)}`,
                protocolPercent(fund.fee_rate),
              ])}
            />
          </Section>
          <Section title={t("Locked tickets")} empty={!data.tickets.length} emptyText={t("No voting tickets.")}>
            <SimpleTable
              headers={[t("Ticket"), t("Amount"), t("Lock"), t("Voting power")]}
              rows={data.tickets.map((ticket) => [
                <Link key="id" className={`${linkClass} font-mono text-xs`} to={`/ticket/${ticket.id}`}>{ticket.id}</Link>,
                `${formatRaw(ticket.amount?.amount, peekAsset(ticket.amount?.asset_id)?.precision ?? 5)} ${peekAsset(ticket.amount?.asset_id)?.symbol ?? "BTS"}`,
                lockInfo(ticket.current_type).label,
                `${formatRaw(ticket.value, 5)} · ${lockInfo(ticket.current_type).power}`,
              ])}
            />
          </Section>
          <Section title={t("Vesting balances")} empty={!vesting.length} emptyText={t("No vesting balances.")}>
            <SimpleTable
              headers={[t("Balance"), t("Amount"), t("Policy")]}
              rows={vesting.map((row) => [
                <span key="id" className="font-mono text-xs">{row.id}</span>,
                `${formatRaw(row.balance?.amount, peekAsset(row.balance?.asset_id)?.precision ?? 5)} ${assetSymbol(row.balance?.asset_id)}`,
                vestingPolicy(row.policy),
              ])}
            />
          </Section>
          <Section title={t("Margin positions")} empty={!callOrders.length} emptyText={t("No call orders. The chain does not publish a global margin index.")}>
            <SimpleTable
              headers={[t("Position"), t("Collateral"), t("Debt")]}
              rows={callOrders.map((row) => [
                <span key="id" className="font-mono text-xs">{row.id ?? "—"}</span>,
                row.collateral ? `${formatRaw(row.collateral.amount, peekAsset(row.collateral.asset_id)?.precision ?? 5)} ${assetSymbol(row.collateral.asset_id)}` : "—",
                row.debt ? `${formatRaw(row.debt.amount, peekAsset(row.debt.asset_id)?.precision ?? 5)} ${assetSymbol(row.debt.asset_id)}` : "—",
              ])}
            />
          </Section>
        </>
      ) : null}
    </div>
  )
}

function vestingPolicy(policy: Vesting["policy"]): string {
  if (!policy) return "—"
  const [which, data] = policy
  const seconds = data?.vesting_seconds
  const name = which === 1 ? translate("CDD") : which === 0 ? translate("Linear") : `${which}`
  return seconds ? `${name} · ${formatDuration(seconds)}` : name
}

function Section({ title, empty, emptyText, children }: { title: string; empty: boolean; emptyText: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {empty ? <Empty title={emptyText} /> : children}
    </section>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2.5">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
