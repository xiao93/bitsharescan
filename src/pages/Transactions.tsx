import { useSearchParams } from "react-router-dom"
import { Crumbs, ErrorBox, LoadingBlock, OpTable, Pager, Panel } from "../components/widgets.tsx"
import { formatInt } from "../lib/format.ts"
import { fetchLatestOperations, fetchLatestTransactions } from "../lib/history.ts"
import { OPERATIONS, opLabel } from "../lib/ops.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx"

const PAGE_SIZE = 50

function matchingTypes(test: (slug: string) => boolean) {
  return OPERATIONS.map((op, index) => (test(op.slug) ? index : -1)).filter((index) => index >= 0)
}

const TYPE_GROUPS = [
  { id: "transfers", label: "Transfers", types: matchingTypes((slug) => slug === "transfer" || slug.includes("blind") || slug === "override_transfer" || slug === "account_transfer") },
  { id: "market", label: "Market", types: matchingTypes((slug) => /limit_order|fill_order|call_order|bid_collateral|execute_bid/.test(slug)) },
  { id: "accounts", label: "Accounts", types: matchingTypes((slug) => slug.startsWith("account_")) },
  { id: "assets", label: "Assets", types: matchingTypes((slug) => slug.startsWith("asset_")) },
  { id: "governance", label: "Governance", types: matchingTypes((slug) => /^(witness_|committee_|proposal_|worker_)/.test(slug)) },
  { id: "defi", label: "DeFi", types: matchingTypes((slug) => /^(liquidity_pool_|credit_|samet_|ticket_|htlc_)/.test(slug)) },
]

const COMMON_TYPES = [0, 1, 2, 4, 5, 63, 72]

function selectedTypes(value: string): number[] {
  if (!value) return []
  if (value.startsWith("g:")) return TYPE_GROUPS.find((group) => group.id === value.slice(2))?.types ?? []
  const type = Number(value)
  return Number.isInteger(type) ? [type] : []
}

export default function Transactions() {
  const { t } = useI18n()
  useTitle("Transactions")
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const view = params.get("view") === "ops" ? "ops" : "tx"
  const op = params.get("op") || ""
  const types = selectedTypes(op)
  const query = useQuery(
    () => (view === "ops" ? fetchLatestOperations(PAGE_SIZE, page, types) : fetchLatestTransactions(PAGE_SIZE, page, types)),
    [view, page, op],
  )

  function setView(next: string) {
    const copy = new URLSearchParams(params)
    copy.set("view", next === "ops" ? "ops" : "tx")
    copy.set("page", "1")
    setParams(copy)
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Transactions" }]} />
      <h1 className="mb-1 text-2xl font-semibold text-ink">{t("Transactions")}</h1>
      <p className="mb-4 text-sm text-muted">
        {t("Signed transactions are grouped by transaction id. The operations view includes virtual operations such as order fills.")}
      </p>
      <Panel>
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="px-2">
            <TabsTrigger value="tx">{t("Transactions")}</TabsTrigger>
            <TabsTrigger value="ops">{t("All operations")}</TabsTrigger>
          </TabsList>
          <TabsContent value={view} className="pt-0">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">{t("Operation type")}</span>
                <select
                  value={op}
                  aria-label={t("Operation type")}
                  onChange={(event) => {
                    const copy = new URLSearchParams(params)
                    if (event.target.value) copy.set("op", event.target.value)
                    else copy.delete("op")
                    copy.set("page", "1")
                    setParams(copy)
                  }}
                  className="h-9 rounded-lg border border-line bg-card px-2 text-sm text-ink"
                >
                  <option value="">{t("All types")}</option>
                  <optgroup label={t("Categories")}>
                    {TYPE_GROUPS.map((group) => <option key={group.id} value={`g:${group.id}`}>{t(group.label)}</option>)}
                  </optgroup>
                  <optgroup label={t("Common types")}>
                    {COMMON_TYPES.map((type) => <option key={type} value={String(type)}>{opLabel(type)}</option>)}
                  </optgroup>
                </select>
              </label>
            </div>
            {query.loading && !query.data ? <LoadingBlock /> : null}
            {query.error ? <div className="p-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
            {query.data ? <OpTable rows={query.data.rows} /> : null}
            <Pager
              page={page}
              hasPrev={page > 1}
              hasNext={Boolean(query.data && query.data.rows.length === PAGE_SIZE)}
              totalLabel={query.data ? `${formatInt(query.data.total)}${query.data.relation === "gte" ? "+" : ""} indexed rows` : undefined}
              onPage={(next) => {
                const copy = new URLSearchParams(params)
                copy.set("page", String(next))
                setParams(copy)
              }}
            />
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  )
}
