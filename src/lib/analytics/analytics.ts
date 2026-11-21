import type { Category, Transaction } from '../../types/transaction'
import { daysBetween, daysInMonth, dateInMonth, monthsBetween, monthsEndingAt, toMonthKey, type ISODate, type MonthKey } from '../dates'
import { percentOf, type Cents } from '../money'
import { spendingByCategory, type CategoryTotal } from './byCategory'
import { comparisonPeriods, isInPeriod, monthPeriod, type MonthComparison, type Period } from './periods'
import { isTransfer, summarize, type PeriodSummary } from './summary'
import { monthlyTotals, type MonthlyTotals } from './trends'

export type RangePreset = 3 | 6 | 12 | 'all'

/** A spending transaction: money out, not a transfer, not income. */
function isSpending(tx: Transaction): boolean {
  return !isTransfer(tx) && tx.category !== 'Income'
}

/** Inclusive day count: Oct 1–Oct 31 is 31 days. */
export function daysInPeriod(period: Period): number {
  return daysBetween(period.start, period.end) + 1
}

/**
 * The months to analyse: the last N months of your data, never starting
 * before your first transaction. 'all' covers first to last month.
 */
export function analysisMonths(earliest: ISODate, latest: ISODate, preset: RangePreset): MonthKey[] {
  const first = toMonthKey(earliest)
  const last = toMonthKey(latest)
  const available = monthsBetween(first, last)
  return monthsEndingAt(last, preset === 'all' ? available : Math.min(preset, available))
}

/**
 * The exact dates the data covers within those months. Statements rarely line
 * up with month boundaries: if yours starts Oct 15, October contributes 17 days,
 * not 31. Averages divide by these days, so they aren't understated.
 */
export function coveredPeriod(months: readonly MonthKey[], earliest: ISODate, latest: ISODate): Period {
  const first = months[0]!
  const last = months.at(-1)!
  const monthStart = dateInMonth(first, 1)
  const monthEnd = dateInMonth(last, daysInMonth(last))
  return {
    start: earliest > monthStart ? earliest : monthStart,
    end: latest < monthEnd ? latest : monthEnd,
  }
}

/** Average spending per calendar day, rounded to whole cents. */
export function averageDailySpending(expenses: Cents, period: Period): Cents {
  return Math.round(expenses / daysInPeriod(period))
}

/** The biggest individual spending transactions in a period, largest first. */
export function largestExpenses(transactions: readonly Transaction[], period: Period, limit: number): Transaction[] {
  return transactions
    .filter((tx) => tx.amount < 0 && isSpending(tx) && isInPeriod(tx.date, period))
    .sort((a, b) => a.amount - b.amount || b.date.localeCompare(a.date))
    .slice(0, limit)
}

export interface CategoryMonth {
  month: MonthKey
  /** Net spending in the category that month (refunds subtracted). */
  amount: Cents
}

/** One category's net spending per month. */
export function categoryByMonth(transactions: readonly Transaction[], category: Category, months: readonly MonthKey[]): CategoryMonth[] {
  return months.map((month) => {
    const period = monthPeriod(month)
    const amount = transactions
      .filter((tx) => tx.category === category && isSpending(tx) && isInPeriod(tx.date, period))
      .reduce((sum, tx) => sum - tx.amount, 0)
    return { month, amount: amount === 0 ? 0 : amount }
  })
}

export interface CategoryChange {
  category: Category
  current: Cents
  previous: Cents
  difference: Cents
  /** null when there was no spending in the previous period. */
  percent: number | null
}

/**
 * Spending per category in two periods, side by side, ordered by the size of
 * the change (biggest movers first, up or down).
 */
export function compareCategories(transactions: readonly Transaction[], current: Period, previous: Period): CategoryChange[] {
  const now = new Map(spendingByCategory(transactions, current).map((c) => [c.category, c.amount]))
  const before = new Map(spendingByCategory(transactions, previous).map((c) => [c.category, c.amount]))
  const categories = new Set([...now.keys(), ...before.keys()])

  return [...categories]
    .map((category) => {
      const c = now.get(category) ?? 0
      const p = before.get(category) ?? 0
      return { category, current: c, previous: p, difference: c - p, percent: p === 0 ? null : ((c - p) / p) * 100 }
    })
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || a.category.localeCompare(b.category))
}

export interface MonthlyWithRate extends MonthlyTotals {
  /** null when the month had no income. */
  savingsRate: number | null
}

export interface AnalyticsData {
  months: MonthKey[]
  period: Period
  summary: PeriodSummary
  averageDaily: Cents
  categories: CategoryTotal[]
  monthly: MonthlyWithRate[]
  /** The latest month in the range compared with the one before it. */
  comparison: MonthComparison
  categoryChanges: CategoryChange[]
  largest: Transaction[]
}

/** Everything the Analytics page shows, for the chosen range. Null when there's no data. */
export function buildAnalytics(transactions: readonly Transaction[], preset: RangePreset): AnalyticsData | null {
  if (transactions.length === 0) return null
  let earliest = transactions[0]!.date
  let latest = earliest
  for (const tx of transactions) {
    if (tx.date < earliest) earliest = tx.date
    if (tx.date > latest) latest = tx.date
  }

  const months = analysisMonths(earliest, latest, preset)
  const period = coveredPeriod(months, earliest, latest)
  const summary = summarize(transactions, period)
  const comparison = comparisonPeriods(months.at(-1)!, latest)

  return {
    months,
    period,
    summary,
    averageDaily: averageDailySpending(summary.expenses, period),
    categories: spendingByCategory(transactions, period),
    monthly: monthlyTotals(transactions, months).map((m) => ({
      ...m,
      savingsRate: m.income > 0 ? percentOf(m.net, m.income) : null,
    })),
    comparison,
    categoryChanges: compareCategories(transactions, comparison.current, comparison.previous),
    largest: largestExpenses(transactions, period, 10),
  }
}
