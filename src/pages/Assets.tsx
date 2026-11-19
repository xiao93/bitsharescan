import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Crumbs, ErrorBox, LoadingBlock, Pager, Panel } from "../components/widgets.tsx"
import { fetchCounts, listAssets } from "../lib/chain.ts"
import { assetTitle, peekAsset } from "../lib/directory.ts"
import { formatInt, formatRaw } from "../lib/format.ts"
import { db } from "../lib/node.ts"
import { linkClass } from "../lib/utils.ts"
import { useQuery, useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

const PAGE_SIZE = 50

export default function Assets() {
  const { t } = useI18n()
  useTitle("Assets")
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get("page") || "1") || 1)
  const [cursorStack, setCursorStack] = useState<string[]>([""])
  const start = cursorStack[page - 1] ?? ""
  const counts = useQuery(() => fetchCounts(), [])
  const query = useQuery(async () => {
    const rows = await listAssets(start, PAGE_SIZE + (start ? 2 : 1))
    const sliced = start && rows[0]?.symbol === start ? rows.slice(1) : rows
    const pageRows = sliced.slice(0, PAGE_SIZE)
    const dynIds = pageRows.map((row) => peekAsset(row.id)?.dynamic_asset_data_id).filter((id): id is string => !!id)
    const dyn = dynIds.length
      ? await db<Array<{ id: string; current_supply?: string | number } | null>>("get_objects", [dynIds])
      : []
    const supply = new Map(dyn.filter((row): row is NonNullable<typeof row> => !!row).map((row) => [row.id, row.current_supply ?? 0]))
    return { rows: pageRows, next: pageRows.at(-1)?.symbol ?? "", supply, hasMore: sliced.length > PAGE_SIZE }
  }, [start])

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Assets" }]} />
      <h1 className="text-2xl font-semibold">{t("Assets")}</h1>
      <p className="mb-4 mt-1 text-sm text-muted">
        {counts.data ? t("{n} user-issued and smart assets, listed by symbol.", { n: formatInt(counts.data.assets) }) : t("User-issued and smart assets.")}
      </p>
      <Panel>
        {query.loading && !query.data ? <LoadingBlock /> : null}
        {query.error ? <div className="p-4"><ErrorBox message={query.error} onRetry={query.reload} /></div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("Symbol")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Description")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Issuer")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Supply")}</th>
                <th className="px-4 py-2.5 font-medium">{t("Precision")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {query.data?.rows.map((row) => {
                const asset = peekAsset(row.id) ?? row
                const dynId = asset.dynamic_asset_data_id
                return (
                  <tr key={row.id} className="hover:bg-row">
                    <td className="px-4 py-3">
                      <Link to={`/asset/${asset.symbol}`} className={linkClass}>{asset.symbol}</Link>
                      <div className="font-mono text-[11px] text-muted">{asset.id}</div>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted">{assetTitle(asset) || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">{asset.issuer}</td>
                    <td className="px-4 py-3">{formatRaw(query.data?.supply.get(dynId) ?? 0, asset.precision)}</td>
                    <td className="px-4 py-3">{asset.precision}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pager
          page={page}
          hasPrev={page > 1}
          hasNext={Boolean(query.data?.hasMore)}
          onPage={(next) => {
            setCursorStack((stack) => {
              const copy = stack.slice(0, page)
              if (next > page && query.data?.next) copy[next - 1] = query.data.rows.at(-1)?.symbol ?? query.data.next
              return copy
            })
            const copy = new URLSearchParams(params)
            copy.set("page", String(next))
            setParams(copy)
          }}
        />
      </Panel>
    </div>
  )
}
