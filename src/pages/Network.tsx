import { Crumbs, ErrorBox, KeyValue, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchDynamic, fetchGlobal } from "../lib/chain.ts"
import { asBig, formatDuration, formatInt, formatRaw, formatTime, percentFromScale } from "../lib/format.ts"
import { opLabel } from "../lib/ops.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const CORE_KEYS = new Set(["witness_pay_per_block", "worker_budget_per_day", "cashback_vesting_threshold", "fee_liquidation_threshold"])
const TIME_KEYS = new Set([
  "block_interval",
  "maintenance_interval",
  "maintenance_skip_slots",
  "committee_proposal_review_period",
  "maximum_time_until_expiration",
  "maximum_proposal_lifetime",
  "cashback_vesting_period_seconds",
])
const PERCENT_KEYS = new Set(["reserve_percent_of_fee", "network_percent_of_fee", "lifetime_referrer_percent_of_fee"])

export default function Network() {
  const { t } = useI18n()
  useTitle("Network")
  const query = useQuery(async () => {
    const [global, dynamic] = await Promise.all([fetchGlobal(), fetchDynamic()])
    return { global, dynamic }
  }, [])
  const params = query.data?.global.parameters
  const fees = params?.current_fees

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Network" }]} />
      <h1 className="mb-1 text-2xl font-semibold">{t("Chain parameters")}</h1>
      <p className="mb-4 text-sm text-muted">{t("Global properties, the live fee schedule, and the current maintenance window.")}</p>
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {params && query.data ? (
        <div className="space-y-4">
          <Panel title="Chain">
            <KeyValue
              rows={[
                { label: "Head block", value: formatInt(query.data.dynamic.head_block_number) },
                { label: "Head time", value: formatTime(query.data.dynamic.time) },
                { label: "Last irreversible", value: formatInt(query.data.dynamic.last_irreversible_block_num) },
                { label: "Next maintenance", value: formatTime(query.data.dynamic.next_maintenance_time) },
                { label: "Active witnesses", value: query.data.global.active_witnesses.length },
                { label: "Active committee", value: query.data.global.active_committee_members.length },
                { label: "Witness budget left", value: `${formatRaw(query.data.dynamic.witness_budget ?? 0, 5)} BTS` },
              ]}
            />
          </Panel>
          <Panel title="Parameters">
            <KeyValue rows={Object.entries(params).filter(([key]) => key !== "current_fees" && key !== "extensions").map(([key, value]) => ({
              label: key.replaceAll("_", " "),
              value: formatParam(key, value),
            }))} />
          </Panel>
          <Panel title={t("Fee schedule · scale {scale}", { scale: String(fees?.scale ?? "—") })}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">{t("Operation")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("Component")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("Amount")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(fees?.parameters ?? []).flatMap(([index, fields]) =>
                    Object.entries(fields).map(([field, amount]) => (
                      <tr key={`${index}-${field}`}>
                        <td className="px-4 py-2.5">{opLabel(index)}</td>
                        <td className="px-4 py-2.5 text-muted">{field.replaceAll("_", " ")}</td>
                        <td className="px-4 py-2.5">{formatFee(amount, Number(fees?.scale ?? 10000))}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  )
}

function formatParam(key: string, value: unknown): string {
  if (typeof value === "number" && TIME_KEYS.has(key) && key !== "maintenance_skip_slots") return formatDuration(value)
  if (typeof value === "number" && PERCENT_KEYS.has(key)) return percentFromScale(value)
  if ((typeof value === "number" || typeof value === "string") && CORE_KEYS.has(key)) return `${formatRaw(value, 5)} BTS`
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

function formatFee(amount: unknown, scale: number): string {
  if (typeof amount === "number" || (typeof amount === "string" && /^-?\d+$/.test(amount))) {
    const scaled = (asBig(amount) * asBig(scale)) / 10000n
    return `${formatRaw(scaled, 5)} BTS`
  }
  return JSON.stringify(amount)
}
