export type Lang = "en" | "zh" | "zh-TW" | "ko" | "ru" | "ja"

export const LANGS: Lang[] = ["en", "zh", "zh-TW", "ko", "ru", "ja"]

export const LANG_OPTIONS: { id: Lang; label: string; locale: string }[] = [
  { id: "en", label: "English", locale: "en-US" },
  { id: "zh", label: "简体中文", locale: "zh-CN" },
  { id: "zh-TW", label: "繁體中文", locale: "zh-TW" },
  { id: "ko", label: "한국어", locale: "ko-KR" },
  { id: "ru", label: "Русский", locale: "ru-RU" },
  { id: "ja", label: "日本語", locale: "ja-JP" },
]

export const LOCALE_TAGS: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ko: "ko-KR",
  ru: "ru-RU",
  ja: "ja-JP",
}

const KEY = "bitscan.lang"
const listeners = new Set<(lang: Lang) => void>()

export function isLang(value: string): value is Lang {
  return (LANGS as string[]).includes(value)
}

export function localeTag(lang?: Lang): string {
  return LOCALE_TAGS[lang ?? current]
}

function browserLang(): Lang {
  if (typeof navigator === "undefined") return "en"
  const tags: string[] = []
  if (Array.isArray(navigator.languages)) tags.push(...navigator.languages)
  if (navigator.language) tags.push(navigator.language)
  for (const raw of tags) {
    if (!raw) continue
    const tag = raw.toLowerCase().replace(/_/g, "-")
    const base = tag.split("-")[0]
    if (base === "zh") {
      if (tag.includes("hant") || tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-mo")) {
        return "zh-TW"
      }
      return "zh"
    }
    if (base === "ko") return "ko"
    if (base === "ru") return "ru"
    if (base === "ja") return "ja"
  }
  return "en"
}

function readLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && isLang(saved)) return saved
  } catch {
    /* private mode */
  }
  return browserLang()
}

let current: Lang = readLang()

export function getLanguage(): Lang {
  return current
}

function applyDocumentLang(lang: Lang) {
  if (typeof document === "undefined") return
  document.documentElement.lang = localeTag(lang)
}

export function setLanguage(lang: Lang) {
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* ignore */
  }
  applyDocumentLang(lang)
  for (const listener of listeners) listener(lang)
}

export function subscribeLanguage(listener: (lang: Lang) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

applyDocumentLang(current)
