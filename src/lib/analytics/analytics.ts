import type { Category, Transaction } from '../../types/transaction'
import { addDays, daysBetween, daysInMonth, dateInMonth, monthsBetween, monthsEndingAt, toMonthKey, type ISODate, type MonthKey } from '../dates'
import { percentOf, type Cents } from '../money'
import { spendingByCategory, type CategoryTotal } from './byCategory'
import { comparisonPeriods, isInPeriod, monthPeriod, type MonthComparison, type Period } from './periods'
import { isTransfer, summarize, type PeriodSummary } from './summary'
import type { MonthlyTotals } from './trends'
import { bucketKey, bucketPeriod, bucketsBetween, bucketsWithin, compareWithPrevious, type Granularity } from './granularity'

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
  granularity: Granularity
  /** Every calendar month the analysis covers (for per-month averages). */
  months: MonthKey[]
  period: Period
  summary: PeriodSummary
  averageDaily: Cents
  categories: CategoryTotal[]
  /**
   * One row per month, quarter or year (by `granularity`), oldest first.
   * The `month` field holds that period's key: '2026-10', '2026-Q4' or '2026'.
   */
  monthly: MonthlyWithRate[]
  /** The full date range of each row in `monthly`, by key. */
  buckets: { key: string; period: Period }[]
  /** The latest period in the range compared with the one before it. */
  comparison: MonthComparison
  categoryChanges: CategoryChange[]
  largest: Transaction[]
}

/** Quarterly view: at most this many quarters (two years). Yearly view shows every year. */
export const MAX_QUARTERS = 8

/**
 * Everything the Analytics page shows, for the chosen range and grouping.
 * Null when there's no data. Monthly uses `preset` (last 3/6/12 months or all);
 * quarterly shows up to the last 8 quarters, yearly every year.
 */
export function buildAnalytics(
  transactions: readonly Transaction[],
  preset: RangePreset,
  granularity: Granularity = 'month',
  /** A custom date range (both ends included); overrides `preset`. */
  custom?: Period,
): AnalyticsData | null {
  if (transactions.length === 0) return null
  let earliest = transactions[0]!.date
  let latest = earliest
  for (const tx of transactions) {
    if (tx.date < earliest) earliest = tx.date
    if (tx.date > latest) latest = tx.date
  }
  if (custom) return buildCustomAnalytics(transactions, custom, granularity, latest)

  let months: MonthKey[]
  let keys: string[]
  if (granularity === 'month') {
    months = analysisMonths(earliest, latest, preset)
    keys = months
  } else {
    keys = bucketsBetween(bucketKey(earliest, granularity), bucketKey(latest, granularity), granularity)
    if (granularity === 'quarter') keys = keys.slice(-MAX_QUARTERS)
    const firstMonth = toMonthKey(bucketPeriod(keys[0]!, granularity).start)
    months = monthsEndingAt(toMonthKey(latest), monthsBetween(firstMonth < toMonthKey(earliest) ? toMonthKey(earliest) : firstMonth, toMonthKey(latest)))
  }
  const period = coveredPeriod(months, earliest, latest)
  const summary = summarize(transactions, period)
  const lastKey = keys.at(-1)!
  const comparison = granularity === 'month' ? comparisonPeriods(lastKey, latest) : compareWithPrevious(lastKey, granularity, latest)
  const buckets = keys.map((key) => ({ key, period: bucketPeriod(key, granularity) }))

  return {
    granularity,
    months,
    period,
    summary,
    averageDaily: averageDailySpending(summary.expenses, period),
    categories: spendingByCategory(transactions, period),
    monthly: buckets.map(({ key, period: p }) => {
      const { income, expenses, net } = summarize(transactions, p)
      return { month: key, income, expenses, net, savingsRate: income > 0 ? percentOf(net, income) : null }
    }),
    buckets,
    comparison,
    categoryChanges: compareCategories(transactions, comparison.current, comparison.previous),
    largest: largestExpenses(transactions, period, 10),
  }
}

/** One category's net spending in each period (month, quarter or year). */
export function categoryByBucket(transactions: readonly Transaction[], category: Category, buckets: readonly { key: string; period: Period }[]): CategoryMonth[] {
  return buckets.map(({ key, period }) => {
    const amount = transactions
      .filter((tx) => tx.category === category && isSpending(tx) && isInPeriod(tx.date, period))
      .reduce((sum, tx) => sum - tx.amount, 0)
    return { month: key, amount: amount === 0 ? 0 : amount }
  })
}

/**
 * Analytics for any date range: totals for exactly those dates, grouped by
 * day, week, month, quarter or year (each group cut to the range), and
 * compared with the same number of days just before it.
 */
function buildCustomAnalytics(transactions: readonly Transaction[], custom: Period, granularity: Granularity, latest: ISODate): AnalyticsData {
  const [start, requestedEnd] = custom.start <= custom.end ? [custom.start, custom.end] : [custom.end, custom.start]
  const end = latest >= start && latest < requestedEnd ? latest : requestedEnd
  const period = { start, end }
  const days = daysInPeriod(period)
  const buckets = bucketsWithin(period, granularity)
  const summary = summarize(transactions, period)
  const comparison: MonthComparison = {
    month: buckets.at(-1)!.key,
    current: period,
    previous: { start: addDays(start, -days), end: addDays(start, -1) },
    isPartial: end < requestedEnd,
  }
  return {
    granularity,
    months: bucketsWithin(period, 'month').map((b) => b.key),
    period,
    summary,
    averageDaily: averageDailySpending(summary.expenses, period),
    categories: spendingByCategory(transactions, period),
    monthly: buckets.map(({ key, period: p }) => {
      const { income, expenses, net } = summarize(transactions, p)
      return { month: key, income, expenses, net, savingsRate: income > 0 ? percentOf(net, income) : null }
    }),
    buckets,
    comparison,
    categoryChanges: compareCategories(transactions, comparison.current, comparison.previous),
    largest: largestExpenses(transactions, period, 10),
  }
}
