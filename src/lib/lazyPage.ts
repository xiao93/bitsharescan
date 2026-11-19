import { lazy, type ComponentType } from "react"

const RELOAD_KEY = "bitscan.chunk-reload"

/**
 * React.lazy for a route. If a chunk fails to load (usually a new deploy replaced the
 * hashed file this tab still points at), reload the page once to pick up the new build.
 */
export function lazyPage<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load()
      store("remove")
      return mod
    } catch (error) {
      if (!store("get")) {
        store("set")
        window.location.reload()
        return new Promise<{ default: T }>(() => {})
      }
      throw error
    }
  })
}

function store(action: "get" | "set" | "remove"): string | null {
  try {
    if (action === "get") return sessionStorage.getItem(RELOAD_KEY)
    if (action === "set") sessionStorage.setItem(RELOAD_KEY, "1")
    else sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    /* private mode: no reload guard, so never auto-reload */
    return action === "get" ? "1" : null
  }
  return null
}
