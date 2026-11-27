import * as Dialog from "@radix-ui/react-dialog"
import { ChevronDown, Globe, Menu, Settings, X } from "lucide-react"
import { Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { NavLink, Outlet, useLocation } from "react-router-dom"
import { loadConfig, saveConfig, type AppConfig } from "../lib/config.ts"
import { getNode, retryNode, type NodeStatus } from "../lib/node.ts"
import { NETWORKS, currentNetwork, networkInfo, switchNetwork, type NetworkId } from "../lib/network.ts"
import { getTheme, setTheme, subscribeTheme, type ThemeChoice } from "../lib/theme.ts"
import { useI18n } from "../lib/i18n.tsx"
import { LANG_OPTIONS } from "../lib/locale.ts"
import { cn } from "../lib/utils.ts"
import { Logo } from "./Logo.tsx"
import { NowProvider, useTimeMode } from "./Now.tsx"
import { localOffsetLabel, localTimeZoneName, setTimeMode } from "../lib/timePref.ts"
import { SearchBar } from "./SearchBar.tsx"
import { Button } from "./ui/button.tsx"
import { DialogContent } from "./ui/dialog.tsx"
import { LoadingBlock } from "./widgets.tsx"

const NAV: Array<{ label: string; to?: string; children?: { label: string; to: string }[] }> = [
  { label: "Home", to: "/" },
  {
    label: "Blockchain",
    children: [
      { label: "Blocks", to: "/blocks" },
      { label: "Transactions", to: "/txs" },
      { label: "Confidential transfers", to: "/confidential" },
      { label: "Charts", to: "/charts" },
      { label: "Node tracker", to: "/nodetracker" },
    ],
  },
  { label: "Assets", to: "/assets" },
  { label: "Markets", to: "/markets" },
  {
    label: "DeFi",
    children: [
      { label: "Liquidity pools", to: "/pools" },
      { label: "Lending", to: "/lending" },
      { label: "Flash loans", to: "/flash" },
      { label: "Locking", to: "/locking" },
    ],
  },
  {
    label: "Governance",
    children: [
      { label: "Committee", to: "/committee" },
      { label: "Witnesses", to: "/witnesses" },
      { label: "Workers", to: "/workers" },
      { label: "Proposals", to: "/proposals" },
    ],
  },
  { label: "Network", to: "/network" },
]

function navClass(active: boolean) {
  return cn(
    "rounded-md px-2.5 py-2 text-sm font-medium",
    active ? "text-link" : "text-ink hover:bg-canvas hover:text-link",
  )
}

function NavDropdown({ label, items }: { label: string; items: { label: string; to: string }[] }) {
  const { t, lang } = useI18n()
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [alignEnd, setAlignEnd] = useState(false)

  function place() {
    const root = rootRef.current
    const menu = menuRef.current
    if (!root || !menu) return
    const trigger = root.getBoundingClientRect()
    const width = menu.offsetWidth
    const margin = 8
    const rtl = getComputedStyle(root).direction === "rtl"
    const overflowsEnd = rtl
      ? trigger.right - width < margin
      : trigger.left + width > window.innerWidth - margin
    const overflowsStart = rtl
      ? trigger.left + width > window.innerWidth - margin
      : trigger.right - width < margin
    setAlignEnd(overflowsEnd && !overflowsStart)
  }

  useLayoutEffect(() => {
    place()
  }, [lang, label, items])

  useEffect(() => {
    const onResize = () => place()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [lang])

  return (
    <div ref={rootRef} className="group relative" onMouseEnter={place} onFocus={place}>
      <button type="button" className="inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium text-ink hover:bg-canvas hover:text-link">
        {t(label)}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </button>
      <div
        ref={menuRef}
        className={cn(
          "invisible absolute top-full z-20 min-w-44 pt-1 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
          alignEnd ? "end-0" : "start-0",
        )}
      >
        <div className="rounded-lg border border-line bg-card py-1 shadow-lg">
          {items.map((child) => (
            <NavLink key={child.to} to={child.to} className={({ isActive }) => cn("block whitespace-nowrap px-3 py-2 text-sm", navClass(isActive))}>
              {t(child.label)}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}

function LanguageMenu() {
  const { t, lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = LANG_OPTIONS.find((option) => option.id === lang) ?? LANG_OPTIONS[0]
  const pathname = useLocation().pathname

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useLayoutEffect(() => {
    if (!open) return
    const menu = menuRef.current
    if (!menu) return
    function place() {
      const node = menuRef.current
      if (!node) return
      node.style.transform = ""
      const box = node.getBoundingClientRect()
      const margin = 8
      let shift = 0
      if (box.left < margin) shift += margin - box.left
      if (box.right + shift > window.innerWidth - margin) shift -= box.right + shift - (window.innerWidth - margin)
      node.style.transform = shift ? `translateX(${shift}px)` : ""
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open, lang])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-7 w-auto items-center gap-1 rounded-md border border-line bg-card px-2 text-xs text-ink"
        aria-label={t("Language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        <span className="whitespace-nowrap">{current.label}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 opacity-70 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div ref={menuRef} className="absolute end-0 top-full z-50 pt-1">
          <div
            role="listbox"
            aria-label={t("Language")}
            className="grid w-72 max-h-[70vh] max-w-[calc(100vw-1rem)] grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-line bg-card p-1.5 shadow-lg sm:w-[26rem] sm:grid-cols-3"
          >
            {LANG_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={lang === option.id}
                onClick={() => {
                  setLang(option.id)
                  setOpen(false)
                }}
                className={cn(
                  "rounded-md px-2 py-1.5 text-start text-xs leading-tight",
                  lang === option.id ? "bg-tint font-medium text-link" : "text-ink hover:bg-canvas",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function Layout() {
  const { t } = useI18n()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<NodeStatus>("connecting")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [endpointsOpen, setEndpointsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  useTimeMode()
  const [theme, setThemeChoice] = useState<ThemeChoice>(getTheme)
  const network = networkInfo()

  useEffect(() => subscribeTheme(setThemeChoice), [])

  useEffect(() => getNode().subscribe(setStatus), [])
  useEffect(() => {
    setOpen(false)
    setSettingsOpen(false)
  }, [location.pathname])
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setSettingsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onPointer)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onPointer)
    }
  }, [settingsOpen])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.key === "/" && target && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        event.preventDefault()
        document.getElementById("page-search")?.focus()
        document.getElementById("hero-search")?.focus()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const dot =
    status === "online" ? "bg-emerald-500" : status === "http" ? "bg-amber-400" : status === "connecting" ? "bg-amber-400" : "bg-red-500"
  const statusLabel =
    status === "online" ? (getNode().host ? `${t("WebSocket")} · ${getNode().host}` : t("WebSocket")) : status === "http" ? t("HTTP proxy") : status === "connecting" ? t("Connecting") : t("Offline")

  return (
    <NowProvider>
      <div className="flex min-h-screen flex-col bg-page">
        <div className="border-b border-line bg-canvas black:bg-black">
          <div className="shell flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1 text-xs text-muted">
            <span className="inline-flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              {t("BitShares {net}", { net: t(network.label) })} · {statusLabel}
            </span>
            <span className="inline-flex flex-wrap items-center gap-2">
              <select
                value={currentNetwork()}
                aria-label={t("Network")}
                onChange={(event) => switchNetwork(event.target.value as NetworkId)}
                className="h-7 rounded-md border border-line bg-card px-2 text-xs text-ink"
              >
                <option value="mainnet">{t("Mainnet")}</option>
                <option value="testnet">{t("Testnet")}</option>
              </select>
              <select
                value={theme}
                aria-label={t("Theme")}
                onChange={(event) => setTheme(event.target.value as ThemeChoice)}
                className="h-7 rounded-md border border-line bg-card px-2 text-xs text-ink"
              >
                <option value="light">{t("Light")}</option>
                <option value="dim">{t("Dim")}</option>
                <option value="black">{t("Black")}</option>
              </select>
              <LanguageMenu />
              <button type="button" className="hover:text-link" onClick={() => { setSettingsOpen(false); setEndpointsOpen(true) }}>
                {t("API endpoints")}
              </button>
            </span>
          </div>
        </div>
        <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
          <div className="shell flex items-center gap-3 py-2">
            <NavLink to="/" className="flex shrink-0 items-center gap-2" aria-label={t("BitSharesScan home")}>
              <Logo />
              <span className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-ink">
                BitSharesScan
                {network.id === "testnet" ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">{t("Testnet")}</span>
                ) : null}
              </span>
            </NavLink>
            <div className="ms-auto flex items-center gap-0.5">
              <nav className="hidden items-center gap-0.5 lg:flex" aria-label={t("Primary")}>
                {NAV.map((item) =>
                  item.children ? (
                    <NavDropdown key={item.label} label={item.label} items={item.children} />
                  ) : (
                    <NavLink key={item.label} to={item.to!} className={({ isActive }) => navClass(isActive)}>
                      {t(item.label)}
                    </NavLink>
                  ),
                )}
              </nav>
              <div ref={settingsRef} className="relative">
                <button
                  type="button"
                  className="inline-flex rounded-md p-2 text-muted hover:bg-canvas hover:text-ink"
                  aria-label={t("Settings")}
                  aria-expanded={settingsOpen}
                  aria-haspopup="dialog"
                  onClick={() => setSettingsOpen((value) => !value)}
                >
                  <Settings className="h-5 w-5" />
                </button>
                {settingsOpen ? <SettingsMenu onEndpoints={() => { setSettingsOpen(false); setEndpointsOpen(true) }} /> : null}
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-ink hover:bg-canvas lg:hidden"
                aria-label={t("Open menu")}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {location.pathname !== "/" ? (
            <div className="border-t border-line">
              <div className="shell flex justify-end py-2">
                <div className="bx-pagesearch w-full">
                  <SearchBar id="page-search" />
                </div>
              </div>
            </div>
          ) : null}
          {open ? (
            <nav className="shell max-h-[calc(100dvh-13rem)] overflow-y-auto border-t border-line py-2 pb-8 lg:hidden" aria-label={t("Mobile")}>
              {NAV.map((item) => (
                <div key={item.label} className="py-1">
                  {item.to ? (
                    <NavLink to={item.to} className={({ isActive }) => cn("block", navClass(isActive))}>
                      {t(item.label)}
                    </NavLink>
                  ) : (
                    <div className="px-2.5 pt-2 text-xs font-semibold tracking-wide text-muted">{t(item.label)}</div>
                  )}
                  {item.children?.map((child) => (
                    <NavLink key={child.to} to={child.to} className={({ isActive }) => cn("block ps-4", navClass(isActive))}>
                      {t(child.label)}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
          ) : null}
        </header>
        {status === "offline" && getNode().lastError ? (
          <div className="border-b border-amber-200 bg-amber-50 py-2 text-sm text-amber-950">
            <div className="shell flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{getNode().lastError}</span>
              <span>
                {t("Browser calls use")} <span className="font-mono">{loadConfig().ws}</span>. {t("If that socket is blocked, run the optional proxy and set an HTTP RPC URL.")}
              </span>
              <button
                type="button"
                className="font-medium text-link"
                onClick={() => {
                  retryNode()
                  window.location.reload()
                }}
              >
                {t("Retry")}
              </button>
            </div>
          </div>
        ) : null}
        <main className="shell w-full flex-1 py-3">
          <Suspense fallback={<LoadingBlock lines={8} />}>
            <Outlet />
          </Suspense>
        </main>
        <footer className="site-footer mt-8 text-sm text-[#c5d0dc]">
          <div className="shell grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <div className="text-base font-semibold text-white">BitSharesScan</div>
              <p className="footer-muted mt-2 text-[#9aabbd]">
                {t("A static BitShares explorer. Blocks, accounts, and markets come from the public node. Operation history, charts, and holders come from Elasticsearch.")}
              </p>
            </div>
            <FooterCol title={t("Explore")}>
              <FooterLink to="/blocks">{t("Blocks")}</FooterLink>
              <FooterLink to="/txs">{t("Transactions")}</FooterLink>
              <FooterLink to="/confidential">{t("Confidential transfers")}</FooterLink>
              <FooterLink to="/assets">{t("Assets")}</FooterLink>
              <FooterLink to="/markets">{t("Markets")}</FooterLink>
            </FooterCol>
            <FooterCol title={t("DeFi")}>
              <FooterLink to="/pools">{t("Liquidity pools")}</FooterLink>
              <FooterLink to="/lending">{t("Lending")}</FooterLink>
              <FooterLink to="/flash">{t("Flash loans")}</FooterLink>
              <FooterLink to="/locking">{t("Locking")}</FooterLink>
            </FooterCol>
            <FooterCol title={t("Governance")}>
              <FooterLink to="/witnesses">{t("Witnesses")}</FooterLink>
              <FooterLink to="/committee">{t("Committee")}</FooterLink>
              <FooterLink to="/workers">{t("Workers")}</FooterLink>
              <FooterLink to="/proposals">{t("Proposals")}</FooterLink>
              <FooterLink to="/network">{t("Parameters & fees")}</FooterLink>
            </FooterCol>
            <FooterCol title={t("Data sources")}>
              <a className="hover:text-white" href="https://api.bitshares.dev" target="_blank" rel="noreferrer">
                api.bitshares.dev
              </a>
              <a className="hover:text-white" href="https://es.bitshares.dev" target="_blank" rel="noreferrer">
                es.bitshares.dev
              </a>
              <a className="hover:text-white" href="https://kibana.bitshares.dev" target="_blank" rel="noreferrer">
                kibana.bitshares.dev
              </a>
              <a className="hover:text-white" href="https://docs.bitshares.dev" target="_blank" rel="noreferrer">
                {t("BitShares docs")}
              </a>
            </FooterCol>
          </div>
          <div className="footer-rule border-t border-white/10">
            <div className="footer-muted shell flex flex-wrap items-center justify-between gap-2 py-4 text-xs text-[#8ea0b3]">
              <span>{t("BitSharesScan reads public chain data. It does not broadcast transactions.")}</span>
              <span>{t("Press / to search")}</span>
            </div>
          </div>
        </footer>
        <EndpointsDialog open={endpointsOpen} onOpenChange={setEndpointsOpen} />
      </div>
    </NowProvider>
  )
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-semibold text-white">{title}</div>
      {children}
    </div>
  )
}

function FooterLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink to={to} className="hover:text-white">
      {children}
    </NavLink>
  )
}

function SettingsMenu({ onEndpoints }: { onEndpoints: () => void }) {
  const { t, lang, setLang } = useI18n()
  const [theme, setThemeChoice] = useState<ThemeChoice>(getTheme)
  const timeMode = useTimeMode()
  useEffect(() => subscribeTheme(setThemeChoice), [])
  return (
    <div className="absolute end-0 top-full z-50 w-80 max-w-[calc(100vw-1.5rem)] pt-1" role="dialog" aria-label={t("Settings")}>
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-card p-3 shadow-lg">
        <Segmented
          label={t("Theme")}
          value={theme}
          options={[
            { value: "light", label: t("Light") },
            { value: "dim", label: t("Dim") },
            { value: "black", label: t("Black") },
          ]}
          onChange={(value) => setTheme(value as ThemeChoice)}
        />
        <Segmented
          label={t("Date Time Format")}
          value={timeMode}
          options={[
            { value: "utc", label: "UTC" },
            { value: "local", label: t("Local") },
          ]}
          onChange={(value) => setTimeMode(value === "local" ? "local" : "utc")}
          hint={`${localTimeZoneName()} · ${localOffsetLabel()}`}
        />
        <div className="mb-2.5">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{t("Language")}</div>
          <div className="grid max-h-[min(20rem,40vh)] grid-cols-2 gap-1 overflow-y-auto pe-0.5" role="listbox" aria-label={t("Language")}>
            {LANG_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={lang === option.id}
                onClick={() => setLang(option.id)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-start text-xs leading-tight",
                  lang === option.id ? "bg-tint font-medium text-link" : "text-ink hover:bg-canvas",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="mt-1 w-full whitespace-normal rounded-md px-2 py-1.5 text-start text-xs font-medium leading-snug text-link hover:bg-canvas" onClick={onEndpoints}>
          {t("API endpoints…")}
        </button>
      </div>
    </div>
  )
}

function Segmented({ label, value, options, onChange, hint }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; hint?: string }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="flex rounded-md border border-line bg-canvas p-0.5" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn("flex-1 rounded px-2 py-1 text-xs font-medium", value === option.value ? "bg-link text-white" : "text-ink hover:bg-card")}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint ? <p className="mt-1 truncate text-[11px] text-muted">{hint}</p> : null}
    </div>
  )
}

function EndpointsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState<AppConfig>(loadConfig())
  useEffect(() => {
    if (open) setForm(loadConfig())
  }, [open])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    saveConfig(form)
    retryNode()
    window.location.reload()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("API endpoints")} description={t("These endpoints are saved for {net} only.", { net: t(networkInfo().label) })}>
        <form className="space-y-3" onSubmit={onSubmit}>
          <p className="text-xs text-muted">{t("The explorer talks to these URLs directly from your browser. Leave HTTP RPC empty unless WebSocket is blocked.")}</p>
          <Field label={t("Node WebSocket")} value={form.ws} onChange={(ws) => setForm({ ...form, ws })} placeholder={NETWORKS[currentNetwork()].defaults.ws} />
          <Field label={t("Elasticsearch")} value={form.es} onChange={(es) => setForm({ ...form, es })} placeholder={NETWORKS[currentNetwork()].defaults.es || t("Leave Elasticsearch empty when this network has no public history index.")} />
          <Field label={t("Optional HTTP RPC proxy")} value={form.http} onChange={(http) => setForm({ ...form, http })} placeholder="http://127.0.0.1:8787" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setForm({ ...NETWORKS[currentNetwork()].defaults })}>
              {t("Reset")}
            </Button>
            <Button type="submit">{t("Save and reload")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog.Root>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-card px-3 font-mono text-xs text-ink outline-none focus:border-link focus:ring-2 focus:ring-link/20"
      />
    </label>
  )
}
