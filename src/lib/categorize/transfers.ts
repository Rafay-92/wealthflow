import type { Transaction } from '../../types/transaction'
import { daysBetween } from '../dates'
import { PEER_TO_PEER, TRANSFERISH_WORDS } from './builtinRules'
import { containsKeyword, normalizeMerchantText } from './text'

export const PAIR_WINDOW_DAYS = 3

const TRANSFERISH = TRANSFERISH_WORDS.map(normalizeMerchantText)
const P2P = PEER_TO_PEER.map(normalizeMerchantText)

const hasAny = (text: string, words: readonly string[]) => words.some((w) => containsKeyword(text, w))

function isPairCandidate(tx: Transaction): boolean {
  if (!tx.accountId || tx.categorySource === 'manual') return false
  const text = normalizeMerchantText(tx.description)
  return !hasAny(text, P2P)
}

/**
 * Finds money moving between your own accounts by matching both sides:
 * -$425.00 leaving Chequing and +$425.00 arriving on the credit card.
 *
 * A pair must:
 *   - be in two different accounts
 *   - have exactly opposite amounts
 *   - be at most 3 days apart (transfers take time to clear)
 *   - have transfer-like wording on at least one side, so an unrelated
 *     $50 purchase and a $50 refund elsewhere don't pair up by coincidence
 * Each transaction pairs at most once, with the closest date.
 *
 * @returns a map from each paired transaction's id to its partner.
 */
export function findTransferPairs(transactions: readonly Transaction[]): Map<string, Transaction> {
  const pairs = new Map<string, Transaction>()

  const incomingByAmount = new Map<number, Transaction[]>()
  for (const tx of transactions) {
    if (tx.amount <= 0 || !isPairCandidate(tx)) continue
    const list = incomingByAmount.get(tx.amount) ?? []
    list.push(tx)
    incomingByAmount.set(tx.amount, list)
  }

  const outgoing = transactions
    .filter((tx) => tx.amount < 0 && isPairCandidate(tx))
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  for (const out of outgoing) {
    const outText = normalizeMerchantText(out.description)
    let best: Transaction | null = null
    for (const inc of incomingByAmount.get(-out.amount) ?? []) {
      if (pairs.has(inc.id) || inc.accountId === out.accountId) continue
      const gap = daysBetween(out.date, inc.date)
      if (gap > PAIR_WINDOW_DAYS) continue
      if (!hasAny(outText, TRANSFERISH) && !hasAny(normalizeMerchantText(inc.description), TRANSFERISH)) continue
      if (!best || gap < daysBetween(out.date, best.date)) best = inc
    }
    if (best) {
      pairs.set(out.id, best)
      pairs.set(best.id, out)
    }
  }
  return pairs
}
