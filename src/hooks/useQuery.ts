import { useEffect, useState } from "react"
import { useI18n } from "../lib/i18n.tsx"
import { getCached, makeQueryKey, setCached, sharedFetch } from "../lib/queryCache.ts"
import { cleanError } from "../lib/utils.ts"

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[]) {
  const key = makeQueryKey(fn, deps)
  const [data, setData] = useState<T | null>(() => getCached<T>(key) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => getCached<T>(key) === undefined)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancel = false
    const hit = getCached<T>(key)
    if (hit !== undefined) {
      setData(hit)
      setError(null)
      setLoading(false)
    } else {
      setLoading(true)
      setError(null)
    }
    sharedFetch(key, fn).then(
      (value) => {
        if (!cancel) {
          setCached(key, value)
          setData(value)
          setError(null)
          setLoading(false)
        }
      },
      (err: unknown) => {
        if (!cancel) {
          if (hit === undefined) setData(null)
          setError(cleanError(err))
          setLoading(false)
        }
      },
    )
    return () => {
      cancel = true
    }
    // Caller-supplied deps are the refetch inputs; key already encodes them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken, key])

  return { data, error, loading, reload: () => setReloadToken((value) => value + 1) }
}

export function useTitle(title: string) {
  const { lang, t } = useI18n()
  useEffect(() => {
    const brand = t("BitShares (BTS) Blockchain Explorer")
    const heading = title ? t(title) : ""
    document.title = heading ? `${heading} | ${brand}` : brand
  }, [title, lang, t])
}
