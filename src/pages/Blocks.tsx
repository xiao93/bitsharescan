import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { TimeAgo } from "../components/Now.tsx"
import { Crumbs, ErrorBox, LoadingBlock, Pager, Panel } from "../components/widgets.tsx"
import { fetchBlocks, fetchDynamic } from "../lib/chain.ts"
import { formatInt } from "../lib/format.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 50

export default function Blocks() {
  const { t } = useI18n()
  useTitle("Blocks")
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const [jump, setJump] = useState("")
  const head = useQuery(() => fetchDynamic(), [])
  const headNum = head.data?.head_block_number ?? 0
  const start = headNum - (page - 1) * PAGE_SIZE
  const nums = Array.from({ length: PAGE_SIZE }, (_, index) => start - index).filter((num) => num > 0)
  const blocks = useQuery(() => (headNum ? fetchBlocks(nums) : Promise.resolve([])), [headNum, page])
  const pages = headNum ? Math.ceil(headNum / PAGE_SIZE) : 1

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Blocks" }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
<h1 className="text-2xl font-semibold text-ink">{t("Blocks")}</h1>
        <p className="mt-1 text-sm text-muted">
          {headNum ? t("Newest block #{n}. BitShares produces a block every 3 seconds.", { n: formatInt(headNum) }) : t("Loading the chain head.")}
        </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const num = Number(jump)
            if (Number.isFinite(num) && num > 0) window.location.hash = `#/block/${Math.floor(num)}`
          }}
        >
          <input
            value={jump}
            onChange={(event) => setJump(event.target.value)}
            inputMode="numeric"
            placeholder={t("Block number")}
            className="h-10 w-36 rounded-lg border border-line bg-card px-3 text-sm text-ink outline-none focus:border-link"
          />
          <button type="submit" className="h-10 rounded-lg bg-link px-3 text-sm font-medium text-white hover:bg-link-dark">
            {t("Go")}
          </button>
        </form>
      </div>
      {head.error ? <ErrorBox message={head.error} onRetry={head.reload} /> : null}
      <Panel>
        {blocks.loading && !blocks.data?.length ? <LoadingBlock /> : null}
        {blocks.error ? <div className="p-4"><ErrorBox message={blocks.error} onRetry={blocks.reload} /></div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Block")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Age")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Witness")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Txn")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Witness id")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {blocks.data?.map((block) => (
                <tr key={block.num} className="hover:bg-row">
                  <td className="px-4 py-3">
                    <Link to={`/block/${block.num}`} className={linkClass}>
                      {formatInt(block.num)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    <TimeAgo time={block.time} />
                  </td>
                  <td className="px-4 py-3">{block.witnessName}</td>
                  <td className="px-4 py-3">{block.txCount}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{block.witness}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          page={page}
          hasPrev={page > 1}
          hasNext={page < pages}
          totalLabel={headNum ? `${formatInt(pages)} pages` : undefined}
          onPage={(next) => {
            const copy = new URLSearchParams(params)
            copy.set("page", String(next))
            setParams(copy)
          }}
        />
      </Panel>
    </div>
  )
}
