import { Link } from "react-router-dom"
import { SearchBar } from "../components/SearchBar.tsx"
import { useTitle } from "../hooks/useQuery.ts"
import { useI18n } from "../lib/i18n.tsx"

export default function NotFound() {
  const { t } = useI18n()
  useTitle("Page not found")
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <h1 className="text-2xl font-semibold">{t("Page not found")}</h1>
      <p className="mt-2 text-sm text-muted">{t("That path is not part of the explorer. Search for a block, account, or asset instead.")}</p>
      <div className="mt-6 text-left">
        <SearchBar size="lg" />
      </div>
      <Link to="/" className="mt-6 inline-block text-sm font-medium text-link">{t("Back to the home page")}</Link>
    </div>
  )
}
