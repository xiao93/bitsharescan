import { lookupAccountPrefix, lookupAssetPrefix, lookupKey } from "./chain.ts"
import { accountLabel, peekAsset, resolveAccounts } from "./directory.ts"
import { addressPrefix } from "./network.ts"
import { db } from "./node.ts"
import { routeForObject } from "./utils.ts"

function isPublicKey(value: string) {
  return value.startsWith(addressPrefix()) && value.length >= addressPrefix().length + 40
}

export async function quickRoute(raw: string): Promise<string | null> {
  const q = raw.trim()
  if (!q) return null
  if (/^\d+$/.test(q)) return `/block/${Number(q)}`
  if (/^(0x)?[0-9a-fA-F]{40}$/.test(q)) return `/tx/${q.replace(/^0x/i, "").toLowerCase()}`
  if (/^\d+\.\d+\.\d+$/.test(q)) return routeForObject(q)
  if (isPublicKey(q)) {
    const ids = await lookupKey(q)
    if (ids.length === 1) return `/account/${accountLabel(ids[0]).startsWith("1.2.") ? ids[0] : accountLabel(ids[0])}`
    return null
  }
  const lower = q.toLowerCase()
  const [accounts, assets] = await Promise.all([
    db<Array<[string, string]>>("lookup_accounts", [lower, 1]),
    db<Array<{ symbol: string } | null>>("lookup_asset_symbols", [[q, q.toUpperCase()]]),
  ])
  const accountHit = accounts?.[0]?.[0] === lower ? accounts[0][0] : null
  const assetHit = assets?.find((row) => row && row.symbol.toLowerCase() === lower)?.symbol ?? null
  if (accountHit && assetHit && q === lower) return null
  if (accountHit && q === lower) return `/account/${accountHit}`
  if (assetHit) return `/asset/${assetHit}`
  if (accountHit) return `/account/${accountHit}`
  return null
}

export async function searchDirectory(raw: string) {
  const q = raw.trim()
  const [accounts, assets, keys] = await Promise.all([
    q ? lookupAccountPrefix(q, 12) : Promise.resolve([]),
    q ? lookupAssetPrefix(q, 12) : Promise.resolve([]),
    isPublicKey(q) ? lookupKey(q) : Promise.resolve([]),
  ])
  await resolveAccounts(accounts.map((row) => row[1]))
  return {
    accounts: accounts.filter(([name]) => name.startsWith(q.toLowerCase())),
    assets: assets.filter((asset) => peekAsset(asset.id)?.symbol),
    keys,
  }
}
