import type { Transaction } from '../types/transaction'
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
