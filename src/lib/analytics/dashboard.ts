import type { Account } from '../../types/account'
import type { BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import { monthsBetween, monthsEndingAt, toMonthKey, type MonthKey } from '../dates'
import { latestDate, sortNewestFirst } from '../transactions'
import { accountBalances, sumBalances, type AccountBalance, type BalanceTotal } from './balance'
import { spendingByCategory, type CategoryTotal } from './byCategory'
import { isInPeriod, monthPeriod, type MonthComparison, type Period } from './periods'
import { resolvePeriod, type PeriodSelection, type ResolvedPeriod } from './reportPeriod'
import { isTransfer, summarize, type PeriodSummary } from './summary'
import { monthlyTotals, type MonthlyTotals } from './trends'

export interface DashboardData {
  /** The period shown: a calendar month or a custom range. */
  period: ResolvedPeriod
  /** The same dates in the older month-comparison shape. */
  comparison: MonthComparison
  current: PeriodSummary
  /** null when there is no data at all for the comparison period. */
  previous: PeriodSummary | null
  /** Every transaction in the period, transfers included. */
  transactionCount: number
  /** How many of those are transfers between your own accounts. */
  transferCount: number
  /** Sum of the live account balances; null when no account has a known balance. */
  balance: BalanceTotal | null
  accountBalances: AccountBalance[]
  categories: CategoryTotal[]
  /**
   * Income and expenses per month. Calendar month: up to six months ending there.
   * Custom period: each month the range touches, counting only days inside it.
   */
  trend: MonthlyTotals[]
  recent: Transaction[]
}

export const TREND_MONTHS = 6
export const RECENT_LIMIT = 8

/**
 * Up to six months ending at `month`, but not starting before your data does:
 * if your first statement is October, the chart starts at October rather than
 * showing empty months that look like $0 income.
 */
function trendMonths(transactions: readonly Transaction[], month: MonthKey): MonthKey[] {
  const earliest = transactions.reduce<string | null>((min, tx) => (min === null || tx.date < min ? tx.date : min), null)
  const firstMonth = earliest ? toMonthKey(earliest) : month
  return monthsEndingAt(month, TREND_MONTHS).filter((m) => m >= firstMonth)
}

/** Each month a custom range touches, cut to the range (Nov 22–30, then Dec 1–22). */
export function monthsWithin(period: Period): { month: MonthKey; period: Period }[] {
  const last = toMonthKey(period.end)
  return monthsEndingAt(last, monthsBetween(toMonthKey(period.start), last)).map((month) => {
    const full = monthPeriod(month)
    return { month, period: { start: full.start > period.start ? full.start : period.start, end: full.end < period.end ? full.end : period.end } }
  })
}

/**
 * Everything the dashboard displays, computed in one pure function.
 * The React page only renders what this returns — which means every number
 * on the dashboard can be unit-tested without a browser.
 *
 * `selection` is a calendar month ('2026-10' or { kind: 'month' }) or a custom
 * range. Both run through the same calculations; only the dates differ.
 */
export function buildDashboard(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  selection: MonthKey | PeriodSelection,
  points: readonly BalancePoint[] = [],
): DashboardData {
  const period = resolvePeriod(typeof selection === 'string' ? { kind: 'month', month: selection } : selection, latestDate(transactions))
  const previous = summarize(transactions, period.previous)
  const balances = accountBalances(accounts, transactions, points)
  const inPeriod = transactions.filter((tx) => isInPeriod(tx.date, period.current))

  return {
    period,
    comparison: { month: period.month ?? toMonthKey(period.current.end), current: period.current, previous: period.previous, isPartial: period.isPartial },
    current: summarize(transactions, period.current),
    previous: previous.transactionCount > 0 ? previous : null,
    transactionCount: inPeriod.length,
    transferCount: inPeriod.filter(isTransfer).length,
    balance: sumBalances(balances),
    accountBalances: balances,
    categories: spendingByCategory(transactions, period.current),
    trend:
      period.kind === 'month'
        ? monthlyTotals(transactions, trendMonths(transactions, period.month!))
        : monthsWithin(period.current).map(({ month, period: p }) => {
            const { income, expenses, net } = summarize(transactions, p)
            return { month, income, expenses, net }
          }),
    recent: sortNewestFirst(inPeriod).slice(0, RECENT_LIMIT),
  }
}
