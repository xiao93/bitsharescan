import type { ComponentType } from "react"
import { lazyPage } from "./lazyPage.ts"

const load = {
  Account: () => import("../pages/Account.tsx"),
  AssetDetail: () => import("../pages/AssetDetail.tsx"),
  Assets: () => import("../pages/Assets.tsx"),
  BlockDetail: () => import("../pages/BlockDetail.tsx"),
  Blocks: () => import("../pages/Blocks.tsx"),
  ChartDetail: () => import("../pages/ChartDetail.tsx"),
  Charts: () => import("../pages/Charts.tsx"),
  LargeTransfers: () => import("../pages/LargeTransfers.tsx"),
  Accounts: () => import("../pages/Accounts.tsx"),
  Committee: () => import("../pages/Committee.tsx"),
  Confidential: () => import("../pages/Confidential.tsx"),
  Lending: () => import("../pages/Lending.tsx"),
  CreditDealDetail: () => import("../pages/CreditDealDetail.tsx"),
  CreditOfferDetail: () => import("../pages/CreditOfferDetail.tsx"),
  FlashLoans: () => import("../pages/FlashLoans.tsx"),
  ExportData: () => import("../pages/ExportData.tsx"),
  Locking: () => import("../pages/Locking.tsx"),
  MarketDetail: () => import("../pages/MarketDetail.tsx"),
  Markets: () => import("../pages/Markets.tsx"),
  PoolDetail: () => import("../pages/PoolDetail.tsx"),
  Pools: () => import("../pages/Pools.tsx"),
  SametDetail: () => import("../pages/SametDetail.tsx"),
  Network: () => import("../pages/Network.tsx"),
  NodeTracker: () => import("../pages/NodeTracker.tsx"),
  NotFound: () => import("../pages/NotFound.tsx"),
  ObjectPage: () => import("../pages/ObjectPage.tsx"),
  OpDetail: () => import("../pages/OpDetail.tsx"),
  SearchPage: () => import("../pages/SearchPage.tsx"),
  TicketDetail: () => import("../pages/TicketDetail.tsx"),
  Transactions: () => import("../pages/Transactions.tsx"),
  TxDetail: () => import("../pages/TxDetail.tsx"),
  Witnesses: () => import("../pages/Witnesses.tsx"),
  Workers: () => import("../pages/Workers.tsx"),
  WorkerDetail: () => import("../pages/WorkerDetail.tsx"),
  Proposals: () => import("../pages/Proposals.tsx"),
  ProposalDetail: () => import("../pages/ProposalDetail.tsx"),
}

export const AccountPage = lazyPage(load.Account)
export const AssetDetail = lazyPage(load.AssetDetail)
export const Assets = lazyPage(load.Assets)
export const BlockDetail = lazyPage(load.BlockDetail)
export const Blocks = lazyPage(load.Blocks)
export const ChartDetail = lazyPage(load.ChartDetail)
export const Charts = lazyPage(load.Charts)
export const LargeTransfers = lazyPage(load.LargeTransfers)
export const Accounts = lazyPage(load.Accounts)
export const Committee = lazyPage(load.Committee)
export const Confidential = lazyPage(load.Confidential)
export const Lending = lazyPage(load.Lending)
export const CreditDealDetail = lazyPage(load.CreditDealDetail)
export const CreditOfferDetail = lazyPage(load.CreditOfferDetail)
export const FlashLoans = lazyPage(load.FlashLoans)
export const ExportData = lazyPage(load.ExportData)
export const Locking = lazyPage(load.Locking)
export const MarketDetail = lazyPage(load.MarketDetail)
export const Markets = lazyPage(load.Markets)
export const PoolDetail = lazyPage(load.PoolDetail)
export const Pools = lazyPage(load.Pools)
export const SametDetail = lazyPage(load.SametDetail)
export const Network = lazyPage(load.Network)
export const NodeTracker = lazyPage(load.NodeTracker)
export const NotFound = lazyPage(load.NotFound)
export const ObjectPage = lazyPage(load.ObjectPage)
export const OpDetail = lazyPage(load.OpDetail)
export const SearchPage = lazyPage(load.SearchPage)
export const TicketDetail = lazyPage(load.TicketDetail)
export const Transactions = lazyPage(load.Transactions)
export const TxDetail = lazyPage(load.TxDetail)
export const Witnesses = lazyPage(load.Witnesses)
export const Workers = lazyPage(load.Workers)
export const WorkerDetail = lazyPage(load.WorkerDetail)
export const Proposals = lazyPage(load.Proposals)
export const ProposalDetail = lazyPage(load.ProposalDetail)

type Loader = () => Promise<{ default: ComponentType<object> }>

const STATIC_ROUTES: Record<string, Loader> = {
  "/blocks": load.Blocks,
  "/txs": load.Transactions,
  "/confidential": load.Confidential,
  "/charts": load.Charts,
  "/large-transfers": load.LargeTransfers,
  "/accounts": load.Accounts,
  "/nodetracker": load.NodeTracker,
  "/assets": load.Assets,
  "/markets": load.Markets,
  "/pools": load.Pools,
  "/lending": load.Lending,
  "/flash": load.FlashLoans,
  "/locking": load.Locking,
  "/committee": load.Committee,
  "/witnesses": load.Witnesses,
  "/workers": load.Workers,
  "/proposals": load.Proposals,
  "/network": load.Network,
  "/export": load.ExportData,
  "/search": load.SearchPage,
}

const DYNAMIC_ROUTES: Array<[RegExp, Loader]> = [
  [/^\/block\/[^/]+$/, load.BlockDetail],
  [/^\/tx\/[^/]+$/, load.TxDetail],
  [/^\/op\/[^/]+$/, load.OpDetail],
  [/^\/account\/[^/]+$/, load.Account],
  [/^\/asset\/[^/]+$/, load.AssetDetail],
  [/^\/pool\/[^/]+$/, load.PoolDetail],
  [/^\/market\/[^/]+\/[^/]+$/, load.MarketDetail],
  [/^\/charts\/[^/]+$/, load.ChartDetail],
  [/^\/worker\/[^/]+$/, load.WorkerDetail],
  [/^\/proposal\/[^/]+$/, load.ProposalDetail],
  [/^\/credit-offer\/[^/]+$/, load.CreditOfferDetail],
  [/^\/credit-deal\/[^/]+$/, load.CreditDealDetail],
  [/^\/samet\/[^/]+$/, load.SametDetail],
  [/^\/ticket\/[^/]+$/, load.TicketDetail],
  [/^\/object\/[^/]+$/, load.ObjectPage],
]

export function normalizeRoutePath(pathname: string): string {
  let path = pathname.trim()
  if (path.startsWith("#")) path = path.slice(1)
  const query = path.search(/[?#]/)
  if (query === 0) return "/"
  if (query > 0 && path[query] === "?") path = path.slice(0, query)
  if (!path.startsWith("/")) path = `/${path}`
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  return path || "/"
}

export function matchRouteLoader(pathname: string): Loader | undefined {
  const path = normalizeRoutePath(pathname)
  if (STATIC_ROUTES[path]) return STATIC_ROUTES[path]
  for (const [pattern, loader] of DYNAMIC_ROUTES) {
    if (pattern.test(path)) return loader
  }
  return undefined
}

/** Kick off the memoized dynamic import for a hash or pathname once. */
export function preloadRoute(pathname: string) {
  const loader = matchRouteLoader(pathname)
  if (loader) void loader()
}

export function pathFromInternalAnchor(anchor: HTMLAnchorElement): string | null {
  const raw = anchor.getAttribute("href")
  if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:")) return null
  try {
    const url = new URL(anchor.href, window.location.href)
    if (url.origin !== window.location.origin) return null
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
    if (!hash || hash === "/") return hash === "/" ? "/" : null
    return normalizeRoutePath(hash)
  } catch {
    return null
  }
}

/** Prefetch a route chunk when any in-page `#/...` link is hovered, focused, or pressed. */
export function installLinkPrefetch() {
  const onIntent = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest("a")
    if (!anchor) return
    const path = pathFromInternalAnchor(anchor)
    if (path) preloadRoute(path)
  }
  document.addEventListener("mouseover", onIntent, { passive: true })
  document.addEventListener("focusin", onIntent)
  document.addEventListener("pointerdown", onIntent)
  return () => {
    document.removeEventListener("mouseover", onIntent)
    document.removeEventListener("focusin", onIntent)
    document.removeEventListener("pointerdown", onIntent)
  }
}
