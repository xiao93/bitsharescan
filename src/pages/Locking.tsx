import { Link, useSearchParams } from "react-router-dom"
import { AccountLink, Crumbs, ErrorBox, LoadingBlock, OpTable, Pager, Panel } from "../components/widgets.tsx"
import { fetchAllTickets, fetchRecentOps, lockInfo } from "../lib/defi.ts"
import type { Ticket } from "../lib/defi.ts"
import { peekAsset, resolveAccounts, resolveAssets } from "../lib/directory.ts"
import { compactNumber, formatRaw, toFloat } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 50

export default function Locking() {
  const { t } = useI18n()
  useTitle("Locking")
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const query = useQuery(async () => {
    const [tickets, recent] = await Promise.all([
      fetchAllTickets(),
      fetchRecentOps([57, 58, 32, 33], 10).catch(() => []),
    ])
    const sorted = [...tickets].sort((a, b) => (toFloat(b.amount?.amount, 5) - toFloat(a.amount?.amount, 5)))
    const slice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    await Promise.all([
      resolveAccounts(slice.map((ticket) => ticket.account)),
      resolveAssets(slice.map((ticket) => ticket.amount?.asset_id)),
    ])
    const byType = new Map<string, { count: number; amount: number; power: number }>()
    let locked = 0
    let power = 0
    for (const ticket of tickets) {
      const amount = ticket.amount?.asset_id === "1.3.0" ? toFloat(ticket.amount.amount, 5) : 0
      const votes = toFloat(ticket.value, 5)
      locked += amount
      power += votes
      const row = byType.get(ticket.current_type) ?? { count: 0, amount: 0, power: 0 }
      row.count += 1
      row.amount += amount
      row.power += votes
      byType.set(ticket.current_type, row)
    }
    return {
      total: tickets.length,
      slice,
      recent,
      locked,
      power,
      byType: [...byType.entries()].map(([type, row]) => ({ type, ...row })).sort((a, b) => b.amount - a.amount),
    }
  }, [page])
  const data = query.data

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Locking" }]} />
      <h1 className="text-2xl font-semibold">{t("Locking")}</h1>
      <p className="mb-4 mt-1 max-w-3xl text-sm text-muted">
        {t("Tickets (1.18.x) lock core BTS for voting power: 180 days is 2×, 360 days is 4×, and 720 days or forever is 8×. Vesting balances are a separate lock and show on each account.")}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label={t("Tickets")} value={data ? String(data.total) : "—"} hint={t("Including upgrades in progress")} />
        <Mini label={t("BTS locked")} value={data ? compactNumber(data.locked) : "—"} hint={t("Sum of ticket amounts")} />
        <Mini label={t("Voting power")} value={data ? compactNumber(data.power) : "—"} hint={t("Amount × lock multiplier")} />
        <Mini label={t("Forever locks")} value={data ? String(data.byType.find((row) => row.type === "lock_forever")?.count ?? 0) : "—"} hint={t("Forever")} />
      </div>
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      <Panel title="Totals by lock type" className="mb-4" bodyClassName="">
        <p className="px-4 pt-3 text-xs text-muted">{t("Voting power is the ticket value field. Many lock_forever tickets currently store 0, so that total undercounts them.")}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-start text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Lock")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Tickets")}</th>
                <th className="px-4 py-2.5 font-medium">BTS</th>
                <th className="px-4 py-2.5 font-medium">{t("Voting power")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Multiplier")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data?.byType.map((row) => {
                const info = lockInfo(row.type)
                return (
                  <tr key={row.type}>
                    <td className="px-4 py-3 font-medium">{info.label}</td>
                    <td className="px-4 py-3">{row.count}</td>
                    <td className="px-4 py-3">{compactNumber(row.amount)}</td>
                    <td className="px-4 py-3">{compactNumber(row.power)}</td>
                    <td className="px-4 py-3">{info.power}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title={t("Top lockers")} className="mb-4">
        {query.loading && !data ? <LoadingBlock /> : null}
        <TicketTable rows={data?.slice ?? []} />
        <Pager
          page={page}
          hasPrev={page > 1}
          hasNext={Boolean(data && page * PAGE_SIZE < data.total)}
          totalLabel={data ? `${data.total} tickets` : undefined}
          onPage={(next) => {
            const copy = new URLSearchParams(params)
            copy.set("page", String(next))
            setParams(copy)
          }}
        />
      </Panel>
      <Panel title={t("Recent ticket and vesting operations")}>
        <OpTable rows={data?.recent ?? []} />
      </Panel>
    </div>
  )
}

function TicketTable({ rows }: { rows: Ticket[] }) {
  const { t } = useI18n()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-start text-sm">
        <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{t("Ticket")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Account")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Amount")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Lock")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Voting power")}</th>
            <th className="px-4 py-2.5 font-medium">{t("Status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((ticket) => {
            const info = lockInfo(ticket.current_type)
            const asset = peekAsset(ticket.amount?.asset_id)
            return (
              <tr key={ticket.id} className="hover:bg-row">
                <td className="px-4 py-3"><Link to={`/ticket/${ticket.id}`} className={`${linkClass} font-mono text-xs`}>{ticket.id}</Link></td>
                <td className="px-4 py-3"><AccountLink id={ticket.account} /></td>
                <td className="px-4 py-3">{formatRaw(ticket.amount?.amount, asset?.precision ?? 5)} {asset?.symbol ?? "BTS"}</td>
                <td className="px-4 py-3">{info.label}{ticket.target_type !== ticket.current_type ? ` → ${lockInfo(ticket.target_type).label}` : ""}</td>
                <td className="px-4 py-3">{formatRaw(ticket.value, 5)} <span className="text-muted">{info.power}</span></td>
                <td className="px-4 py-3">{ticket.status === "stable" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-success">{t("Stable")}</span> : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">{t(ticket.status)}</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
