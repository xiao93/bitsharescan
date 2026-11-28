import { feeRatePercent } from "./format.ts"
import { translate } from "./i18n.tsx"
import {
  accountName,
  assetSymbolBit,
  asAmount,
  genericSummaryBits,
  moneyBits,
  namedAmountBits,
  objectBit,
  opLabel,
  phrase,
  summaryText,
  whoBit,
  type OpView,
  type SummaryBit,
} from "./ops.ts"

/**
 * Etherscan-style "Transaction Action": one human-readable sentence per operation,
 * built only from the operation body (and its result, when the index has one).
 * Account names and asset symbols are resolved at render time by SummaryBits.
 */

function receivedBits(op: OpView): SummaryBit[] {
  const data = op.result?.data
  if (!data || typeof data !== "object" || !("received" in data)) return []
  const received = (data as { received?: unknown }).received
  if (!Array.isArray(received)) return []
  const bits: SummaryBit[] = []
  for (const item of received) {
    if (!asAmount(item)) continue
    if (bits.length) bits.push(", ")
    bits.push(...moneyBits(item))
  }
  return bits
}

function lockText(type: unknown): string {
  const names: Record<string, string> = {
    liquid: "liquid",
    lock_180_days: "180-day lock",
    lock_360_days: "360-day lock",
    lock_720_days: "720-day lock",
    lock_forever: "permanent lock",
  }
  const key = typeof type === "string" ? type : ""
  return translate(names[key] ?? (key ? key.replaceAll("_", " ") : "lock"))
}

export function opActionBits(op: OpView): SummaryBit[] {
  const b = op.body
  const who = whoBit(op.feePayer)
  switch (op.type) {
    case 0:
      return phrase("Transfer {amount} from {from} to {to}", { amount: moneyBits(b.amount), from: whoBit(b.from), to: whoBit(b.to) })
    case 1:
      return phrase("{who} placed a limit order: sell {sell} for at least {receive}", {
        who: whoBit(b.seller),
        sell: moneyBits(b.amount_to_sell),
        receive: moneyBits(b.min_to_receive),
      })
    case 2:
      return phrase("{who} cancelled limit order {order}", { who: whoBit(b.fee_paying_account), order: whoBit(b.order) })
    case 3:
      return phrase("{who} adjusted a margin position: collateral {collateral}, debt {debt}", {
        who: whoBit(b.funding_account),
        collateral: moneyBits(b.delta_collateral),
        debt: moneyBits(b.delta_debt),
      })
    case 4:
      return phrase("{who} had order {order} filled: paid {pays}, received {receives}", {
        who: whoBit(b.account_id),
        order: whoBit(b.order_id),
        pays: moneyBits(b.pays),
        receives: moneyBits(b.receives),
      })
    case 5:
      return phrase("{registrar} created account {name}, referrer {referrer}", {
        registrar: whoBit(b.registrar),
        name: accountName(b.name),
        referrer: whoBit(b.referrer),
      })
    case 6:
      return phrase("{account} updated their account settings", { account: whoBit(b.account) })
    case 7: {
      const listing = Number(b.new_listing)
      const state = listing === 1 ? "whitelisted" : listing === 2 ? "blacklisted" : listing === 3 ? "white and black listed" : "removed from lists"
      return phrase("{authorizer} set {account} to {listing}", {
        authorizer: whoBit(b.authorizing_account),
        account: whoBit(b.account_to_list),
        listing: translate(state),
      })
    }
    case 8:
      return phrase("{account} upgraded membership to {level}", {
        account: whoBit(b.account_to_upgrade),
        level: translate(b.upgrade_to_lifetime_member ? "lifetime" : "annual"),
      })
    case 10:
      return phrase("{who} created asset {symbol}", { who: whoBit(b.issuer), symbol: assetSymbolBit(b.symbol) })
    case 14:
      return phrase("{issuer} issued {amount} to {to}", { issuer: whoBit(b.issuer), amount: moneyBits(b.asset_to_issue), to: whoBit(b.issue_to_account) })
    case 15:
      return phrase("{who} reserved (burned) {amount}", { who: whoBit(b.payer), amount: moneyBits(b.amount_to_reserve) })
    case 16:
      return phrase("{who} funded the fee pool of {asset} with {amount}", {
        who: whoBit(b.from_account),
        asset: whoBit(b.asset_id),
        amount: moneyBits({ amount: b.amount as string | number, asset_id: "1.3.0" }),
      })
    case 17:
      return phrase("{who} requested settlement of {amount}", { who: whoBit(b.account), amount: moneyBits(b.amount) })
    case 19:
      return phrase("{publisher} published a price feed for {asset}", { publisher: whoBit(b.publisher), asset: whoBit(b.asset_id) })
    case 22:
      return phrase("{account} created a proposal with {n} operations", {
        account: whoBit(b.fee_paying_account),
        n: String(Array.isArray(b.proposed_ops) ? b.proposed_ops.length : 0),
      })
    case 23:
      return phrase("{who} updated proposal {id}", { who: whoBit(b.fee_paying_account), id: whoBit(b.proposal) })
    case 24:
      return phrase("{who} deleted proposal {id}", { who: whoBit(b.fee_paying_account), id: whoBit(b.proposal) })
    case 33:
      return phrase("{owner} withdrew {amount} from a vesting balance", { owner: whoBit(b.owner), amount: moneyBits(b.amount) })
    case 34:
      return phrase("{owner} created worker {name}", { owner: whoBit(b.owner), name: typeof b.name === "string" ? b.name : "" })
    case 37:
      return phrase("{owner} claimed balance {amount}", { owner: whoBit(b.deposit_to_account), amount: moneyBits(b.total_claimed) })
    case 38:
      return phrase("{issuer} forcibly moved {amount} from {from} to {to}", {
        issuer: whoBit(b.issuer),
        amount: moneyBits(b.amount),
        from: whoBit(b.from),
        to: whoBit(b.to),
      })
    case 39:
      return phrase("{from} moved {amount} into {n} confidential outputs", {
        from: whoBit(b.from),
        amount: moneyBits(b.amount),
        n: String(Array.isArray(b.outputs) ? b.outputs.length : 0),
      })
    case 41:
      return phrase("{to} received {amount} from {n} confidential inputs", {
        to: whoBit(b.to),
        amount: moneyBits(b.amount),
        n: String(Array.isArray(b.inputs) ? b.inputs.length : 0),
      })
    case 49:
      return phrase("{from} locked {amount} in an HTLC for {to}", {
        from: whoBit(b.from),
        amount: moneyBits(b.amount_to_transfer ?? b.amount),
        to: whoBit(b.to),
      })
    case 57:
      return phrase("{who} locked {amount} as {lock}", { who: whoBit(b.account), amount: moneyBits(b.amount), lock: lockText(b.target_type) })
    case 58:
      return phrase("{who} updated ticket {ticket} to {lock}", { who: whoBit(b.account), ticket: whoBit(b.ticket), lock: lockText(b.target_type) })
    case 59:
      return phrase("{who} created liquidity pool {a}/{b}", { who: whoBit(b.account), a: whoBit(b.asset_a), b: whoBit(b.asset_b) })
    case 60:
      return phrase("{who} deleted liquidity pool {pool}", { who: whoBit(b.account), pool: objectBit(b.pool, "") })
    case 61:
      return phrase("{who} deposited {a} and {b} into pool {pool}", {
        who: whoBit(b.account),
        a: moneyBits(b.amount_a),
        b: moneyBits(b.amount_b),
        pool: objectBit(b.pool, "pool"),
      })
    case 62: {
      const received = receivedBits(op)
      const vars = { who: whoBit(b.account), amount: moneyBits(b.share_amount), pool: objectBit(b.pool, "pool"), received }
      return received.length
        ? phrase("{who} redeemed {amount} from pool {pool} and received {received}", vars)
        : phrase("{who} redeemed {amount} from pool {pool}", vars)
    }
    case 63: {
      const received = receivedBits(op)
      const vars = {
        who: whoBit(b.account),
        sell: moneyBits(b.amount_to_sell),
        receive: moneyBits(b.min_to_receive),
        received,
        pool: objectBit(b.pool, "pool"),
      }
      return received.length
        ? phrase("{who} swapped {sell} for {received} in pool {pool}", vars)
        : phrase("{who} swapped {sell} for at least {receive} in pool {pool}", vars)
    }
    case 64:
      return phrase("{who} created flash fund with {amount}, fee {fee}", {
        who: whoBit(b.owner_account),
        amount: namedAmountBits(b, "balance", "asset_type"),
        fee: feeRatePercent(b.fee_rate as number),
      })
    case 65:
      return phrase("{who} deleted flash fund {id}", { who: whoBit(b.owner_account), id: objectBit(b.fund_id, "") })
    case 66:
      return phrase("{who} updated flash fund {id}", { who: whoBit(b.owner_account), id: objectBit(b.fund_id, "") })
    case 67:
      return phrase("{who} flash-borrowed {amount} from fund {fund}", { who: whoBit(b.borrower), amount: moneyBits(b.borrow_amount), fund: objectBit(b.fund_id, "fund") })
    case 68:
      return phrase("{who} repaid {amount} to flash fund {fund}", { who: whoBit(b.account), amount: moneyBits(b.repay_amount), fund: objectBit(b.fund_id, "fund") })
    case 69:
      return phrase("{who} offered {amount} for lending, rate {fee}", {
        who: whoBit(b.owner_account),
        amount: namedAmountBits(b, "balance", "asset_type"),
        fee: feeRatePercent(b.fee_rate as number),
      })
    case 70:
      return phrase("{who} deleted credit offer {id}", { who: whoBit(b.owner_account), id: objectBit(b.offer_id, "") })
    case 71:
      return phrase("{who} updated credit offer {id}", { who: whoBit(b.owner_account), id: objectBit(b.offer_id, "") })
    case 72:
      return phrase("{who} borrowed {amount} against {collateral} from offer {offer}", {
        who: whoBit(b.borrower),
        amount: moneyBits(b.borrow_amount),
        collateral: moneyBits(b.collateral),
        offer: objectBit(b.offer_id, "offer"),
      })
    case 73:
      return phrase("{who} repaid {amount} on credit deal {deal}", { who: whoBit(b.account), amount: moneyBits(b.repay_amount), deal: objectBit(b.deal_id, "deal") })
    case 74:
      return phrase("Credit deal {id} expired", { id: objectBit(b.deal_id, "") })
    case 75:
      return phrase("{who} updated liquidity pool {pool}", { who: whoBit(b.account), pool: objectBit(b.pool, "") })
    case 77:
      return phrase("{who} updated order {order}", { who: whoBit(b.seller), order: whoBit(b.order) })
    default: {
      const details = genericSummaryBits(b)
      const head = phrase("{op} by {who}", { op: opLabel(op.type), who })
      return details.length ? [...head, " · ", ...details] : head
    }
  }
}

export function opActionText(op: OpView): string {
  return summaryText(opActionBits(op))
}
