import type { Transaction } from '../../types/transaction'
import { percentOf, sumCents, type Cents } from '../money'
import { isInPeriod, type Period } from './periods'

export interface PeriodSummary {
  /** Money earned (Income category). */
  income: Cents
  /** Money spent, as a positive number. Refunds reduce it. */
  expenses: Cents
  /** income - expenses. Negative means you spent more than you earned. */
  net: Cents
  /** net as a % of income; null when there was no income. */
  savingsRate: number | null
  transactionCount: number
}

/**
 * Transfers move money between your own accounts — they are neither
 * earning nor spending, so every total in the app ignores them.
 */
export function isTransfer(tx: Transaction): boolean {
  return tx.category === 'Transfers'
}

/**
 * The core financial summary used by the dashboard, reports and insights.
 *
 * Classification is by category, not by sign:
 * - Income category  -> income (a negative entry, e.g. a payroll reversal, reduces it)
 * - Transfers        -> ignored
 * - anything else    -> spending (a positive entry, e.g. a refund, reduces it)
 */
export function summarize(transactions: readonly Transaction[], period: Period): PeriodSummary {
  const incomeAmounts: Cents[] = []
  const spendingAmounts: Cents[] = []
  let transactionCount = 0

  for (const tx of transactions) {
    if (!isInPeriod(tx.date, period) || isTransfer(tx)) continue
    transactionCount++
    if (tx.category === 'Income') incomeAmounts.push(tx.amount)
    else spendingAmounts.push(tx.amount)
  }

  const income = sumCents(incomeAmounts)
  // Spending entries are negative, so flip the sign to get a positive total.
  const expenses = -sumCents(spendingAmounts) || 0 // `|| 0` turns -0 into 0
  const net = income - expenses

  return {
    income,
    expenses,
    net,
    savingsRate: income > 0 ? percentOf(net, income) : null,
    transactionCount,
  }
}
