import { ChevronDown, Search } from "lucide-react"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useI18n } from "../lib/i18n.tsx"
import { quickRoute } from "../lib/search.ts"
import { cleanError, routeForObject } from "../lib/utils.ts"

export type SearchFilter = "all" | "account" | "asset" | "block" | "tx" | "object" | "key"

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "All Filters" },
  { id: "account", label: "Accounts" },
  { id: "asset", label: "Assets" },
  { id: "block", label: "Blocks" },
  { id: "tx", label: "Transactions" },
  { id: "object", label: "Object ID" },
  { id: "key", label: "Public key" },
]

export function SearchBar({ size = "md", autoFocus = false, id }: { size?: "md" | "lg"; autoFocus?: boolean; id?: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<SearchFilter>("all")
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const tall = size === "lg"

  useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  function buttonLabel(id: SearchFilter) {
    if (id === "all") return tall ? t("All Filters") : t("All")
    return t(FILTERS.find((item) => item.id === id)?.label ?? "All Filters")
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      const path = pathForFilter(filter, q)
      if (path === "invalid-block") {
        setError(t("Enter a block number"))
        return
      }
      if (path === "invalid-tx") {
        setError(t("Enter a transaction id"))
        return
      }
      if (path === "invalid-object") {
        setError(t("Enter an object id like 1.2.3"))
        return
      }
      const next = path ?? (filter === "all" ? await quickRoute(q) : null) ?? `/search?q=${encodeURIComponent(q)}${filter !== "all" ? `&type=${filter}` : ""}`
      navigate(next)
      setQuery("")
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full" role="search">
      <div className={`flex w-full rounded-lg border border-line bg-card focus-within:border-link focus-within:ring-2 focus-within:ring-link/20 ${tall ? "h-12" : "h-10"}`}>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t("All Filters")}
            onClick={() => setOpen((value) => !value)}
            className={`flex h-full items-center gap-1 border-e border-line text-ink hover:bg-line/40 ${tall ? "px-3 text-sm" : "px-2.5 text-xs"}`}
          >
            <span className={`truncate ${tall ? "max-w-[9rem]" : "max-w-[6.5rem]"}`}>{buttonLabel(filter)}</span>
            <ChevronDown className={`shrink-0 text-muted transition-transform duration-200 ${open ? "rotate-180" : ""} ${tall ? "h-4 w-4" : "h-3.5 w-3.5"}`} aria-hidden />
          </button>
          {open ? (
            <ul
              role="listbox"
              aria-label={t("All Filters")}
              className="absolute start-0 top-full z-40 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-line bg-card py-1 shadow-lg"
            >
              {FILTERS.map((item) => (
                <li key={item.id} role="option" aria-selected={filter === item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter(item.id)
                      setOpen(false)
                    }}
                    className={`flex w-full px-3 py-1.5 text-start text-sm hover:bg-line/40 ${filter === item.id ? "bg-tint text-link" : "text-ink"}`}
                  >
                    {t(item.label)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="relative min-w-0 flex-1">
          <input
            id={id ?? (tall ? "hero-search" : "header-search")}
            value={query}
            autoFocus={autoFocus}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Search by block, transaction, account, asset, or object ID")}
            title={t("Search by block, transaction, account, asset, or object ID")}
            className={`bx-search h-full w-full border-0 bg-transparent ps-3 pe-14 text-ink outline-none placeholder:text-muted ${tall ? "text-base" : "text-sm"}`}
            aria-label={t("Search the BitShares blockchain")}
          />
          <button
            type="submit"
            disabled={busy}
            className={`absolute top-1 end-1 flex items-center justify-center rounded-md bg-link text-white hover:bg-link-dark disabled:opacity-60 ${tall ? "h-10 w-12" : "h-8 w-10"}`}
            aria-label={t("Search")}
          >
            <Search className={tall ? "h-5 w-5" : "h-4 w-4"} />
          </button>
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </form>
  )
}

function pathForFilter(filter: SearchFilter, q: string): string | null {
  if (filter === "all") return null
  if (filter === "account") return `/search?q=${encodeURIComponent(q)}&type=account`
  if (filter === "asset") return `/search?q=${encodeURIComponent(q)}&type=asset`
  if (filter === "key") return `/search?q=${encodeURIComponent(q)}&type=key`
  if (filter === "block") return /^\d+$/.test(q) ? `/block/${Number(q)}` : "invalid-block"
  if (filter === "tx") return /^(0x)?[0-9a-fA-F]{40}$/.test(q) ? `/tx/${q.replace(/^0x/i, "").toLowerCase()}` : "invalid-tx"
  if (filter === "object") return /^\d+\.\d+\.\d+$/.test(q) ? routeForObject(q) : "invalid-object"
  return `/search?q=${encodeURIComponent(q)}`
}
