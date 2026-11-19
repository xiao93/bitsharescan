import { Search } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useI18n } from "../lib/i18n.tsx"
import { quickRoute } from "../lib/search.ts"
import { cleanError } from "../lib/utils.ts"

export function SearchBar({ size = "md", autoFocus = false, id }: { size?: "md" | "lg"; autoFocus?: boolean; id?: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tall = size === "lg"

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const q = query.trim()
    if (!q) return
    setBusy(true)
    setError(null)
    try {
      const path = await quickRoute(q)
      navigate(path ?? `/search?q=${encodeURIComponent(q)}`)
      setQuery("")
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full" role="search">
      <div className="relative">
        <input
          id={id ?? (tall ? "hero-search" : "header-search")}
          value={query}
          autoFocus={autoFocus}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search by block, transaction, account, asset, or object ID")}
          title={t("Search by block, transaction, account, asset, or object ID")}
          className={`bx-search w-full rounded-lg border border-line bg-card pl-4 pr-14 text-ink outline-none ring-link/20 placeholder:text-muted focus:border-link focus:ring-2 ${tall ? "h-12 text-base" : "h-10 text-sm"}`}
          aria-label={t("Search the BitShares blockchain")}
        />
        <button
          type="submit"
          disabled={busy}
          className={`absolute top-1 right-1 flex items-center justify-center rounded-md bg-link text-white hover:bg-link-dark disabled:opacity-60 ${tall ? "h-10 w-12" : "h-8 w-10"}`}
          aria-label={t("Search")}
        >
          <Search className={tall ? "h-5 w-5" : "h-4 w-4"} />
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </form>
  )
}
