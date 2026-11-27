import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { getLanguage, setLanguage, subscribeLanguage, type Lang } from "./locale.ts"
import { zh } from "./locales/zh.ts"
import { zhTW } from "./locales/zh-TW.ts"
import { ko } from "./locales/ko.ts"
import { ru } from "./locales/ru.ts"
import { ja } from "./locales/ja.ts"

const dictionaries: Record<Lang, Record<string, string> | undefined> = {
  en: undefined,
  zh,
  "zh-TW": zhTW,
  ko,
  ru,
  ja,
}

const I18nContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void; t: (text: string, vars?: Record<string, string | number>) => string } | null>(null)

export function translate(text: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[getLanguage()]
  let out = dict?.[text] ?? text
  if (vars) {
    for (const [key, value] of Object.entries(vars)) out = out.replaceAll(`{${key}}`, String(value))
  }
  return out
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLanguage())
  useEffect(() => subscribeLanguage(setLangState), [])
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
