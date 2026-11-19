import { HashRouter, Route, Routes, useLocation } from "react-router-dom"
import { useEffect } from "react"
import { Layout } from "./components/Layout.tsx"
import { I18nProvider } from "./lib/i18n.tsx"
import { lazyPage } from "./lib/lazyPage.ts"
// The home page ships in the entry chunk; every other page is its own chunk, loaded on first visit.
import Home from "./pages/Home.tsx"

const AccountPage = lazyPage(() => import("./pages/Account.tsx"))
const AssetDetail = lazyPage(() => import("./pages/AssetDetail.tsx"))
const Assets = lazyPage(() => import("./pages/Assets.tsx"))
const BlockDetail = lazyPage(() => import("./pages/BlockDetail.tsx"))
const Blocks = lazyPage(() => import("./pages/Blocks.tsx"))
const ChartDetail = lazyPage(() => import("./pages/ChartDetail.tsx"))
const Charts = lazyPage(() => import("./pages/Charts.tsx"))
const Committee = lazyPage(() => import("./pages/Committee.tsx"))
const Confidential = lazyPage(() => import("./pages/Confidential.tsx"))
const Lending = lazyPage(() => import("./pages/Lending.tsx"))
const CreditDealDetail = lazyPage(() => import("./pages/CreditDealDetail.tsx"))
const CreditOfferDetail = lazyPage(() => import("./pages/CreditOfferDetail.tsx"))
const FlashLoans = lazyPage(() => import("./pages/FlashLoans.tsx"))
const ExportData = lazyPage(() => import("./pages/ExportData.tsx"))
const Locking = lazyPage(() => import("./pages/Locking.tsx"))
const MarketDetail = lazyPage(() => import("./pages/MarketDetail.tsx"))
const Markets = lazyPage(() => import("./pages/Markets.tsx"))
const PoolDetail = lazyPage(() => import("./pages/PoolDetail.tsx"))
const Pools = lazyPage(() => import("./pages/Pools.tsx"))
const SametDetail = lazyPage(() => import("./pages/SametDetail.tsx"))
const Network = lazyPage(() => import("./pages/Network.tsx"))
const NodeTracker = lazyPage(() => import("./pages/NodeTracker.tsx"))
const NotFound = lazyPage(() => import("./pages/NotFound.tsx"))
const ObjectPage = lazyPage(() => import("./pages/ObjectPage.tsx"))
const OpDetail = lazyPage(() => import("./pages/OpDetail.tsx"))
const SearchPage = lazyPage(() => import("./pages/SearchPage.tsx"))
const TicketDetail = lazyPage(() => import("./pages/TicketDetail.tsx"))
const Transactions = lazyPage(() => import("./pages/Transactions.tsx"))
const TxDetail = lazyPage(() => import("./pages/TxDetail.tsx"))
const Witnesses = lazyPage(() => import("./pages/Witnesses.tsx"))
const Workers = lazyPage(() => import("./pages/Workers.tsx"))
const WorkerDetail = lazyPage(() => import("./pages/WorkerDetail.tsx"))
const Proposals = lazyPage(() => import("./pages/Proposals.tsx"))
const ProposalDetail = lazyPage(() => import("./pages/ProposalDetail.tsx"))

export default function App() {
  return (
    <I18nProvider>
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="charts" element={<Charts />} />
          <Route path="charts/:id" element={<ChartDetail />} />
          <Route path="blocks" element={<Blocks />} />
          <Route path="block/:num" element={<BlockDetail />} />
          <Route path="txs" element={<Transactions />} />
          <Route path="confidential" element={<Confidential />} />
          <Route path="tx/:id" element={<TxDetail />} />
          <Route path="op/:id" element={<OpDetail />} />
          <Route path="account/:id" element={<AccountPage />} />
          <Route path="export" element={<ExportData />} />
          <Route path="assets" element={<Assets />} />
          <Route path="asset/:id" element={<AssetDetail />} />
          <Route path="witnesses" element={<Witnesses />} />
          <Route path="committee" element={<Committee />} />
          <Route path="workers" element={<Workers />} />
          <Route path="worker/:id" element={<WorkerDetail />} />
          <Route path="proposals" element={<Proposals />} />
          <Route path="proposal/:id" element={<ProposalDetail />} />
          <Route path="network" element={<Network />} />
          <Route path="nodetracker" element={<NodeTracker />} />
          <Route path="markets" element={<Markets />} />
          <Route path="market/:base/:quote" element={<MarketDetail />} />
          <Route path="pools" element={<Pools />} />
          <Route path="pool/:id" element={<PoolDetail />} />
          <Route path="lending" element={<Lending />} />
          <Route path="credit-offer/:id" element={<CreditOfferDetail />} />
          <Route path="credit-deal/:id" element={<CreditDealDetail />} />
          <Route path="flash" element={<FlashLoans />} />
          <Route path="samet/:id" element={<SametDetail />} />
          <Route path="locking" element={<Locking />} />
          <Route path="ticket/:id" element={<TicketDetail />} />
          <Route path="object/:id" element={<ObjectPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
    </I18nProvider>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
