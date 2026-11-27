import { Link, useParams } from "react-router-dom"
import { AccountLink, Crumbs, DirArrow, ErrorBox, KeyValue, LoadingBlock, Panel } from "../components/widgets.tsx"
import { fetchWorkers } from "../lib/chain.ts"
import type { WorkerRow } from "../lib/chain.ts"
import { esSearch, esTotal, objectIndex } from "../lib/es.ts"
import { compactUsd, formatDecimal, formatRaw, formatStake, formatTime, toFloat } from "../lib/format.ts"
import { coreSymbol } from "../lib/network.ts"
import { fetchBtsUsd } from "../lib/usd.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"
import { localeTag } from "../lib/locale.ts"

export default function WorkerDetail() {
  const { id = "" } = useParams()
  const workerId = decodeURIComponent(id)
  const { t } = useI18n()
  useTitle(workerId)
  const query = useQuery(async () => {
    const [page, quote] = await Promise.all([fetchWorkers(), fetchBtsUsd().catch(() => ({ price: null, source: "", anchor: null }))])
    const row = page.rows.find((item) => item.id === workerId)
    if (!row) throw new Error(t("Worker {id} was not found.", { id: workerId }))
    return { row, quote, threshold: page.threshold }
  }, [workerId])
  const voters = useQuery(async () => {
    const row = query.data?.row
    if (!row) return null
    const [yes, no] = await Promise.all([
      voterPage(row.voteFor),
      voterPage(row.voteAgainst),
    ])
    return { yes, no }
  }, [query.data?.row?.id])
  const row = query.data?.row
  const btsUsd = query.data?.quote.price ?? null
  const core = coreSymbol()

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Workers", to: "/workers" }, { label: row?.title || workerId }]} />
      {query.loading ? <LoadingBlock /> : null}
      {query.error ? <ErrorBox message={query.error} onRetry={query.reload} /> : null}
      {row ? (
        <>
          <h1 className="text-2xl font-semibold">{row.title || row.name}</h1>
          <p className="mb-4 mt-1 font-mono text-sm text-muted">{row.id}</p>
          <Panel title={t("Worker")} className="mb-4">
            <KeyValue rows={[
              { label: "Account", value: <AccountLink id={row.account} /> },
              { label: "URL", value: safeUrl(row.url) ? <a className={linkClass} href={safeUrl(row.url)!} target="_blank" rel="noreferrer">{row.url}</a> : "—" },
              { label: "Daily pay", value: payText(row, btsUsd, core) },
              { label: "Period", value: <span className="inline-flex flex-wrap items-center gap-1"><bdi>{formatTime(row.begin)}</bdi> <DirArrow /> <bdi>{formatTime(row.end)}</bdi></span> },
              { label: "Votes for", value: `${formatStake(row.votesFor)} ${core}` },
              { label: "Votes against", value: `${formatStake(row.votesAgainst)} ${core}` },
              { label: "Status", value: statusText(row, t) },
              { label: "Pay threshold", value: query.data?.threshold == null ? "—" : `${formatStake(query.data.threshold)} ${core}` },
              { label: "Type", value: t(row.type) },
              { label: "Vesting balance", value: row.vestingId ? <Link to={`/object/${row.vestingId}`} className={`${linkClass} font-mono text-xs`}>{row.vestingId}</Link> : "—" },
              { label: "Vote for", value: <span className="font-mono text-xs">{row.voteFor || "—"}</span> },
              { label: "Vote against", value: <span className="font-mono text-xs">{row.voteAgainst || "—"}</span> },
            ]} />
          </Panel>
          <div className="grid gap-4 lg:grid-cols-2">
            <VoterList title={t("Votes for")} voters={voters.data?.yes} loading={voters.loading} error={voters.error} />
            <VoterList title={t("Votes against")} voters={voters.data?.no} loading={voters.loading} error={voters.error} />
          </div>
        </>
      ) : null}
    </div>
  )
}

async function voterPage(voteId: string): Promise<{ rows: Array<{ id: string; name: string }>; total: number }> {
  if (!voteId) return { rows: [], total: 0 }
  const data = await esSearch<{ id?: string; name?: string }>(objectIndex("account"), {
    size: 50,
    _source: ["id", "name"],
    query: { term: { "options.votes.keyword": voteId } },
  })
  return {
    total: esTotal(data).value,
    rows: (data.hits?.hits ?? []).map((hit) => ({ id: hit._source?.id || hit._id || "", name: hit._source?.name || hit._source?.id || "" })).filter((row) => row.id),
  }
}

function VoterList({ title, voters, loading, error }: { title: string; voters?: { rows: Array<{ id: string; name: string }>; total: number } | null; loading: boolean; error: string | null }) {
  const { t } = useI18n()
  return (
    <Panel title={title}>
      {loading && !voters ? <LoadingBlock lines={3} /> : null}
      {error ? <div className="p-4"><ErrorBox message={error} /></div> : null}
      {voters && !voters.rows.length ? <p className="px-4 py-6 text-sm text-muted">{t("No voters in the account index.")}</p> : null}
      {voters?.rows.length ? (
        <>
          <p className="px-4 pt-3 text-xs text-muted">{t("{n} accounts", { n: voters.total.toLocaleString(localeTag()) })}</p>
          <ul className="divide-y divide-line">
            {voters.rows.map((voter) => (
              <li key={voter.id} className="px-4 py-2 text-sm"><Link className={linkClass} to={`/account/${voter.name}`}>{voter.name}</Link></li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  )
}

function payText(row: WorkerRow, btsUsd: number | null, core: string) {
  const amount = toFloat(row.dailyPay, 5)
  const usd = amount != null && btsUsd != null ? ` · ${Math.abs(amount * btsUsd) < 1 ? `$${formatDecimal(amount * btsUsd, 6)}` : compactUsd(amount * btsUsd)}` : ""
  return `${formatRaw(row.dailyPay, 5)} ${core}${usd}`
}

function statusText(row: WorkerRow, t: (text: string) => string) {
  if (row.state === "expired") return t("Expired")
  if (row.state === "pending") return t("Not started")
  if (row.funding === "funded") return t("Funded")
  if (row.funding === "partial") return t("Partially funded")
  return t("Not funded")
}

function safeUrl(url: string): string | null {
  const text = url.trim()
  if (!text) return null
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(text)) return `https://${text}`
  return null
}
