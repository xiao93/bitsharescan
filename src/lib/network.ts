export type NetworkId = "mainnet" | "testnet"

export type Endpoints = { ws: string; es: string; http: string }

type NetworkDef = {
  id: NetworkId
  label: "Mainnet" | "Testnet"
  coreSymbol: string
  addressPrefix: string
  chainId: string
  defaults: Endpoints
}

export const NETWORKS: Record<NetworkId, NetworkDef> = {
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    coreSymbol: "BTS",
    addressPrefix: "BTS",
    chainId: "4018d7844c78f6a6c41c6a552b898022310fc5dec06da467ee7905a8dad512c8",
    defaults: {
      ws: "wss://api.bitshares.dev/ws",
      es: "https://es.bitshares.dev",
      http: "",
    },
  },
  testnet: {
    id: "testnet",
    label: "Testnet",
    coreSymbol: "TEST",
    addressPrefix: "TEST",
    chainId: "39f5e2ede1f8bc1a3a54a7914414e3779e33193f1f5693510e73cb7a87617447",
    defaults: {
      ws: "wss://testnet.dex.trading/ws",
      es: "https://es.bitshares.dev",
      http: "",
    },
  },
}

const KEY = "bitscan.networks"
const LEGACY = "bitscan.config"

type Stored = { network: NetworkId; endpoints: Record<NetworkId, Endpoints> }

function blank(): Stored {
  const mainnet = { ...NETWORKS.mainnet.defaults }
  const ws = import.meta.env.VITE_WS_URL
  const es = import.meta.env.VITE_ES_URL
  const http = import.meta.env.VITE_HTTP_RPC
  if (ws) mainnet.ws = ws
  if (es) mainnet.es = es
  if (http) mainnet.http = http
  return {
    network: "mainnet",
    endpoints: {
      mainnet,
      testnet: { ...NETWORKS.testnet.defaults },
    },
  }
}

function isId(value: string | null): value is NetworkId {
  return value === "mainnet" || value === "testnet"
}

function urlNetwork(): NetworkId | null {
  if (typeof window === "undefined") return null
  const value = new URLSearchParams(window.location.search).get("network")
  return isId(value) ? value : null
}

function mergeEndpoints(base: Endpoints, extra: Partial<Endpoints> | undefined): Endpoints {
  if (!extra?.ws) return base
  return { ws: extra.ws, es: extra.es?.trim() ? extra.es : base.es, http: extra.http ?? "" }
}

export function loadNetworkState(): Stored {
  const state = blank()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>
      state.endpoints.mainnet = mergeEndpoints(state.endpoints.mainnet, parsed.endpoints?.mainnet)
      state.endpoints.testnet = mergeEndpoints(state.endpoints.testnet, parsed.endpoints?.testnet)
      const saved = parsed.network ?? null
      if (isId(saved)) state.network = saved
    } else {
      const legacy = localStorage.getItem(LEGACY)
      if (legacy) {
        const old = JSON.parse(legacy) as Partial<Endpoints>
        state.endpoints.mainnet = mergeEndpoints(state.endpoints.mainnet, old)
      }
    }
  } catch {
    /* keep defaults */
  }
  const fromUrl = urlNetwork()
  if (fromUrl) state.network = fromUrl
  return state
}

export function persistNetworkState(state: Stored) {
  localStorage.setItem(KEY, JSON.stringify(state))
  localStorage.setItem(LEGACY, JSON.stringify(state.endpoints.mainnet))
}

export function currentNetwork(): NetworkId {
  return loadNetworkState().network
}

export function networkInfo() {
  return NETWORKS[currentNetwork()]
}

export function coreSymbol() {
  return networkInfo().coreSymbol
}

export function addressPrefix() {
  return networkInfo().addressPrefix
}

export function currentEndpoints(): Endpoints {
  return loadNetworkState().endpoints[currentNetwork()]
}

export function networkHasEs() {
  return Boolean(currentEndpoints().es.trim())
}

export function saveEndpoints(id: NetworkId, endpoints: Endpoints) {
  const state = loadNetworkState()
  state.endpoints[id] = endpoints
  persistNetworkState(state)
}

export function switchNetwork(id: NetworkId) {
  const state = loadNetworkState()
  state.network = id
  persistNetworkState(state)
  const url = new URL(window.location.href)
  if (id === "testnet") url.searchParams.set("network", "testnet")
  else url.searchParams.delete("network")
  window.location.assign(url.toString())
}
