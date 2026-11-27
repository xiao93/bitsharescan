/**
 * Fee-payer extraction matching graphene::protocol::*::fee_payer() in
 * bitshares-core (operation ids 0–77, operations.hpp).
 *
 * Map values are a field name on the signed operation body, or a constant
 * account id (1.2.x) when fee_payer() does not read a body field:
 *   31 committee_member_update_global_parameters → account_id_type()
 *      == GRAPHENE_COMMITTEE_ACCOUNT (1.2.0)
 *   40 blind_transfer / 41 transfer_from_blind → GRAPHENE_TEMP_ACCOUNT (1.2.4)
 *
 * Lookups are by op type only so fields such as `from` on override_transfer
 * (op 38, payer is `issuer`) are never chosen by accident.
 */

export const GRAPHENE_COMMITTEE_ACCOUNT = "1.2.0"
export const GRAPHENE_TEMP_ACCOUNT = "1.2.4"

/** Number of operations in bitshares-core `operation` as of limit_order_update. */
export const KNOWN_OPERATION_COUNT = 78

export const OP_FEE_PAYER_FIELD: Record<number, string> = {
  0: "from", // transfer
  1: "seller", // limit_order_create
  2: "fee_paying_account", // limit_order_cancel
  3: "funding_account", // call_order_update
  4: "account_id", // fill_order (virtual)
  5: "registrar", // account_create
  6: "account", // account_update
  7: "authorizing_account", // account_whitelist
  8: "account_to_upgrade", // account_upgrade
  9: "account_id", // account_transfer
  10: "issuer", // asset_create
  11: "issuer", // asset_update
  12: "issuer", // asset_update_bitasset
  13: "issuer", // asset_update_feed_producers
  14: "issuer", // asset_issue
  15: "payer", // asset_reserve
  16: "from_account", // asset_fund_fee_pool
  17: "account", // asset_settle
  18: "issuer", // asset_global_settle
  19: "publisher", // asset_publish_feed
  20: "witness_account", // witness_create
  21: "witness_account", // witness_update
  22: "fee_paying_account", // proposal_create
  23: "fee_paying_account", // proposal_update
  24: "fee_paying_account", // proposal_delete
  25: "withdraw_from_account", // withdraw_permission_create
  26: "withdraw_from_account", // withdraw_permission_update
  27: "withdraw_to_account", // withdraw_permission_claim
  28: "withdraw_from_account", // withdraw_permission_delete
  29: "committee_member_account", // committee_member_create
  30: "committee_member_account", // committee_member_update
  31: GRAPHENE_COMMITTEE_ACCOUNT, // committee_member_update_global_parameters
  32: "creator", // vesting_balance_create
  33: "owner", // vesting_balance_withdraw
  34: "owner", // worker_create
  35: "payer", // custom
  36: "fee_paying_account", // assert
  37: "deposit_to_account", // balance_claim
  38: "issuer", // override_transfer (not `from`)
  39: "from", // transfer_to_blind
  40: GRAPHENE_TEMP_ACCOUNT, // blind_transfer
  41: GRAPHENE_TEMP_ACCOUNT, // transfer_from_blind
  42: "account", // asset_settle_cancel (virtual)
  43: "issuer", // asset_claim_fees
  44: "account_id", // fba_distribute (virtual)
  45: "bidder", // bid_collateral
  46: "bidder", // execute_bid (virtual)
  47: "issuer", // asset_claim_pool
  48: "issuer", // asset_update_issuer
  49: "from", // htlc_create
  50: "redeemer", // htlc_redeem
  51: "to", // htlc_redeemed (virtual)
  52: "update_issuer", // htlc_extend
  53: "to", // htlc_refund (virtual)
  54: "account", // custom_authority_create
  55: "account", // custom_authority_update
  56: "account", // custom_authority_delete
  57: "account", // ticket_create
  58: "account", // ticket_update
  59: "account", // liquidity_pool_create
  60: "account", // liquidity_pool_delete
  61: "account", // liquidity_pool_deposit
  62: "account", // liquidity_pool_withdraw
  63: "account", // liquidity_pool_exchange
  64: "owner_account", // samet_fund_create
  65: "owner_account", // samet_fund_delete
  66: "owner_account", // samet_fund_update
  67: "borrower", // samet_fund_borrow
  68: "account", // samet_fund_repay
  69: "owner_account", // credit_offer_create
  70: "owner_account", // credit_offer_delete
  71: "owner_account", // credit_offer_update
  72: "borrower", // credit_offer_accept
  73: "account", // credit_deal_repay
  74: "borrower", // credit_deal_expired (virtual)
  75: "account", // liquidity_pool_update
  76: "account", // credit_deal_update
  77: "seller", // limit_order_update
}

/**
 * Ordered fallback for unknown future op types only. More specific payer
 * names come first; `from` is last among common counterparts so an unmapped
 * op that has both `issuer` and `from` does not pick the recipient/source
 * the way the old generic extractor did for override_transfer.
 */
export const FEE_PAYER_FALLBACK_FIELDS = [
  "fee_paying_account",
  "payer",
  "authorizing_account",
  "account_to_upgrade",
  "funding_account",
  "withdraw_to_account",
  "withdraw_from_account",
  "deposit_to_account",
  "from_account",
  "owner_account",
  "committee_member_account",
  "witness_account",
  "update_issuer",
  "registrar",
  "creator",
  "borrower",
  "redeemer",
  "bidder",
  "publisher",
  "seller",
  "issuer",
  "account",
  "account_id",
  "owner",
  "from",
  "to",
] as const

const ACCOUNT_ID = /^1\.2\.\d+$/

function stringAccount(value: unknown): string {
  return typeof value === "string" && value ? value : ""
}

export function feePayerOf(type: number, body: Record<string, unknown> | null | undefined): string {
  const fields = body ?? {}
  const mapped = OP_FEE_PAYER_FIELD[type]
  if (mapped !== undefined) {
    if (ACCOUNT_ID.test(mapped)) return mapped
    return stringAccount(fields[mapped])
  }
  for (const field of FEE_PAYER_FALLBACK_FIELDS) {
    const id = stringAccount(fields[field])
    if (id) return id
  }
  return ""
}
