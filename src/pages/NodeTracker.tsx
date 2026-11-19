import { useEffect, useState } from "react"
import { AccountLink, Crumbs, LoadingBlock, Panel } from "../components/widgets.tsx"
import { useTitle } from "../hooks/useQuery.ts"
import { fetchWitnesses } from "../lib/chain.ts"
import type { WitnessRow } from "../lib/chain.ts"
import { formatTime } from "../lib/format.ts"
import { useI18n } from "../lib/i18n.tsx"
import { flagEmoji, locateHosts } from "../lib/geo.ts"
import type { HostPlace } from "../lib/geo.ts"
import { currentNetwork } from "../lib/network.ts"
import { hostnameOf, listedApiNodes, listedSeedNodes, probeNodes, witnessEndpoint } from "../lib/nodes.ts"
import type { NodeProbe } from "../lib/nodes.ts"

const COLORS = ["#1d9bf0", "#00ba7c", "#f4212e", "#d97706", "#71767b", "#8b5cf6"]

type P2pNode = {
  ip: string
  port: number
  reachable: boolean
  user_agent: string
  fc_git_revision: string
  country: string
  country_code: string
  last_seen: string | null
}

type P2pSnapshot = {
  generated_at: string
  summary: { discovered: number; reachable: number; countries: number }
  nodes: P2pNode[]
  note: string
}

function tally(labels: string[]) {
  const map = new Map<string, number>()
  for (const label of labels) map.set(label, (map.get(label) ?? 0) + 1)
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}

export default function NodeTracker() {
  const { t } = useI18n()
  useTitle("Node tracker")
  const [probes, setProbes] = useState<NodeProbe[] | null>(null)
  const [witnesses, setWitnesses] = useState<WitnessRow[] | null>(null)
  const [places, setPlaces] = useState<Record<string, HostPlace | null>>({})
  const [checking, setChecking] = useState(false)
  const [p2p, setP2p] = useState<P2pSnapshot | null>(null)
  const apiNodes = listedApiNodes()
  const seedNodes = listedSeedNodes()

  async function refresh() {
    setChecking(true)
    const nodesPromise = probeNodes()
      .then((nodes) => setProbes(nodes))
      .catch(() => setProbes([]))
    const witnessPromise = fetchWitnesses()
      .then((page) => setWitnesses(page?.rows ?? []))
      .catch(() => setWitnesses([]))
    await Promise.all([nodesPromise, witnessPromise])
    setChecking(false)
  }

  useEffect(() => {
    const file = currentNetwork() === "testnet" ? "p2p-nodes-testnet.json" : "p2p-nodes.json"
    void fetch(`${import.meta.env.BASE_URL}data/${file}`)
      .then((response) => response.json() as Promise<P2pSnapshot>)
      .then(setP2p)
      .catch(() => setP2p(null))
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const hosts = [
      ...apiNodes.map((node) => hostnameOf(node.url)),
      ...seedNodes.map((seed) => hostnameOf(seed.host)),
      ...(witnesses ?? []).filter((row) => row.active).map((row) => witnessEndpoint(row.name, row.url)?.host ?? ""),
    ]
    let cancel = false
    void locateHosts(hosts).then((found) => {
      if (!cancel) setPlaces(found)
    })
    return () => {
      cancel = true
    }
  }, [witnesses])

  const online = (probes ?? []).filter((row) => row.online)
  const latency = online.length ? Math.round(online.reduce((sum, row) => sum + (row.latency ?? 0), 0) / online.length) : null
  const byNode = new Map((probes ?? []).map((row) => [row.url, row]))
  const versions = tally(online.map((row) => row.version || t("Unknown")))
  const countries = tally(apiNodes.map((node) => places[hostnameOf(node.url)]?.country || t("Unknown")))

  return (
    <div>
      <Crumbs items={[{ label: "Home", to: "/" }, { label: "Node tracker" }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("Node tracker")}</h1>
          <p className="mt-1 text-sm text-muted">{t("Public API nodes are probed from this browser. Seed nodes are listed and not probed. Refreshes every 60s.")}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={checking} className="h-9 rounded-lg border border-line px-3 text-sm font-medium text-ink disabled:opacity-40">{checking ? t("Checking") : t("Refresh")}</button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={t("Total nodes")} value={String(apiNodes.length)} />
        <Card label={t("Online")} value={probes ? String(online.length) : "…"} />
        <Card label={t("Average latency")} value={latency == null ? "—" : `${latency} ms`} />
        <Card label={t("Chain match")} value={probes ? String(online.filter((row) => row.chainOk).length) : "…"} />
      </div>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Panel title={t("Client versions")}>
          <Breakdown rows={versions} />
        </Panel>
        <Panel title={t("Locations")}>
          <Breakdown rows={countries} />
        </Panel>
      </div>
      <Panel title={t("API nodes")} className="mb-4">
        {!probes ? <LoadingBlock /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("Node")}</th>
                  <th className="px-4 py-2 font-medium">{t("Status")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Latency")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Head block")}</th>
                  <th className="px-4 py-2 font-medium">{t("Chain id")}</th>
                  <th className="px-4 py-2 font-medium">{t("Version")}</th>
                  <th className="px-4 py-2 font-medium">{t("Location")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {apiNodes.map((node) => {
                  const probe = byNode.get(node.url)
                  return (
                    <tr key={node.url}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{node.name}</div>
                        <div className="font-mono text-xs text-muted">{node.url}</div>
                      </td>
                      <td className={`px-4 py-2 ${probe?.online ? "text-success" : "text-danger"}`}>{probe ? (probe.online ? t("Online") : t("Offline")) : "…"}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{probe?.latency == null ? "—" : `${probe.latency} ms`}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{probe?.head ?? "—"}</td>
                      <td className="px-4 py-2 text-xs">{probe?.chainOk == null ? "—" : probe.chainOk ? t("Match") : t("Other chain")}</td>
                      <td className="px-4 py-2 font-mono text-xs">{probe?.version || "—"}</td>
                      <td className="px-4 py-2 text-muted">{placeLabel(places[hostnameOf(node.url)], t)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title={t("Seed nodes")} className="mb-4">
        <p className="px-4 pt-3 text-xs text-muted">{t("Listed only. These P2P endpoints are not opened from the browser.")}</p>
        <ul className="divide-y divide-line">
          {seedNodes.map((seed) => (
            <li key={seed.host} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="font-mono">{seed.host}</span>
              <span className="text-muted">{placeLabel(places[hostnameOf(seed.host)], t)}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={t("Block producers")}>
        {!witnesses ? <LoadingBlock /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("Witness")}</th>
                  <th className="px-4 py-2 font-medium">{t("Status")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Last block")}</th>
                  <th className="px-4 py-2 text-right font-medium">{t("Missed")}</th>
                  <th className="px-4 py-2 font-medium">{t("IP")}</th>
                  <th className="px-4 py-2 font-medium">{t("Country")}</th>
                  <th className="px-4 py-2 font-medium">{t("Source")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {witnesses.filter((row) => row.active).map((row) => {
                  const endpoint = witnessEndpoint(row.name, row.url)
                  const place = endpoint ? places[endpoint.host] : null
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-2"><AccountLink id={row.account} /></td>
                      <td className="px-4 py-2 text-success">{t("Active witness")}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{row.lastBlock || "—"}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{row.missed}</td>
                      <td className="px-4 py-2 font-mono text-xs">{endpoint && place ? `${endpoint.host} → ${place.ip}` : t("Unknown")}</td>
                      <td className="px-4 py-2">{placeLabel(place, t)}</td>
                      <td className="px-4 py-2 text-muted">{endpoint ? t(endpoint.source === "url" ? "Witness URL" : "Seed list") : t("Unknown")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="px-4 py-3 text-xs text-muted">{t("IPs come from public witness URLs and seed lists, not from the block producer itself, and may be a website or proxy rather than the signing node.")}</p>
          </div>
        )}
      </Panel>
      <div id="p2p-network">
        <P2pSection snapshot={p2p} />
      </div>
    </div>
  )
}

function P2pSection({ snapshot }: { snapshot: P2pSnapshot | null }) {
  const { t } = useI18n()
  if (!snapshot) return null
  const nodes = [...snapshot.nodes].sort((a, b) => Number(b.reachable) - Number(a.reachable) || a.country.localeCompare(b.country) || a.ip.localeCompare(b.ip))
  const versions = tally(nodes.filter((node) => node.reachable).map((node) => p2pVersion(node) || t("Unknown")))
  const countries = tally(nodes.map((node) => node.country || t("Unknown")))
  return (
    <Panel title={t("P2P network")} className="mb-4">
      <p className="px-4 pt-3 text-xs text-muted">{t("Crawled from the public seed list over the Graphene P2P protocol. The browser cannot open these TCP ports, so this table is a snapshot from {time}.", { time: formatTime(snapshot.generated_at) })}</p>
      <div className="grid grid-cols-3 gap-3 px-4 py-3">
        <Card label={t("Discovered")} value={String(snapshot.summary.discovered)} />
        <Card label={t("Reachable")} value={String(snapshot.summary.reachable)} />
        <Card label={t("Countries")} value={String(snapshot.summary.countries)} />
      </div>
      <div className="grid gap-3 border-t border-line lg:grid-cols-2">
        <div>
          <h2 className="px-4 pt-3 text-sm font-medium">{t("Locations")}</h2>
          <Breakdown rows={countries} />
        </div>
        <div>
          <h2 className="px-4 pt-3 text-sm font-medium">{t("Client versions")}</h2>
          <Breakdown rows={versions} />
        </div>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-canvas text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("IP")}</th>
              <th className="px-4 py-2 text-right font-medium">{t("Port")}</th>
              <th className="px-4 py-2 font-medium">{t("Country")}</th>
              <th className="px-4 py-2 font-medium">{t("Version")}</th>
              <th className="px-4 py-2 font-medium">{t("Last seen")}</th>
              <th className="px-4 py-2 font-medium">{t("Reachable")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {nodes.map((node) => (
              <tr key={`${node.ip}:${node.port}`}>
                <td className="px-4 py-2 font-mono text-xs">{node.ip}</td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">{node.port}</td>
                <td className="px-4 py-2">{node.country ? `${flagEmoji(node.country_code)} ${t(node.country) === node.country ? node.country : t(node.country)}`.trim() : t("Unknown")}</td>
                <td className="px-4 py-2 font-mono text-xs">{p2pVersion(node) || "—"}</td>
                <td className="px-4 py-2 font-mono text-xs text-muted">{node.last_seen || "—"}</td>
                <td className={`px-4 py-2 ${node.reachable ? "text-success" : "text-danger"}`}>{node.reachable ? t("Reachable") : t("Unreachable")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-muted">{t("P2P hello messages carry a node key, not a witness account, so these addresses are not matched to block producers. Witness IPs above come only from public URLs and the official seed list.")}</p>
    </Panel>
  )
}

function p2pVersion(node: P2pNode) {
  const revision = node.fc_git_revision ? node.fc_git_revision.slice(0, 10) : ""
  return [node.user_agent, revision].filter(Boolean).join(" ")
}

function placeLabel(place: HostPlace | null | undefined, t: (text: string) => string) {
  if (!place?.country) return t("Unknown")
  const flag = flagEmoji(place.code)
  const name = t(place.country) === place.country ? place.country : t(place.country)
  return `${flag ? `${flag} ` : ""}${name}`
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function Breakdown({ rows }: { rows: Array<[string, number]> }) {
  const { t } = useI18n()
  const total = rows.reduce((sum, row) => sum + row[1], 0) || 1
  if (!rows.length) return <p className="px-4 py-6 text-sm text-muted">{t("No data yet.")}</p>
  const stops = rows.map((row, index) => {
    const start = rows.slice(0, index).reduce((sum, item) => sum + item[1], 0) / total * 100
    const end = start + row[1] / total * 100
    return `${COLORS[index % COLORS.length]} ${start}% ${end}%`
  }).join(", ")
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="h-20 w-20 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops})` }} />
      <ul className="min-w-0 flex-1 space-y-1 text-sm">
        {rows.map(([label, count], index) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <span className="inline-flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} /><span className="truncate">{label}</span></span>
            <span className="font-mono tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
