import { currentNetwork, networkInfo } from "./network.ts"

export type ListedNode = { name: string; url: string; location: string }

export const API_NODES: ListedNode[] = [
  { name: "BitShares.dev", url: "wss://api.bitshares.dev/ws", location: "Unknown" },
  { name: "EU nodes", url: "wss://eu.nodes.bitshares.ws", location: "Europe" },
  { name: "US nodes", url: "wss://us.nodes.bitshares.ws", location: "United States" },
  { name: "XBTS", url: "wss://node.xbts.io/ws", location: "Unknown" },
  { name: "XBTS public", url: "wss://public.xbts.io/ws", location: "Unknown" },
  { name: "bts.mobi", url: "wss://api.bts.mobi/ws", location: "Unknown" },
  { name: "dex.trading", url: "wss://api.dex.trading/ws", location: "Unknown" },
  { name: "ioBanker", url: "wss://dex.iobanker.com/ws", location: "Unknown" },
  { name: "liondani", url: "wss://api-bts.liondani.com/ws", location: "Germany" },
  { name: "mypi", url: "wss://bts.mypi.eu/ws", location: "Europe" },
  { name: "kimziv", url: "wss://kimziv.com/ws", location: "Unknown" },
  { name: "bitshares.eu", url: "wss://node.bitshares.eu/ws", location: "Europe" },
  { name: "RUDEX", url: "wss://node.market.rudex.org/ws", location: "Unknown" },
]

export const SEED_NODES = [
  { host: "bts-seed1.abit-more.com:62015", location: "Unknown" },
  { host: "seed.roelandp.nl:1776", location: "Unknown" },
  { host: "seed1.xbts.io:1776", location: "Unknown" },
  { host: "seed2.xbts.io:1776", location: "Unknown" },
  { host: "seed4.xbts.io:1776", location: "Unknown" },
  { host: "seeds.btsnodes.com:1776", location: "Unknown" },
]

/** bitshares-ui app/api/apiConfig.js entries marked TESTNET. */
export const TESTNET_API_NODES: ListedNode[] = [
  { name: "dex.trading", url: "wss://testnet.dex.trading/ws", location: "France" },
  { name: "XBTS testnet", url: "wss://testnet.xbts.io/ws", location: "Germany" },
  { name: "bitshares.info", url: "wss://bitsharestestnet.loclx.io", location: "United States" },
]

/** bitshares-core testnet libraries/egenesis/seed-nodes-testnet.txt */
export const TESTNET_SEED_NODES = [
  { host: "bts-testnet-seed1.abit-more.com:1779", location: "Unknown" },
  { host: "testnet-seed.xbts.io:1778", location: "Unknown" },
]

export function listedApiNodes(): ListedNode[] {
  return currentNetwork() === "testnet" ? TESTNET_API_NODES : API_NODES
}

export function listedSeedNodes() {
  return currentNetwork() === "testnet" ? TESTNET_SEED_NODES : SEED_NODES
}

const PLATFORM_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "bitsharestalk.org",
  "www.bitsharestalk.org",
  "twitter.com",
  "x.com",
  "t.me",
  "facebook.com",
  "www.facebook.com",
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "medium.com",
  "steemit.com",
  "discord.com",
  "discord.gg",
  "google.com",
])

/** Official bitshares-core libraries/egenesis/seed-nodes.txt comments that name the operator. */
const WITNESS_SEED: Record<string, string> = {
  "in.abit": "bts-seed1.abit-more.com",
  "xbtsio-wallet": "seed1.xbts.io",
}

export function hostnameOf(value: string): string {
  const text = value.trim()
  if (!text) return ""
  try {
    if (text.includes("://")) return new URL(text).hostname.toLowerCase()
  } catch {
    return ""
  }
  return text.replace(/:\d+$/, "").toLowerCase()
}

export function witnessEndpoint(name: string, url: string): { host: string; source: "url" | "seed list" } | null {
  const raw = url.trim()
  if (raw && !/\s/.test(raw)) {
    try {
      const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
      const host = new URL(withScheme).hostname.toLowerCase().replace(/\.$/, "")
      if (host.includes(".") && !PLATFORM_HOSTS.has(host)) return { host, source: "url" }
    } catch {
      /* not a URL */
    }
  }
  if (currentNetwork() !== "mainnet") return null
  const seed = WITNESS_SEED[name.toLowerCase()]
  return seed ? { host: seed, source: "seed list" } : null
}

export type NodeProbe = {
  url: string
  online: boolean
  latency: number | null
  head: number | null
  chainId: string
  chainOk: boolean | null
  version: string
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

function probeOnce(url: string, expectedChain: string): Promise<NodeProbe> {
  const empty: NodeProbe = { url, online: false, latency: null, head: null, chainId: "", chainOk: null, version: "" }
  return new Promise((resolve) => {
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      resolve(empty)
      return
    }
    const pending = new Map<number, Pending>()
    let next = 1
    const timer = window.setTimeout(() => {
      ws.close()
      resolve(empty)
    }, 8000)
    const call = (api: number, method: string, params: unknown[]) => new Promise((done, fail) => {
      const id = next
      next += 1
      pending.set(id, { resolve: done, reject: fail })
      ws.send(JSON.stringify({ id, method: "call", params: [api, method, params] }))
    })
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return
      const msg = JSON.parse(event.data) as { id?: number; result?: unknown; error?: { message?: string } }
      if (msg.id == null) return
      const item = pending.get(msg.id)
      if (!item) return
      pending.delete(msg.id)
      if (msg.error) item.reject(new Error(msg.error.message || "RPC error"))
      else item.resolve(msg.result)
    }
    ws.onerror = () => undefined
    ws.onopen = () => {
      void (async () => {
        try {
          const started = performance.now()
          let db = 0
          try {
            await call(1, "login", ["", ""])
            db = Number(await call(1, "database", [])) || 0
          } catch {
            db = 0
          }
          const props = await call(db, "get_dynamic_global_properties", []) as { head_block_number?: number }
          const latency = Math.round(performance.now() - started)
          const chainId = String(await call(db, "get_chain_id", []))
          let version = ""
          try {
            const config = await call(db, "get_config", []) as Record<string, unknown>
            const found = Object.entries(config).find(([key, value]) => /version/i.test(key) && typeof value === "string")
            version = found ? String(found[1]) : ""
          } catch {
            version = ""
          }
          window.clearTimeout(timer)
          ws.close()
          resolve({ url, online: true, latency, head: props.head_block_number ?? null, chainId, chainOk: chainId === expectedChain, version })
        } catch {
          window.clearTimeout(timer)
          ws.close()
          resolve(empty)
        }
      })()
    }
  })
}

export async function probeNodes(nodes: ListedNode[] = listedApiNodes()): Promise<NodeProbe[]> {
  const expected = networkInfo().chainId
  const results: NodeProbe[] = []
  for (let index = 0; index < nodes.length; index += 4) {
    const chunk = await Promise.all(nodes.slice(index, index + 4).map((node) => probeOnce(node.url, expected)))
    results.push(...chunk)
  }
  return results
}
