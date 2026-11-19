export type Lang = "en" | "zh"

const KEY = "bitscan.lang"
const listeners = new Set<(lang: Lang) => void>()

function browserLang(): Lang {
  if (typeof navigator === "undefined") return "en"
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

function readLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === "zh" || saved === "en") return saved
  } catch {
    /* private mode */
  }
  return browserLang()
}

let current: Lang = readLang()

export function getLanguage(): Lang {
  return current
}

export function setLanguage(lang: Lang) {
  current = lang
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en"
  for (const listener of listeners) listener(lang)
}

export function subscribeLanguage(listener: (lang: Lang) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (typeof document !== "undefined") {
  document.documentElement.lang = current === "zh" ? "zh-CN" : "en"
}
