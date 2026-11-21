import type { Category, Transaction } from '../types/transaction'
import { containsKeyword, normalizeMerchantText } from './categorize/text'
import { toMonthKey, type ISODate, type MonthKey } from './dates'

/** Newest first; ties broken by id so the order is stable between renders. */
export function sortNewestFirst(transactions: readonly Transaction[]): Transaction[] {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

/** The most recent transaction date, or null if there are none. */
export function latestDate(transactions: readonly Transaction[]): ISODate | null {
  let latest: ISODate | null = null
  for (const tx of transactions) if (latest === null || tx.date > latest) latest = tx.date
  return latest
}

/** Every month that has at least one transaction, newest first. */
export function availableMonths(transactions: readonly Transaction[]): MonthKey[] {
  return [...new Set(transactions.map((tx) => toMonthKey(tx.date)))].sort().reverse()
}

export interface TransactionFilters {
  search: string
  month: MonthKey | 'all'
  category: Category | 'all'
  accountId: string | 'all'
  /** Only transactions nothing matched (categorySource 'default'). */
  needsReview: boolean
}

export const NO_FILTERS: TransactionFilters = { search: '', month: 'all', category: 'all', accountId: 'all', needsReview: false }

export function needsReview(tx: Transaction): boolean {
  return tx.categorySource === 'default'
}

/** Applies every active filter. Search matches description or category, ignoring case. */
export function filterTransactions(transactions: readonly Transaction[], filters: TransactionFilters): Transaction[] {
  const search = filters.search.trim().toLowerCase()
  return transactions.filter(
    (tx) =>
      (filters.month === 'all' || toMonthKey(tx.date) === filters.month) &&
      (filters.category === 'all' || tx.category === filters.category) &&
      (filters.accountId === 'all' || tx.accountId === filters.accountId) &&
      (!filters.needsReview || needsReview(tx)) &&
      (search === '' || tx.description.toLowerCase().includes(search) || tx.category.toLowerCase().includes(search)),
  )
}

/**
 * The transactions a new rule for `keyword` would re-categorise: those whose
 * description contains it, excluding ones you've set by hand.
 */
export function transactionsMatchingKeyword(transactions: readonly Transaction[], keyword: string): Transaction[] {
  const normalized = normalizeMerchantText(keyword)
  if (normalized === '') return []
  return transactions.filter(
    (tx) => tx.categorySource !== 'manual' && containsKeyword(normalizeMerchantText(tx.description), normalized),
  )
}
