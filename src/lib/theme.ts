export type ThemeChoice = "light" | "dim" | "black"

const KEY = "bitscan.theme"
const listeners = new Set<(theme: ThemeChoice) => void>()

function normalize(value: string | null): ThemeChoice {
  if (value === "dark") return "black"
  if (value === "dim" || value === "black") return value
  return "light"
}

export function getTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    const theme = normalize(value)
    if (value === "dark" || value === "auto") localStorage.setItem(KEY, theme)
    return theme
  } catch {
    return "light"
  }
}

export function applyTheme(theme: ThemeChoice = getTheme()) {
  document.documentElement.setAttribute("data-theme", theme)
  document.documentElement.classList.toggle("dark", theme !== "light")
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark"
}

export function setTheme(theme: ThemeChoice) {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
  listeners.forEach((fn) => fn(theme))
}

export function subscribeTheme(fn: (theme: ThemeChoice) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

if (typeof window !== "undefined") applyTheme()
