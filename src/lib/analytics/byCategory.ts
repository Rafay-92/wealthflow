import type { Category, Transaction } from '../../types/transaction'
import type { Cents } from '../money'
import { isInPeriod, type Period } from './periods'
import { isTransfer } from './summary'

export interface CategoryTotal {
  category: Category
  /** Net amount spent, as a positive number. */
  amount: Cents
  /** Fraction of total spending, 0–1. */
  share: number
}

/**
 * Spending per category for a period, largest first.
 * Income and transfers are excluded. A category whose refunds outweigh its
 * purchases (net <= 0) is left out, since it has no spending to show.
 */
export function spendingByCategory(
  transactions: readonly Transaction[],
  period: Period,
): CategoryTotal[] {
  const totals = new Map<Category, Cents>()

  for (const tx of transactions) {
    if (!isInPeriod(tx.date, period) || isTransfer(tx) || tx.category === 'Income') continue
    totals.set(tx.category, (totals.get(tx.category) ?? 0) - tx.amount)
  }

  const positive = [...totals].filter(([, amount]) => amount > 0)
  const grandTotal = positive.reduce((sum, [, amount]) => sum + amount, 0)

  return positive
    .map(([category, amount]) => ({ category, amount, share: amount / grandTotal }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category))
}
