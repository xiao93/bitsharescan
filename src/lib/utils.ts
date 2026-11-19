import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const linkClass = "font-medium text-link hover:text-link-dark hover:underline"

export function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const assert = message.match(/Assert Exception:\s*([^:\n]+)/)
  if (assert?.[1]) return assert[1].trim()
  if (message.includes("WebSocket")) {
    return "The BitShares node WebSocket could not be reached."
  }
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "The browser could not reach the API. Check the endpoint, or run the optional proxy if WebSocket is blocked."
  }
  return message.length > 320 ? `${message.slice(0, 320)}…` : message
}

export async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      out[index] = await fn(items[index]!)
    }
  })
  await Promise.all(workers)
  return out
}

export function routeForObject(id: string): string {
  const kind = id.split(".").slice(0, 2).join(".")
  if (kind === "1.2") return `/account/${id}`
  if (kind === "1.3") return `/asset/${id}`
  if (kind === "1.11") return `/op/${id}`
  if (kind === "1.10") return `/proposal/${id}`
  if (kind === "1.14") return `/worker/${id}`
  if (kind === "1.13") return `/locking`
  if (kind === "1.18") return `/ticket/${id}`
  if (kind === "1.19") return `/pool/${id}`
  if (kind === "1.20") return `/samet/${id}`
  if (kind === "1.21") return `/credit-offer/${id}`
  if (kind === "1.22") return `/credit-deal/${id}`
  if (kind === "2.0" || kind === "2.1") return "/network"
  return `/object/${id}`
}
