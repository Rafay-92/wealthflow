import type { Account } from '../../types/account'
import type { BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import type { StatementBalance } from '../balances/checkpoints'
import { balanceAt, type OpeningSource } from '../balances/reconcile'
import { addDays, monthsEndingAt, toMonthKey, type ISODate, type MonthKey } from '../dates'
import { percentOf, type Cents } from '../money'
import { latestDate, sortNewestFirst } from '../transactions'
import { compareCategories, largestExpenses, type CategoryChange, type MonthlyWithRate } from './analytics'
import { accountBalances, sumBalances, type AccountBalance, type BalanceTotal } from './balance'
import { spendingByCategory, type CategoryTotal } from './byCategory'
import { autoGranularity, bucketsWithin, type Granularity } from './granularity'
import { isInPeriod, type MonthComparison, type Period } from './periods'
import { daysIn, resolvePeriod, type ComparisonMode, type PeriodSelection, type ResolvedPeriod } from './reportPeriod'
import { isTransfer, summarize, type PeriodSummary } from './summary'
import { monthlyTotals } from './trends'

export interface BalanceHistory {
  accountId: string
  name: string
  /** Where the starting balance came from; the line is only as reliable as that. */
  source: OpeningSource
  /** End-of-day balance for each day (or each period end, for long ranges). */
  points: { date: ISODate; balance: Cents; reported: Cents | null }[]
}

export interface DashboardData {
  /** The period shown: a calendar month or a custom range. */
  period: ResolvedPeriod
  /** The same dates in the older month-comparison shape (previous = current when there's no comparison). */
  comparison: MonthComparison
  current: PeriodSummary
  /** null without a comparison, or when the comparison period has no data. */
  previous: PeriodSummary | null
  /** Every transaction in the period, transfers included. */
  transactionCount: number
  /** How many of those are transfers between your own accounts. */
  transferCount: number
  /** Expenses ÷ days in the period (both ends counted), rounded to the cent. */
  averageDailySpending: Cents
  averageDailyIncome: Cents
  largestExpense: Transaction | null
  largestIncome: Transaction | null
  /**
   * Your CURRENT balances: the latest known figure plus every later transaction.
   * They don't depend on the selected period; a historical period's closing
   * balance is shown separately, in the balance check.
   */
  balance: BalanceTotal | null
  accountBalances: AccountBalance[]
  categories: CategoryTotal[]
  /** Spending per category vs the comparison period (empty without one). */
  categoryChanges: CategoryChange[]
  /**
   * Income, expenses and savings rate per month. Calendar month: up to six
   * months ending there. Custom period: each month it touches, counting only days inside it.
   */
  trend: MonthlyWithRate[]
  /** Cash flow inside the period, grouped by day, week, month or year. */
  cashFlow: { granularity: Granularity; rows: MonthlyWithRate[] }
  /** Bank account balances through the period, for accounts with a known starting balance. */
  balanceHistory: BalanceHistory[]
  recent: Transaction[]
}

export interface DashboardOptions {
  comparison?: ComparisonMode
  /** Show one account only; undefined = all accounts. */
  accountId?: string
  /** Grouping for the cash-flow chart; default depends on the period's length. */
  granularity?: Granularity
  checkpoints?: readonly StatementBalance[]
}

export const TREND_MONTHS = 6
export const RECENT_LIMIT = 8
/** Longer periods plot one balance per week/month instead of per day. */
export const MAX_DAILY_POINTS = 370

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
  return bucketsWithin(period, 'month').map(({ key, period: p }) => ({ month: key, period: p }))
}

const withRate = (m: { month: string; income: Cents; expenses: Cents; net: Cents }): MonthlyWithRate => ({
  ...m,
  savingsRate: m.income > 0 ? percentOf(m.net, m.income) : null,
})

/**
 * Each bank account's end-of-day balance through the period. Starts from a
 * real balance (typed, bank-reported, or worked from one) and adds the day's
 * transactions; accounts with no known balance get no line at all, so nothing
 * is invented. Bank-reported balances are kept alongside for comparison.
 */
export function buildBalanceHistory(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  period: Period,
  points: readonly BalancePoint[],
  checkpoints: readonly StatementBalance[],
): BalanceHistory[] {
  const days = daysIn(period)
  const sampleEvery: Granularity | null = days > MAX_DAILY_POINTS ? (days > 4 * 365 ? 'month' : 'week') : null
  const out: BalanceHistory[] = []
  for (const account of accounts) {
    if (account.type === 'credit') continue
    const opening = balanceAt(transactions, account, period.start, points, checkpoints)
    if (!opening) continue
    const byDay = new Map<ISODate, Cents>()
    for (const t of transactions) if (t.accountId === account.id && isInPeriod(t.date, period)) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount)
    const reported = new Map<ISODate, Cents>()
    for (const c of checkpoints) if (c.accountId === account.id) reported.set(addDays(c.date, -1), c.amount)

    const ends = sampleEvery ? new Set(bucketsWithin(period, sampleEvery).map((b) => b.period.end)) : null
    let balance = opening.amount
    const series: BalanceHistory['points'] = []
    for (let date = period.start; date <= period.end; date = addDays(date, 1)) {
      balance += byDay.get(date) ?? 0
      if (!ends || ends.has(date)) series.push({ date, balance, reported: reported.get(date) ?? null })
    }
    out.push({ accountId: account.id, name: account.name, source: opening.source, points: series })
  }
  return out
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
  allTransactions: readonly Transaction[],
  allAccounts: readonly Account[],
  selection: MonthKey | PeriodSelection,
  points: readonly BalancePoint[] = [],
  options: DashboardOptions = {},
): DashboardData {
  const { comparison = 'previous-period', accountId, checkpoints = [] } = options
  const transactions = accountId ? allTransactions.filter((t) => t.accountId === accountId) : allTransactions
  const accounts = accountId ? allAccounts.filter((a) => a.id === accountId) : allAccounts
  // The period's dates come from ALL your data, so switching accounts doesn't move them.
  const period = resolvePeriod(typeof selection === 'string' ? { kind: 'month', month: selection } : selection, latestDate(allTransactions), comparison)
  const current = summarize(transactions, period.current)
  const previous = period.previous ? summarize(transactions, period.previous) : null
  const hasPrevious = previous !== null && previous.transactionCount > 0
  const balances = accountBalances(accounts, transactions, points, checkpoints)
  const inPeriod = transactions.filter((tx) => isInPeriod(tx.date, period.current))
  const incomeTxs = inPeriod.filter((t) => t.category === 'Income' && t.amount > 0).sort((a, b) => b.amount - a.amount)
  const granularity = options.granularity ?? autoGranularity(period.current)

  return {
    period,
    comparison: { month: period.month ?? toMonthKey(period.current.end), current: period.current, previous: period.previous ?? period.current, isPartial: period.isPartial },
    current,
    previous: hasPrevious ? previous : null,
    transactionCount: inPeriod.length,
    transferCount: inPeriod.filter(isTransfer).length,
    averageDailySpending: Math.round(current.expenses / period.days),
    averageDailyIncome: Math.round(current.income / period.days),
    largestExpense: largestExpenses(transactions, period.current, 1)[0] ?? null,
    largestIncome: incomeTxs[0] ?? null,
    balance: sumBalances(balances),
    accountBalances: balances,
    categories: spendingByCategory(transactions, period.current),
    categoryChanges: hasPrevious ? compareCategories(transactions, period.current, period.previous!) : [],
    trend:
      period.kind === 'month'
        ? monthlyTotals(transactions, trendMonths(transactions, period.month!)).map(withRate)
        : monthsWithin(period.current).map(({ month, period: p }) => withRate({ month, ...summarize(transactions, p) })),
    cashFlow: { granularity, rows: bucketsWithin(period.current, granularity).map(({ key, period: p }) => withRate({ month: key, ...summarize(transactions, p) })) },
    balanceHistory: buildBalanceHistory(transactions, accounts, period.current, points, checkpoints),
    recent: sortNewestFirst(inPeriod).slice(0, RECENT_LIMIT),
  }
}
