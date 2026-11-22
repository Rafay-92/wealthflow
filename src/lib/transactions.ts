import type { Category, Transaction } from '../types/transaction'
import { containsKeyword, normalizeMerchantText, suggestKeyword } from './categorize/text'
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

/**
 * What a transaction means for your totals. Decided by category, then sign:
 * transfer - between your own accounts; never income or spending
 * income   - Income category (a negative one is a reversal that lowers income)
 * refund   - money back on a non-income category; lowers spending
 * expense  - money out on a non-income category
 */
export type TransactionType = 'income' | 'expense' | 'refund' | 'transfer'

export const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'refund', label: 'Refunds' },
  { value: 'transfer', label: 'Transfers' },
]

export function transactionType(tx: Transaction): TransactionType {
  if (tx.category === 'Transfers') return 'transfer'
  if (tx.category === 'Income') return 'income'
  return tx.amount > 0 ? 'refund' : 'expense'
}

export type TransactionSort = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

export const SORT_OPTIONS: { value: TransactionSort; label: string }[] = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Largest amount' },
  { value: 'amount-asc', label: 'Smallest amount' },
]

/** Sorts a copy. Amounts sort by size, so a $900 purchase and a $900 deposit rank together. Ties: newest, then id. */
export function sortTransactions(transactions: readonly Transaction[], sort: TransactionSort): Transaction[] {
  const byDate = (a: Transaction, b: Transaction) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)
  const compare: Record<TransactionSort, (a: Transaction, b: Transaction) => number> = {
    'date-desc': byDate,
    'date-asc': (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    'amount-desc': (a, b) => Math.abs(b.amount) - Math.abs(a.amount) || byDate(a, b),
    'amount-asc': (a, b) => Math.abs(a.amount) - Math.abs(b.amount) || byDate(a, b),
  }
  return [...transactions].sort(compare[sort])
}

export interface TransactionFilters {
  search: string
  month: MonthKey | 'all'
  /** Inclusive date range; '' means open-ended. */
  dateFrom: ISODate | ''
  dateTo: ISODate | ''
  category: Category | 'all'
  accountId: string | 'all'
  type: TransactionType | 'all'
  /** Merchant name as typed; matched as whole words, like rules. */
  merchant: string
  /** Only transactions nothing matched (categorySource 'default'). */
  needsReview: boolean
}

export const NO_FILTERS: TransactionFilters = {
  search: '',
  month: 'all',
  dateFrom: '',
  dateTo: '',
  category: 'all',
  accountId: 'all',
  type: 'all',
  merchant: '',
  needsReview: false,
}

/** Merchant names found in your transactions, for suggestions in the merchant filter. */
export function merchantNames(transactions: readonly Transaction[]): string[] {
  const names = new Set<string>()
  for (const tx of transactions) {
    const name = suggestKeyword(tx.description)
    if (name) names.add(name)
  }
  return [...names].sort()
}

export function needsReview(tx: Transaction): boolean {
  return tx.categorySource === 'default'
}

/** Applies every active filter. Search matches description or category, ignoring case. */
export function filterTransactions(transactions: readonly Transaction[], filters: TransactionFilters): Transaction[] {
  const search = filters.search.trim().toLowerCase()
  const merchant = normalizeMerchantText(filters.merchant)
  return transactions.filter(
    (tx) =>
      (filters.month === 'all' || toMonthKey(tx.date) === filters.month) &&
      (filters.dateFrom === '' || tx.date >= filters.dateFrom) &&
      (filters.dateTo === '' || tx.date <= filters.dateTo) &&
      (filters.type === 'all' || transactionType(tx) === filters.type) &&
      (merchant === '' || containsKeyword(normalizeMerchantText(tx.description), merchant)) &&
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
