import { esSearch, esTotal, objectIndex } from "./es.ts"
import { asBig, toFloat } from "./format.ts"
import { db } from "./node.ts"
import type { FullAccount } from "./chain.ts"

export type RelatedAccount = { id: string; name: string }

export async function fetchRelatedAccounts(
  field: "registrar" | "referrer" | "options.voting_account",
  accountId: string,
  page: number,
  pageSize: number,
): Promise<{ rows: RelatedAccount[]; total: number }> {
  const mustNot = field === "options.voting_account" ? [{ term: { id: accountId } }] : []
  const data = await esSearch<{ id?: string; object_id?: string; name?: string }>(objectIndex("account"), {
    from: (page - 1) * pageSize,
    size: pageSize,
    track_total_hits: true,
    sort: [{ "name.keyword": "asc" }],
    _source: ["id", "object_id", "name"],
    query: { bool: { filter: [{ term: { [field]: accountId } }], must_not: mustNot } },
  })
  const rows = (data.hits?.hits ?? []).map((hit) => {
    const source = hit._source ?? {}
    return { id: source.id || source.object_id || hit._id || "", name: source.name || source.id || "" }
  }).filter((row) => row.id)
  return { rows, total: esTotal(data).value }
}

const CORE = "1.3.0"
const FULL_CHUNK = 50
/** get_full_accounts is capped at 50 names. About 2s for 1,300 accounts; larger sets stay on the page sum. */
export const PROXY_TOTAL_LIMIT = 2500

function stakeRawOf(full: FullAccount): bigint {
  let raw = 0n
  for (const balance of full.balances ?? []) {
    if (balance.asset_type === CORE) raw += asBig(balance.balance)
  }
  for (const vest of full.vesting_balances ?? []) {
    if (vest.balance?.asset_id === CORE) raw += asBig(vest.balance.amount)
  }
  return raw
}

async function loadFull(ids: string[]) {
  if (!ids.length) return []
  const rows = await db<Array<[string, FullAccount | null]>>("get_full_accounts", [ids.slice(0, FULL_CHUNK), false])
  return rows ?? []
}

export async function proxyStake(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const row of await loadFull(ids)) {
    const full = row?.[1]
    if (!full?.account) continue
    map.set(full.account.id, toFloat(stakeRawOf(full), 5) ?? 0)
  }
  return map
}

export async function totalProxyStake(accountId: string): Promise<number> {
  const ids: string[] = []
  let total = Number.POSITIVE_INFINITY
  for (let page = 1; ids.length < total && page <= 6; page += 1) {
    const batch = await fetchRelatedAccounts("options.voting_account", accountId, page, 500)
    total = batch.total
    if (total > PROXY_TOTAL_LIMIT) return Number.NaN
    ids.push(...batch.rows.map((row) => row.id))
    if (!batch.rows.length) break
  }
  let raw = 0n
  for (let index = 0; index < ids.length; index += FULL_CHUNK) {
    for (const row of await loadFull(ids.slice(index, index + FULL_CHUNK))) {
      const full = row?.[1]
      if (full?.account) raw += stakeRawOf(full)
    }
  }
  return toFloat(raw, 5) ?? 0
}
