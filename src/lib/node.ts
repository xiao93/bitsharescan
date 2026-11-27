import { loadConfig } from "./config.ts"
import { parseChainJson } from "./json.ts"
import { currentNetwork, networkInfo, type NetworkId } from "./network.ts"
import { clearQueryCache } from "./queryCache.ts"
import { cleanError } from "./utils.ts"

export type NodeStatus = "connecting" | "online" | "http" | "offline"

type Pending = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: number
}

type RpcMessage = {
  id?: number
  result?: unknown
  error?: { message?: string }
}

/**
 * Public API nodes tried after the configured one. Each must answer `get_chain_id`
 * with the selected network's chain id before it is used.
 */
export const FALLBACK_NODES: Record<NetworkId, string[]> = {
  mainnet: [
    "wss://api.bitshares.dev/ws",
    "wss://node.xbts.io/ws",
    "wss://api.bts.mobi/ws",
    "wss://api.dex.trading/ws",
    "wss://dex.iobanker.com/ws",
  ],
  testnet: ["wss://testnet.dex.trading/ws", "wss://testnet.xbts.io/ws"],
}

const LAST_GOOD_KEY = "bitscan.ws-ok"

/** Order to try: the node in use, the configured one, the last one that worked, then the public list. The node that just failed goes last. */
function candidates(configured: string, current: string, bad: string | null): string[] {
  const network = currentNetwork()
  let lastGood: string | null = null
  try {
    lastGood = sessionStorage.getItem(`${LAST_GOOD_KEY}.${network}`)
  } catch {
    /* private mode */
  }
  const list = [...new Set([current, configured, lastGood, ...FALLBACK_NODES[network]]
    .filter((url): url is string => typeof url === "string" && /^wss?:\/\//.test(url)))]
  return bad ? [...list.filter((url) => url !== bad), bad] : list
}

export class NodeClient {
  url: string
  /** The endpoint from settings. `url` can move to a fallback node. */
  baseUrl: string
  httpUrl: string
  status: NodeStatus = "connecting"
  lastError: string | null = null
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private dbApi = 0
  private historyApi = 2
  private opened = false
  private connecting: Promise<void> | null = null
  private failedAt = 0
  private listeners = new Set<(status: NodeStatus) => void>()
  private badUrl: string | null = null
  private timeouts = 0

  constructor(url: string, httpUrl: string) {
    this.url = url
    this.baseUrl = url
    this.httpUrl = httpUrl
  }

  /** Host of the node in use, for the status bar. */
  get host(): string {
    try {
      return new URL(this.url).host
    } catch {
      return ""
    }
  }

  subscribe(fn: (status: NodeStatus) => void) {
    this.listeners.add(fn)
    fn(this.status)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private setStatus(status: NodeStatus) {
    this.status = status
    if (status === "online" || status === "http") this.lastError = null
    for (const fn of this.listeners) fn(status)
  }

  close() {
    this.opened = false
    const ws = this.ws
    this.ws = null
    ws?.close()
    this.rejectAll(new Error("Connection reset"))
  }

  retry() {
    this.failedAt = 0
    this.lastError = null
    this.close()
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private raw(api: number, method: string, params: unknown[]): Promise<unknown> {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket is not open"))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timed out calling ${method}`))
        // Two timeouts in a row: drop this node so the next call fails over.
        this.timeouts += 1
        if (this.timeouts >= 2) {
          this.timeouts = 0
          this.badUrl = this.url
          this.close()
        }
      }, 20000)
      this.pending.set(id, { resolve, reject, timer })
      ws.send(JSON.stringify({ id, jsonrpc: "2.0", method: "call", params: [api, method, params] }))
    })
  }

  private async handshake() {
    await this.raw(1, "login", ["", ""])
    const db = await this.raw(1, "database", [])
    const history = await this.raw(1, "history", [])
    const chainId = await this.raw(typeof db === "number" ? db : 0, "get_chain_id", [])
    const expected = networkInfo().chainId
    if (expected && chainId !== expected) throw new Error("Node is on a different chain")
    this.dbApi = typeof db === "number" ? db : 0
    this.historyApi = typeof history === "number" ? history : 2
    this.opened = true
    this.failedAt = 0
    this.setStatus("online")
  }

  private connect(): Promise<void> {
    this.setStatus("connecting")
    return new Promise((resolve, reject) => {
      let ws: WebSocket
      try {
        ws = new WebSocket(this.url)
      } catch (error) {
        this.setStatus("offline")
        reject(error instanceof Error ? error : new Error("WebSocket failed"))
        return
      }
      this.ws = ws
      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        window.clearTimeout(timer)
        if (error) {
          this.failedAt = Date.now()
          this.lastError = cleanError(error)
          this.setStatus("offline")
          reject(error)
        } else {
          resolve()
        }
      }
      const timer = window.setTimeout(() => {
        ws.close()
        finish(new Error("WebSocket connection timed out"))
      }, 7000)
      ws.onmessage = (event) => {
        if (typeof event.data !== "string") return
        let msg: RpcMessage
        try {
          msg = parseChainJson(event.data) as RpcMessage
        } catch {
          return
        }
        if (msg.id == null) return
        this.timeouts = 0
        const pending = this.pending.get(msg.id)
        if (!pending) return
        this.pending.delete(msg.id)
        window.clearTimeout(pending.timer)
        if (msg.error) pending.reject(new Error(msg.error.message || "RPC error"))
        else pending.resolve(msg.result)
      }
      ws.onerror = () => {
        /* close handler reports the failure */
      }
      ws.onclose = () => {
        if (this.ws === ws) {
          this.opened = false
          this.ws = null
          this.setStatus("offline")
          this.rejectAll(new Error("WebSocket closed"))
        }
        if (!settled) finish(new Error("WebSocket closed"))
      }
      ws.onopen = () => {
        window.clearTimeout(timer)
        void this.handshake().then(
          () => finish(),
          (error: unknown) => {
            ws.close()
            finish(error instanceof Error ? error : new Error("Node login failed"))
          },
        )
      }
    })
  }

  private async ensure() {
    if (this.ws?.readyState === WebSocket.OPEN && this.opened) return
    if (this.connecting) return this.connecting
    if (this.failedAt && Date.now() - this.failedAt < 12000) {
      throw new Error(this.lastError || "WebSocket unavailable")
    }
    this.connecting = this.connectAny()
    try {
      await this.connecting
    } finally {
      this.connecting = null
    }
  }

  /** Try each candidate node until one connects and is on the right chain. */
  private async connectAny() {
    let lastError: unknown = null
    for (const url of candidates(this.baseUrl, this.url, this.badUrl)) {
      this.url = url
      try {
        await this.connect()
        this.badUrl = null
        this.timeouts = 0
        try {
          sessionStorage.setItem(`${LAST_GOOD_KEY}.${currentNetwork()}`, url)
        } catch {
          /* private mode */
        }
        this.setStatus("online")
        return
      } catch (error) {
        lastError = error
      }
    }
    this.failedAt = Date.now()
    throw lastError instanceof Error ? lastError : new Error("WebSocket unavailable")
  }

  private async http(method: string, params: unknown[]) {
    const response = await fetch(this.httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "call",
        params: [0, method, params],
      }),
    })
    const msg = parseChainJson(await response.text()) as RpcMessage
    if (!response.ok || msg.error) {
      throw new Error(msg.error?.message || `HTTP RPC failed (${response.status})`)
    }
    this.setStatus("http")
    return msg.result
  }

  async call(group: "database" | "history", method: string, params: unknown[] = []): Promise<unknown> {
    if (group === "database" && this.failedAt && this.httpUrl && Date.now() - this.failedAt < 12000) {
      return this.http(method, params)
    }
    try {
      await this.ensure()
      const api = group === "database" ? this.dbApi : this.historyApi
      return await this.raw(api, method, params)
    } catch (error) {
      if (group === "database" && this.httpUrl) {
        try {
          return await this.http(method, params)
        } catch (httpError) {
          this.lastError = cleanError(httpError)
          this.setStatus("offline")
          throw httpError
        }
      }
      this.lastError = cleanError(error)
      if (this.status !== "online") this.setStatus("offline")
      throw error
    }
  }
}

let client: NodeClient | null = null

export function getNode(): NodeClient {
  const cfg = loadConfig()
  if (!client || client.baseUrl !== cfg.ws || client.httpUrl !== cfg.http) {
    client?.close()
    clearQueryCache()
    client = new NodeClient(cfg.ws, cfg.http)
  }
  return client
}

export function retryNode() {
  clearQueryCache()
  getNode().retry()
}

export async function db<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  return (await getNode().call("database", method, params)) as T
}

export async function hist<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
  return (await getNode().call("history", method, params)) as T
}
