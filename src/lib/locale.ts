export type Lang =
  | "en"
  | "zh"
  | "zh-TW"
  | "ko"
  | "ru"
  | "ja"
  | "vi"
  | "id"
  | "es"
  | "pt"
  | "fr"
  | "ar"
  | "fa"
  | "uk"
  | "tr"
  | "de"
  | "hi"
  | "th"
  | "it"
  | "pl"
  | "nl"
  | "ur"
  | "he"
  | "bn"
  | "ms"

export const LANGS: Lang[] = [
  "en",
  "zh",
  "zh-TW",
  "ko",
  "ru",
  "ja",
  "vi",
  "id",
  "es",
  "pt",
  "fr",
  "ar",
  "fa",
  "uk",
  "tr",
  "de",
  "hi",
  "th",
  "it",
  "pl",
  "nl",
  "ur",
  "he",
  "bn",
  "ms",
]

export const RTL_LANGS = new Set<Lang>(["ar", "fa", "ur", "he"])

export const LANG_OPTIONS: { id: Lang; label: string; locale: string }[] = [
  { id: "en", label: "English", locale: "en-US" },
  { id: "zh", label: "简体中文", locale: "zh-CN" },
  { id: "zh-TW", label: "繁體中文", locale: "zh-TW" },
  { id: "ko", label: "한국어", locale: "ko-KR" },
  { id: "ru", label: "Русский", locale: "ru-RU" },
  { id: "ja", label: "日本語", locale: "ja-JP" },
  { id: "vi", label: "Tiếng Việt", locale: "vi-VN" },
  { id: "id", label: "Bahasa Indonesia", locale: "id-ID" },
  { id: "es", label: "Español", locale: "es-ES" },
  { id: "pt", label: "Português", locale: "pt-BR" },
  { id: "fr", label: "Français", locale: "fr-FR" },
  { id: "ar", label: "العربية", locale: "ar-u-nu-latn" },
  { id: "fa", label: "فارسی", locale: "fa-IR-u-nu-latn-ca-gregory" },
  { id: "uk", label: "Українська", locale: "uk-UA" },
  { id: "tr", label: "Türkçe", locale: "tr-TR" },
  { id: "de", label: "Deutsch", locale: "de-DE" },
  { id: "hi", label: "हिन्दी", locale: "hi-IN-u-nu-latn-ca-gregory" },
  { id: "th", label: "ไทย", locale: "th-TH-u-nu-latn-ca-gregory" },
  { id: "it", label: "Italiano", locale: "it-IT" },
  { id: "pl", label: "Polski", locale: "pl-PL" },
  { id: "nl", label: "Nederlands", locale: "nl-NL" },
  { id: "ur", label: "اردو", locale: "ur-PK-u-nu-latn-ca-gregory" },
  { id: "he", label: "עברית", locale: "he-IL-u-nu-latn-ca-gregory" },
  { id: "bn", label: "বাংলা", locale: "bn-BD-u-nu-latn-ca-gregory" },
  { id: "ms", label: "Bahasa Melayu", locale: "ms-MY" },
]

export const LOCALE_TAGS: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
  "zh-TW": "zh-TW",
  ko: "ko-KR",
  ru: "ru-RU",
  ja: "ja-JP",
  vi: "vi-VN",
  id: "id-ID",
  es: "es-ES",
  pt: "pt-BR",
  fr: "fr-FR",
  ar: "ar-u-nu-latn",
  fa: "fa-IR-u-nu-latn-ca-gregory",
  uk: "uk-UA",
  tr: "tr-TR",
  de: "de-DE",
  hi: "hi-IN-u-nu-latn-ca-gregory",
  th: "th-TH-u-nu-latn-ca-gregory",
  it: "it-IT",
  pl: "pl-PL",
  nl: "nl-NL",
  ur: "ur-PK-u-nu-latn-ca-gregory",
  he: "he-IL-u-nu-latn-ca-gregory",
  bn: "bn-BD-u-nu-latn-ca-gregory",
  ms: "ms-MY",
}

const KEY = "bitscan.lang"
const SCRIPT_FONT_ID = "bitscan-script-fonts"
const listeners = new Set<(lang: Lang) => void>()

const SCRIPT_FONTS: Partial<Record<Lang, string>> = {
  ar: "family=Noto+Sans+Arabic:wght@400;500;600;700",
  fa: "family=Vazirmatn:wght@400;500;600;700&family=Noto+Sans+Arabic:wght@400;500;600;700",
  ur: "family=Noto+Sans+Arabic:wght@400;500;600;700",
  he: "family=Noto+Sans+Hebrew:wght@400;500;600;700",
  hi: "family=Noto+Sans+Devanagari:wght@400;500;600;700",
  th: "family=Noto+Sans+Thai:wght@400;500;600;700",
  bn: "family=Noto+Sans+Bengali:wght@400;500;600;700",
}

export function isLang(value: string): value is Lang {
  return (LANGS as string[]).includes(value)
}

export function isRtl(lang?: Lang): boolean {
  return RTL_LANGS.has(lang ?? current)
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
    let base = tag.split("-")[0]
    if (base === "iw") base = "he"
    if (base === "zh") {
      if (tag.includes("hant") || tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-mo")) {
        return "zh-TW"
      }
      return "zh"
    }
    if (isLang(base) && base !== "zh") return base
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

function applyScriptFonts(lang: Lang) {
  if (typeof document === "undefined") return
  const query = SCRIPT_FONTS[lang]
  let link = document.getElementById(SCRIPT_FONT_ID) as HTMLLinkElement | null
  if (query) {
    const href = `https://fonts.googleapis.com/css2?${query}&display=swap`
    if (!link) {
      link = document.createElement("link")
      link.id = SCRIPT_FONT_ID
      link.rel = "stylesheet"
      document.head.appendChild(link)
    }
    if (link.href !== href) link.href = href
  } else if (link) {
    link.remove()
  }
}

function applyDocumentLang(lang: Lang) {
  if (typeof document === "undefined") return
  document.documentElement.lang = localeTag(lang)
  document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr"
  applyScriptFonts(lang)
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
