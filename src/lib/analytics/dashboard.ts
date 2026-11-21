import type { Account } from '../../types/account'
import type { Transaction } from '../../types/transaction'
import { monthsEndingAt, type MonthKey } from '../dates'
import { latestDate, sortNewestFirst } from '../transactions'
import { totalBalance, type BalanceTotal } from './balance'
import { spendingByCategory, type CategoryTotal } from './byCategory'
import { comparisonPeriods, isInPeriod, type MonthComparison } from './periods'
import { summarize, type PeriodSummary } from './summary'
import { monthlyTotals, type MonthlyTotals } from './trends'

export interface DashboardData {
  comparison: MonthComparison
  current: PeriodSummary
  /** null when there is no data at all for the comparison period. */
  previous: PeriodSummary | null
  balance: BalanceTotal | null
  categories: CategoryTotal[]
  trend: MonthlyTotals[]
  recent: Transaction[]
}

export const TREND_MONTHS = 6
export const RECENT_LIMIT = 8

/**
 * Everything the dashboard displays, computed in one pure function.
 * The React page only renders what this returns — which means every number
 * on the dashboard can be unit-tested without a browser.
 */
export function buildDashboard(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  month: MonthKey,
): DashboardData {
  const comparison = comparisonPeriods(month, latestDate(transactions))
  const previous = summarize(transactions, comparison.previous)

  return {
    comparison,
    current: summarize(transactions, comparison.current),
    previous: previous.transactionCount > 0 ? previous : null,
    balance: totalBalance(accounts),
    categories: spendingByCategory(transactions, comparison.current),
    trend: monthlyTotals(transactions, monthsEndingAt(month, TREND_MONTHS)),
    recent: sortNewestFirst(
      transactions.filter((tx) => isInPeriod(tx.date, comparison.current)),
    ).slice(0, RECENT_LIMIT),
  }
}
