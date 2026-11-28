import { Suspense, useDeferredValue, useEffect, useMemo } from "react"
import { HashRouter, Route, Routes, useLocation } from "react-router-dom"
import { Layout } from "./components/Layout.tsx"
import { LoadingBlock } from "./components/widgets.tsx"
import { I18nProvider } from "./lib/i18n.tsx"
import { NavigationContext } from "./lib/navigation.ts"
import { installLinkPrefetch } from "./lib/routePreload.ts"
import * as pages from "./lib/routePreload.ts"
// The home page ships in the entry chunk; every other page is its own chunk, loaded on first visit.
import Home from "./pages/Home.tsx"

export default function App() {
  return (
    <I18nProvider>
      {/* Urgent location updates let useDeferredValue keep the old page visible and drive the progress bar. */}
      <HashRouter useTransitions={false}>
        <Suspense fallback={<LoadingBlock lines={8} />}>
          <AppShell />
        </Suspense>
      </HashRouter>
    </I18nProvider>
  )
}

function AppShell() {
  const location = useLocation()
  const deferredLocation = useDeferredValue(location)
  const isNavigating =
    location.key !== deferredLocation.key ||
    location.pathname !== deferredLocation.pathname ||
    location.search !== deferredLocation.search ||
    location.hash !== deferredLocation.hash
  const navigation = useMemo(() => ({ isNavigating }), [isNavigating])

  useEffect(() => installLinkPrefetch(), [])

  return (
    <NavigationContext.Provider value={navigation}>
      <ScrollToTop pathname={deferredLocation.pathname} />
      <Layout>
        <Suspense fallback={<LoadingBlock lines={8} />}>
          <Routes location={deferredLocation}>
            <Route index element={<Home />} />
            <Route path="charts" element={<pages.Charts />} />
            <Route path="charts/:id" element={<pages.ChartDetail />} />
            <Route path="large-transfers" element={<pages.LargeTransfers />} />
            <Route path="accounts" element={<pages.Accounts />} />
            <Route path="blocks" element={<pages.Blocks />} />
            <Route path="block/:num" element={<pages.BlockDetail />} />
            <Route path="txs" element={<pages.Transactions />} />
            <Route path="confidential" element={<pages.Confidential />} />
            <Route path="tx/:id" element={<pages.TxDetail />} />
            <Route path="op/:id" element={<pages.OpDetail />} />
            <Route path="account/:id" element={<pages.AccountPage />} />
            <Route path="export" element={<pages.ExportData />} />
            <Route path="assets" element={<pages.Assets />} />
            <Route path="asset/:id" element={<pages.AssetDetail />} />
            <Route path="witnesses" element={<pages.Witnesses />} />
            <Route path="committee" element={<pages.Committee />} />
            <Route path="workers" element={<pages.Workers />} />
            <Route path="worker/:id" element={<pages.WorkerDetail />} />
            <Route path="proposals" element={<pages.Proposals />} />
            <Route path="proposal/:id" element={<pages.ProposalDetail />} />
            <Route path="network" element={<pages.Network />} />
            <Route path="nodetracker" element={<pages.NodeTracker />} />
            <Route path="markets" element={<pages.Markets />} />
            <Route path="market/:asset" element={<pages.MarketOverview />} />
            <Route path="market/:base/:quote" element={<pages.MarketDetail />} />
            <Route path="pools" element={<pages.Pools />} />
            <Route path="pool/:id" element={<pages.PoolDetail />} />
            <Route path="lending" element={<pages.Lending />} />
            <Route path="credit-offer/:id" element={<pages.CreditOfferDetail />} />
            <Route path="credit-deal/:id" element={<pages.CreditDealDetail />} />
            <Route path="flash" element={<pages.FlashLoans />} />
            <Route path="samet/:id" element={<pages.SametDetail />} />
            <Route path="locking" element={<pages.Locking />} />
            <Route path="ticket/:id" element={<pages.TicketDetail />} />
            <Route path="object/:id" element={<pages.ObjectPage />} />
            <Route path="search" element={<pages.SearchPage />} />
            <Route path="*" element={<pages.NotFound />} />
          </Routes>
        </Suspense>
      </Layout>
    </NavigationContext.Provider>
  )
}

function ScrollToTop({ pathname }: { pathname: string }) {
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
