const KEY = "bitscan.hostgeo.v1"
const DAY = 24 * 60 * 60 * 1000

export type HostPlace = { ip: string; country: string; code: string }

type Cache = Record<string, HostPlace & { at: number }>

function readCache(): Cache {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}") as Cache
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeCache(cache: Cache) {
  localStorage.setItem(KEY, JSON.stringify(cache))
}

async function resolveAddress(host: string): Promise<string | null> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return host
  const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(host)}&type=A`)
  if (!response.ok) return null
  const data = await response.json() as { Answer?: Array<{ type?: number; data?: string }> }
  const answer = (data.Answer ?? []).find((row) => row.type === 1 && row.data)
  return answer?.data ?? null
}

async function countryOf(ip: string): Promise<{ country: string; code: string } | null> {
  const response = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`)
  if (!response.ok) return null
  const data = await response.json() as { country?: string; country_code?: string }
  if (!data.country && !data.country_code) return null
  return { country: data.country || data.country_code || "", code: (data.country_code || "").toUpperCase() }
}

export async function locateHost(host: string): Promise<HostPlace | null> {
  const name = host.trim().toLowerCase().replace(/\.$/, "")
  if (!name || name === "localhost") return null
  const cache = readCache()
  const hit = cache[name]
  if (hit && Date.now() - hit.at < DAY && hit.ip) return { ip: hit.ip, country: hit.country, code: hit.code }
  try {
    const ip = await resolveAddress(name)
    if (!ip) return null
    const place = await countryOf(ip)
    if (!place) return null
    const saved = { ip, country: place.country, code: place.code, at: Date.now() }
    cache[name] = saved
    writeCache(cache)
    return saved
  } catch {
    return null
  }
}

export async function locateHosts(hosts: string[]): Promise<Record<string, HostPlace | null>> {
  const unique = [...new Set(hosts.map((host) => host.trim().toLowerCase()).filter(Boolean))]
  const out: Record<string, HostPlace | null> = {}
  for (let index = 0; index < unique.length; index += 3) {
    const chunk = unique.slice(index, index + 3)
    const rows = await Promise.all(chunk.map(async (host) => [host, await locateHost(host)] as const))
    for (const [host, place] of rows) out[host] = place
  }
  return out
}

export function flagEmoji(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return ""
  return [...code].map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65)).join("")
}
