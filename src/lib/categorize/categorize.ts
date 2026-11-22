import type { Account } from '../../types/account'
import type { DraftTransaction } from '../../types/import'
import type { Category, CategoryRule, CategorySource, Transaction } from '../../types/transaction'
import { formatDay } from '../dates'
import { formatCents } from '../money'
import { BUILTIN_KEYWORDS, E_TRANSFER_PHRASES, PEER_TO_PEER, REFUND_PHRASES, STRONG_TRANSFER_PHRASES, WEAK_TRANSFER_PHRASES } from './builtinRules'
import { containsKeyword, normalizeMerchantText, suggestKeyword } from './text'
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
const E_TRANSFER = E_TRANSFER_PHRASES.map(normalizeMerchantText)
const REFUND = REFUND_PHRASES.map(normalizeMerchantText)
const INCOME_KEYWORDS = KEYWORDS.filter((k) => k.category === 'Income')

/** A refund that matched no merchant: its category comes from an earlier purchase, if one is found. */
const UNMATCHED_REFUND = 'unmatched-refund'

/**
 * The merchant a description refers to, ignoring refund wording, so
 * "REFUND - BLUE HERON GIFTS" and "BLUE HERON GIFTS #12" both give "BLUE HERON".
 */
export function merchantKey(description: string): string {
  let text = ` ${normalizeMerchantText(description)} `
  for (const phrase of REFUND) text = text.replaceAll(` ${phrase} `, ' ')
  return suggestKeyword(text.trim())
}

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
  const isCreditAccount = (id?: string) => accounts.some((a) => a.id === id && a.type === 'credit')

  // Pass 1: decide each transaction on its own.
  const decisions = transactions.map((tx) =>
    tx.categorySource === 'manual' ? null : decide(tx, compiledRules, pairs.get(tx.id), accountName, isCreditAccount(tx.accountId)),
  )

  // Pass 2: a refund from an unknown merchant takes the category of the latest
  // purchase from the same merchant, so it reduces the right category's spending.
  const purchases = new Map<string, { date: string; category: Category }>()
  transactions.forEach((tx, i) => {
    const category = decisions[i]?.category ?? tx.category
    if (tx.amount >= 0 || category === 'Income' || category === 'Transfers') return
    const key = merchantKey(tx.description)
    const known = purchases.get(key)
    if (key && (!known || tx.date >= known.date)) purchases.set(key, { date: tx.date, category })
  })

  return transactions.map((tx, i) => {
    let decision = decisions[i]
    if (!decision) return tx
    if (decision.categoryNote === UNMATCHED_REFUND) {
      const purchase = purchases.get(merchantKey(tx.description))
      decision = purchase
        ? { category: purchase.category, categorySource: 'keyword', categoryNote: `Refund: same merchant as a ${purchase.category} purchase on ${formatDay(purchase.date)}` }
        : { category: 'Other', categorySource: 'default', categoryNote: 'Refund or reversal: lowers spending, not counted as income. Please check the category' }
    }
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
  isCreditCard: boolean,
): Decision {
  const text = normalizeMerchantText(tx.description)
  const has = (phrases: readonly string[]) => phrases.some((p) => containsKeyword(text, p))
  const isPeerToPeer = has(P2P)

  // 1. Your own rules always win (after manual choices).
  const rule = rules.find((r) => containsKeyword(text, r.normalized))
  if (rule) return { category: rule.rule.category, categorySource: 'rule', categoryNote: `Your rule: “${rule.rule.keyword}”` }

  // 1b. E-transfers to/from people: their own category, before any merchant keyword.
  if (has(E_TRANSFER)) {
    return tx.amount < 0
      ? { category: 'E-Transfers', categorySource: 'keyword', categoryNote: 'E-transfer sent' }
      : { category: 'Income', categorySource: 'keyword', categoryNote: 'E-transfer received' }
  }

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
  const isRefundWording = has(REFUND)

  // 4a. Money back (refund, return, reversal) is lower spending, never income.
  //     Exception: a keyword that is itself income, like "TAX REFUND".
  if (tx.amount > 0 && isRefundWording && !(match?.category === 'Income' && REFUND.some((r) => containsKeyword(match.normalized, r)))) {
    if (match && match.category !== 'Income') {
      return { category: match.category, categorySource: 'keyword', categoryNote: `Refund: matched “${match.keyword}”` }
    }
    return { category: 'Other', categorySource: 'keyword', categoryNote: UNMATCHED_REFUND }
  }
  // 4b. A reversed paycheque or deposit lowers income instead of counting as spending.
  if (tx.amount < 0 && isRefundWording) {
    const income = INCOME_KEYWORDS.find((k) => containsKeyword(text, k.normalized))
    if (income) return { category: 'Income', categorySource: 'keyword', categoryNote: `Reversal of income (“${income.keyword}”): lowers income` }
  }

  if (match) return { category: match.category, categorySource: 'keyword', categoryNote: `Matched “${match.keyword}”` }

  // 5. Weaker transfer wording, only when no merchant matched.
  if (!isPeerToPeer && has(WEAK_TRANSFER)) {
    return { category: 'Transfers', categorySource: 'transfer', categoryNote: 'Wording suggests a card or account payment' }
  }

  // 6. No idea: a safe default, flagged for review.
  // Money arriving on a credit card is a payment or a refund, never income. Treating
  // it as a payment keeps purchases from being counted twice (on the card and as the payment).
  if (isCreditCard && tx.amount > 0) {
    return { category: 'Transfers', categorySource: 'default', categoryNote: 'Credit on a credit card: assumed to be a card payment. Please check' }
  }
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
