import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { getLanguage, setLanguage, subscribeLanguage, type Lang } from "./locale.ts"

type Dict = Record<string, string>

const loaders: Record<Exclude<Lang, "en">, () => Promise<Dict>> = {
  zh: () => import("./locales/zh.ts").then((m) => m.zh),
  "zh-TW": () => import("./locales/zh-TW.ts").then((m) => m.zhTW),
  ko: () => import("./locales/ko.ts").then((m) => m.ko),
  ru: () => import("./locales/ru.ts").then((m) => m.ru),
  ja: () => import("./locales/ja.ts").then((m) => m.ja),
  vi: () => import("./locales/vi.ts").then((m) => m.vi),
  id: () => import("./locales/id.ts").then((m) => m.id),
  es: () => import("./locales/es.ts").then((m) => m.es),
  pt: () => import("./locales/pt.ts").then((m) => m.pt),
  fr: () => import("./locales/fr.ts").then((m) => m.fr),
  ar: () => import("./locales/ar.ts").then((m) => m.ar),
  fa: () => import("./locales/fa.ts").then((m) => m.fa),
  uk: () => import("./locales/uk.ts").then((m) => m.uk),
}

const loaded: Partial<Record<Lang, Dict>> = {}
const inflight = new Map<Lang, Promise<Dict>>()

export function loadLocale(lang: Lang): Promise<Dict | undefined> {
  if (lang === "en") return Promise.resolve(undefined)
  const cached = loaded[lang]
  if (cached) return Promise.resolve(cached)
  let pending = inflight.get(lang)
  if (!pending) {
    pending = loaders[lang]().then((dict) => {
      loaded[lang] = dict
      inflight.delete(lang)
      return dict
    })
    inflight.set(lang, pending)
  }
  return pending
}

export function translate(text: string, vars?: Record<string, string | number>): string {
  const dict = getLanguage() === "en" ? undefined : loaded[getLanguage()]
  let out = dict?.[text] ?? text
  if (vars) {
    for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value))
  }
  return out
}

const I18nContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: (text: string, vars?: Record<string, string | number>) => string } | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLanguage())
  const [, setReady] = useState(0)
  useEffect(() => subscribeLanguage(setLangState), [])
  useEffect(() => {
    if (lang === "en") return
    if (loaded[lang]) return
    let cancelled = false
    void loadLocale(lang).then(() => {
      if (!cancelled) setReady((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [lang])
  const value = useMemo(
    () => ({
      lang,
      setLang: setLanguage,
      t: translate,
    }),
    [lang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}
