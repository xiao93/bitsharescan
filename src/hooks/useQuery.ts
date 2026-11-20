import { useEffect, useState } from "react"
import { useI18n } from "../lib/i18n.tsx"
import { cleanError } from "../lib/utils.ts"

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setError(null)
    fn().then(
      (value) => {
        if (!cancel) {
          setData(value)
          setLoading(false)
        }
      },
      (err: unknown) => {
        if (!cancel) {
          setData(null)
          setError(cleanError(err))
          setLoading(false)
        }
      },
    )
    return () => {
      cancel = true
    }
    // Caller-supplied deps are the refetch inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken])

  return { data, error, loading, reload: () => setReloadToken((value) => value + 1) }
}

export function useTitle(title: string) {
  const { lang, t } = useI18n()
  useEffect(() => {
    const brand = "BitShares (BTS) Explorer"
    const heading = title ? t(title) : ""
    document.title = heading ? `${heading} | ${brand}` : brand
  }, [title, lang, t])
}
