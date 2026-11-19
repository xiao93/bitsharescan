import { resolveAccounts } from "./directory.ts"
import { esSearch, esSearchDeep, esTotal, objectIndex } from "./es.ts"
import { parseChainTime } from "./format.ts"
import { parseChainJson } from "./json.ts"
import { networkHasEs } from "./network.ts"
import { db } from "./node.ts"
import { fromSignedOp, hydrateOps, type OpView, type SignedOp } from "./ops.ts"

export const PROPOSAL_PAGE_SIZE = 25

export type ProposalTab = "open" | "all"

export type ProposalRow = {
  id?: string
  expiration_time?: string
  review_period_time?: string
  proposer?: string
  required_active_approvals?: string[]
  available_active_approvals?: string[]
  required_owner_approvals?: string[]
  available_owner_approvals?: string[]
  available_key_approvals?: string[]
  fail_reason?: string
  block_time?: string
  block_number?: number
  proposed_transaction?: {
    operations?: unknown
    operations_object?: { which?: number }[]
  }
}

const LIST_FIELDS = [
  "id",
  "expiration_time",
  "review_period_time",
  "proposer",
  "required_active_approvals",
  "available_active_approvals",
  "required_owner_approvals",
  "available_owner_approvals",
  "available_key_approvals",
  "fail_reason",
  "block_time",
  "block_number",
  "proposed_transaction.operations_object.which",
]

function proposalIndex() {
  return objectIndex("proposal")
}

function tabQuery(tab: ProposalTab) {
  return tab === "open"
    ? { range: { expiration_time: { gte: new Date().toISOString().slice(0, 19) } } }
    : { match_all: {} }
}

export function proposalOpen(row: ProposalRow | null | undefined): boolean {
  const at = parseChainTime(row?.expiration_time)
  return Number.isFinite(at) && at > Date.now()
}

export function approvalCount(row: ProposalRow): number {
  return (
    (row.available_active_approvals?.length ?? 0) +
    (row.available_owner_approvals?.length ?? 0) +
    (row.available_key_approvals?.length ?? 0)
  )
}

/** One page of proposals from the Elasticsearch object index, newest first. */
export async function fetchProposals(tab: ProposalTab, page: number) {
  const body = {
    size: PROPOSAL_PAGE_SIZE,
    track_total_hits: true,
    sort: [{ block_time: "desc" }, { "id.keyword": "desc" }],
    query: tabQuery(tab),
    _source: LIST_FIELDS,
  }
  const [data, open] = await Promise.all([
    esSearchDeep<ProposalRow>(proposalIndex(), body, (page - 1) * PROPOSAL_PAGE_SIZE),
    esSearch<ProposalRow>(proposalIndex(), { size: 0, track_total_hits: true, query: tabQuery("open") }).catch(() => null),
  ])
  const rows = (data.hits?.hits ?? []).map((hit) => hit._source ?? {})
  await resolveAccounts(
    rows.flatMap((row) => [row.proposer, ...(row.required_active_approvals ?? []), ...(row.required_owner_approvals ?? [])]),
  )
  const total = esTotal(data)
  return { rows, total: total.value, relation: total.relation, open: open ? esTotal(open).value : null }
}

function operationsOf(value: unknown): SignedOp[] {
  if (Array.isArray(value)) return value as SignedOp[]
  if (typeof value === "string") {
    try {
      const parsed = parseChainJson(value)
      return Array.isArray(parsed) ? (parsed as SignedOp[]) : []
    } catch {
      return []
    }
  }
  return []
}

export class ProposalNotFound extends Error {}

/** A proposal from the node when it still exists, merged over the indexed copy. */
export async function fetchProposal(id: string): Promise<{ obj: ProposalRow; live: boolean; ops: OpView[] }> {
  if (!/^1\.10\.\d+$/.test(id)) throw new ProposalNotFound(id)
  const [live, indexed] = await Promise.all([
    db<Array<ProposalRow | null>>("get_objects", [[id]]).then((rows) => rows?.[0] ?? null).catch(() => null),
    networkHasEs()
      ? esSearch<ProposalRow>(proposalIndex(), {
          size: 1,
          query: { term: { "id.keyword": id } },
          _source: { excludes: ["proposed_transaction.operations_object"] },
        })
          .then((data) => data.hits?.hits?.[0]?._source ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ])
  if (!live && !indexed) throw new ProposalNotFound(id)
  const obj: ProposalRow = { ...(indexed ?? {}), ...(live ?? {}) }
  const ops = operationsOf(live?.proposed_transaction?.operations ?? indexed?.proposed_transaction?.operations).map(
    (op, index) => fromSignedOp(0, obj.expiration_time ?? "", "", 0, index, op),
  )
  await Promise.all([
    hydrateOps(ops),
    resolveAccounts([
      obj.proposer,
      ...(obj.required_active_approvals ?? []),
      ...(obj.available_active_approvals ?? []),
      ...(obj.required_owner_approvals ?? []),
      ...(obj.available_owner_approvals ?? []),
    ]),
  ])
  return { obj, live: Boolean(live), ops }
}
