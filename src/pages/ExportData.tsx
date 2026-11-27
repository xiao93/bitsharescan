import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Crumbs, ErrorBox } from "../components/widgets.tsx"
import { useTitle } from "../hooks/useQuery.ts"
import { fetchFullAccount } from "../lib/chain.ts"
import {
  EXPORT_TYPES,
  countOps,
  exportType,
  countRelations,
  loadOps,
  opsToCsv,
  relationRows,
  resolveExportAccount,
  snapshotRows,
} from "../lib/exportData.ts"
import { useI18n } from "../lib/i18n.tsx"
import { localeTag } from "../lib/locale.ts"

function csvEscape(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`
}

function download(name: string, rows: string[][]) {
  const body = rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n")
  const blob = new Blob([body], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export default function ExportData() {
  const { t } = useI18n()
  const [search, setSearch] = useSearchParams()
  const initialType = search.get("type") || "operations"
  const [type, setType] = useState(exportType(initialType).id)
  const [account, setAccount] = useState(search.get("a") || "")
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [fromBlock, setFromBlock] = useState("")
  const [toBlock, setToBlock] = useState("")
  const [limit, setLimit] = useState("10000")
  const [count, setCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useTitle("Export Data")
  const spec = exportType(type)
  const snapshot = spec.kinds !== "ops"

  function sync(nextType: string, nextAccount: string) {
    const copy = new URLSearchParams(search)
    copy.set("type", nextType)
    if (nextAccount) copy.set("a", nextAccount)
    setSearch(copy, { replace: true })
  }

  async function accountRef() {
    const resolved = await resolveExportAccount(account)
    if (!resolved) throw new Error(t("Account not found"))
    return resolved
  }

  async function preview() {
    setBusy(true)
    setError(null)
    try {
      const who = await accountRef()
      if (spec.kinds === "ops") setCount(await countOps(who.id, spec, { fromDate, toDate, fromBlock, toBlock }))
      else if (spec.kinds === "balances" || spec.kinds === "vesting") {
        const full = await fetchFullAccount(who.name)
        setCount(spec.kinds === "balances" ? full?.balances.length ?? 0 : full?.vesting_balances?.length ?? 0)
      } else {
        const field = spec.kinds === "registrar" ? "registrar" : spec.kinds === "referrer" ? "referrer" : "options.voting_account"
        setCount(await countRelations(who.id, field))
      }
    } catch (err) {
      setCount(null)
      setError(err instanceof Error ? err.message : t("Export failed"))
    } finally {
      setBusy(false)
    }
  }

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const who = await accountRef()
      const cap = Math.min(10000, Math.max(1, Number(limit) || 10000))
      if (spec.kinds === "ops") {
        const rows = await loadOps(who.id, spec, { fromDate, toDate, fromBlock, toBlock }, cap)
        setCount(rows.length)
        download(`${who.name}-${spec.id}.csv`, opsToCsv(rows))
      } else if (spec.kinds === "balances" || spec.kinds === "vesting") {
        const full = await fetchFullAccount(who.name)
        if (!full) throw new Error(t("Account not found"))
        const table = await snapshotRows(full, spec.kinds)
        setCount(table.length - 1)
        download(`${who.name}-${spec.id}.csv`, table)
      } else {
        const field = spec.kinds === "registrar" ? "registrar" : spec.kinds === "referrer" ? "referrer" : "options.voting_account"
        const table = await relationRows(who.id, field, cap)
        setCount(table.length - 1)
        download(`${who.name}-${spec.id}.csv`, table)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Export failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Export Data" }]} />
      <h1 className="text-2xl font-semibold">{t("Export Data")}</h1>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-muted">{t("Download account history or a current snapshot. Operation exports stop at 10,000 rows.")}</p>
      <div className="max-w-2xl rounded-xl border border-line bg-card p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{t("Export type")}</span>
          <select value={type} onChange={(event) => { setType(event.target.value); setCount(null); sync(event.target.value, account) }} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink">
            {EXPORT_TYPES.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">{t("Account")}</span>
          <input value={account} onChange={(event) => { setAccount(event.target.value); setCount(null) }} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink" placeholder="committee-account" />
        </label>
        {snapshot ? <p className="mt-3 text-xs text-muted">{t("This export is a current snapshot, so the date and block range are not applied.")}</p> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm"><span className="mb-1 block text-muted">{t("From date")}</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink" /></label>
            <label className="text-sm"><span className="mb-1 block text-muted">{t("To date")}</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink" /></label>
            <label className="text-sm"><span className="mb-1 block text-muted">{t("From block")}</span><input value={fromBlock} onChange={(event) => setFromBlock(event.target.value)} inputMode="numeric" className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink" /></label>
            <label className="text-sm"><span className="mb-1 block text-muted">{t("To block")}</span><input value={toBlock} onChange={(event) => setToBlock(event.target.value)} inputMode="numeric" className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink" /></label>
          </div>
        )}
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">{t("Max rows")}</span>
          <select value={limit} onChange={(event) => setLimit(event.target.value)} className="h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink">
            {["100", "1000", "5000", "10000"].map((value) => <option key={value} value={value}>{Number(value).toLocaleString(localeTag())}</option>)}
          </select>
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy || !account.trim()} onClick={() => void preview()} className="h-10 rounded-lg border border-line px-3 text-sm font-medium text-ink disabled:opacity-40">{t("Preview count")}</button>
          <button type="button" disabled={busy || !account.trim()} onClick={() => void run()} className="h-10 rounded-lg bg-link px-3 text-sm font-medium text-white disabled:opacity-40">{busy ? t("Preparing") : t("Download")}</button>
          {count != null ? <span className="text-sm text-muted">{t("{n} records", { n: count.toLocaleString(localeTag()) })}</span> : null}
        </div>
        {error ? <div className="mt-3"><ErrorBox message={error} /></div> : null}
      </div>
    </div>
  )
}
