import type { Account } from '../../types/account'
import type { DraftTransaction } from '../../types/import'
import type { Category, CategoryRule, CategorySource, Transaction } from '../../types/transaction'
import { formatDay } from '../dates'
import { formatCents } from '../money'
import { BUILTIN_KEYWORDS, PEER_TO_PEER, STRONG_TRANSFER_PHRASES, WEAK_TRANSFER_PHRASES } from './builtinRules'
import { containsKeyword, normalizeMerchantText } from './text'
import { findTransferPairs } from './transfers'

interface Decision {
  category: Category
  categorySource: CategorySource
  categoryNote: string
}

// Normalise the built-in lists once, and sort keywords longest-first so the
// first match found is the most specific one.
const KEYWORDS = BUILTIN_KEYWORDS.flatMap((group) =>
  group.keywords.map((keyword) => ({
    keyword,
    normalized: normalizeMerchantText(keyword),
    category: group.category,
    direction: group.direction,
  })),
).sort((a, b) => b.normalized.length - a.normalized.length)

const STRONG_TRANSFER = STRONG_TRANSFER_PHRASES.map(normalizeMerchantText)
const WEAK_TRANSFER = WEAK_TRANSFER_PHRASES.map(normalizeMerchantText)
const P2P = PEER_TO_PEER.map(normalizeMerchantText)

/**
 * Categorises every transaction. Pure: returns a new array and never mutates.
 * Transactions whose result didn't change are returned as the SAME object,
 * so callers can find what changed with a cheap `!==` comparison.
 *
 * Runs over the whole list at once because transfer detection needs to see
 * both sides of a transfer, which may be in different imports.
 */
export function categorizeAll(
  transactions: readonly Transaction[],
  rules: readonly CategoryRule[],
  accounts: readonly Account[] = [],
): Transaction[] {
  const pairs = findTransferPairs(transactions)
  const compiledRules = rules
    .map((rule) => ({ rule, normalized: normalizeMerchantText(rule.keyword) }))
    .filter((r) => r.normalized !== '')
    .sort((a, b) => b.normalized.length - a.normalized.length)
  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? 'another account'

  return transactions.map((tx) => {
    if (tx.categorySource === 'manual') return tx

    const decision = decide(tx, compiledRules, pairs.get(tx.id), accountName)
    const unchanged =
      tx.category === decision.category &&
      tx.categorySource === decision.categorySource &&
      tx.categoryNote === decision.categoryNote
    return unchanged ? tx : { ...tx, ...decision }
  })
}

function decide(
  tx: Transaction,
  rules: { rule: CategoryRule; normalized: string }[],
  partner: Transaction | undefined,
  accountName: (id?: string) => string,
): Decision {
  const text = normalizeMerchantText(tx.description)
  const has = (phrases: readonly string[]) => phrases.some((p) => containsKeyword(text, p))
  const isPeerToPeer = has(P2P)

  // 1. Your own rules always win (after manual choices).
  const rule = rules.find((r) => containsKeyword(text, r.normalized))
  if (rule) return { category: rule.rule.category, categorySource: 'rule', categoryNote: `Your rule: “${rule.rule.keyword}”` }

  // 2. Both sides of a transfer found.
  if (partner) {
    return {
      category: 'Transfers',
      categorySource: 'transfer',
      categoryNote: `Matches ${formatCents(partner.amount, { signed: true })} in ${accountName(partner.accountId)} on ${formatDay(partner.date)}`,
    }
  }

  // 3. Clear transfer wording.
  if (!isPeerToPeer && has(STRONG_TRANSFER)) {
    return { category: 'Transfers', categorySource: 'transfer', categoryNote: 'Wording suggests a transfer between your accounts' }
  }

  // 4. Built-in merchant keywords, most specific first.
  const direction = tx.amount > 0 ? 'in' : 'out'
  const match = KEYWORDS.find((k) => (!k.direction || k.direction === direction) && containsKeyword(text, k.normalized))
  if (match) return { category: match.category, categorySource: 'keyword', categoryNote: `Matched “${match.keyword}”` }

  // 5. Weaker transfer wording, only when no merchant matched.
  if (!isPeerToPeer && has(WEAK_TRANSFER)) {
    return { category: 'Transfers', categorySource: 'transfer', categoryNote: 'Wording suggests a card or account payment' }
  }

  // 6. No idea: a safe default, flagged for review.
  return tx.amount > 0
    ? { category: 'Income', categorySource: 'default', categoryNote: 'No match. Assumed income; please check' }
    : { category: 'Other', categorySource: 'default', categoryNote: 'No match found' }
}

/**
 * Predicts categories for rows about to be imported, in the context of what's
 * already saved (so a transfer pair spanning two imports is recognised).
 * Returns one category per draft, in order.
 */
export function previewCategories(
  drafts: readonly DraftTransaction[],
  accountId: string,
  existing: readonly Transaction[],
  rules: readonly CategoryRule[],
  accounts: readonly Account[] = [],
): Category[] {
  const temporary: Transaction[] = drafts.map((d, i) => ({
    id: `preview-${i}`,
    date: d.date,
    description: d.description,
    amount: d.amount,
    category: 'Other',
    accountId,
  }))
  return categorizeAll([...existing, ...temporary], rules, accounts)
    .slice(existing.length)
    .map((tx) => tx.category)
}
