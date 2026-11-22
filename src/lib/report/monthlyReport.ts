import type { Account } from '../../types/account'
import type { BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import { isBankAccount, reconcileAccount, type AccountReconciliation } from '../balances/reconcile'
import { monthsWithin } from '../analytics/dashboard'
import { resolvePeriod, type PeriodSelection } from '../analytics/reportPeriod'
import { compareCategories, largestExpenses, type CategoryChange, type MonthlyWithRate } from '../analytics/analytics'
import { spendingByCategory, type CategoryTotal } from '../analytics/byCategory'
import { isInPeriod, type MonthComparison, type Period } from '../analytics/periods'
import { summarize, type PeriodSummary } from '../analytics/summary'
import { monthlyTotals } from '../analytics/trends'
import { formatDay, formatMonth, monthsEndingAt, toMonthKey, type ISODate, type MonthKey } from '../dates'
import { formatCents, formatPercent, percentOf, sumCents, type Cents } from '../money'
import { detectRecurring, type RecurringPayment } from '../recurring/detectRecurring'

export interface Observation {
  tone: 'good' | 'bad' | 'neutral'
  text: string
}

export interface MonthlyReport {
  /** A calendar month, or a custom period you chose. */
  kind: 'month' | 'custom'
  /** "Monthly report" or "Custom period report". */
  title: string
  /** "October 2026", "November 2026 · month to date (Nov 1–20)" or "Nov 22 – Dec 22, 2026 · 31 days". */
  subtitle: string
  /** The calendar month; for a custom period, the month it ends in. */
  month: MonthKey
  /** Every transaction in the period, transfers included. */
  transactionCount: number
  /** Recurring payments are detected per calendar month, so only monthly reports list them. */
  recurringAvailable: boolean
  comparison: MonthComparison
  /** e.g. "Nov 1–20" or "November 2026". */
  periodLabel: string
  /** e.g. "Oct 1–20" or "October". */
  previousLabel: string
  summary: PeriodSummary
  previous: PeriodSummary | null
  categories: CategoryTotal[]
  categoryChanges: CategoryChange[]
  biggestExpenses: Transaction[]
  recurring: RecurringPayment[]
  recurringTotal: Cents
  /** Monthly: this month and up to two before it. Custom: each month in the period, counting only days inside it. */
  history: MonthlyWithRate[]
  observations: Observation[]
  /** Balance check for bank accounts that have an opening balance. */
  balanceChecks: AccountReconciliation[]
}

/** A category change is only worth mentioning if it's at least this big… */
export const MIN_CHANGE_CENTS = 2500
/** …and at least this many percent. */
export const MIN_CHANGE_PERCENT = 15

function rangeLabel({ start, end }: Period, wholeMonth: boolean): string {
  return wholeMonth ? formatMonth(toMonthKey(start)) : `${formatDay(start)}–${Number(end.slice(8))}`
}

/** A calendar month's report (kept for callers that only deal in months). */
export function buildMonthlyReport(
  transactions: readonly Transaction[],
  month: MonthKey,
  latestDate: ISODate | null,
  accounts: readonly Account[] = [],
  points: readonly BalancePoint[] = [],
): MonthlyReport {
  return buildReport(transactions, { kind: 'month', month }, latestDate, accounts, points)
}

/**
 * Builds everything in a report, for a calendar month or a custom period.
 * Both the on-screen report and the PDF render this one object, so they can
 * never disagree. Both modes use the same calculations; only the dates differ.
 */
export function buildReport(
  transactions: readonly Transaction[],
  selection: PeriodSelection,
  latestDate: ISODate | null,
  accounts: readonly Account[] = [],
  points: readonly BalancePoint[] = [],
): MonthlyReport {
  const period = resolvePeriod(selection, latestDate)
  const comparison: MonthComparison = { month: period.month ?? toMonthKey(period.current.end), current: period.current, previous: period.previous, isPartial: period.isPartial }
  const summary = summarize(transactions, period.current)
  const prev = summarize(transactions, period.previous)
  const previous = prev.transactionCount > 0 ? prev : null
  const isMonth = period.kind === 'month'
  const recurring = isMonth ? detectRecurring(transactions, period.month!) : []
  const earliest = transactions.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null)
  const withRate = (m: { month: string; income: number; expenses: number; net: number }) => ({ ...m, savingsRate: m.income > 0 ? percentOf(m.net, m.income) : null })

  const report: Omit<MonthlyReport, 'observations' | 'balanceChecks'> = {
    kind: period.kind,
    title: isMonth ? 'Monthly report' : 'Custom period report',
    subtitle: isMonth
      ? `${formatMonth(period.month!)}${period.isPartial ? ` · month to date (${period.label})` : ''}`
      : `${period.label} · ${period.days} ${period.days === 1 ? 'day' : 'days'}${period.isPartial ? ' (your data stops here)' : ''}`,
    month: comparison.month,
    transactionCount: transactions.filter((t) => isInPeriod(t.date, period.current)).length,
    recurringAvailable: isMonth,
    comparison,
    periodLabel: isMonth ? rangeLabel(period.current, !period.isPartial) : period.label,
    previousLabel: isMonth ? rangeLabel(period.previous, !period.isPartial) : `the previous ${period.days} days (${period.previousLabel})`,
    summary,
    previous,
    categories: spendingByCategory(transactions, period.current),
    categoryChanges: previous ? compareCategories(transactions, period.current, period.previous) : [],
    biggestExpenses: largestExpenses(transactions, period.current, 5),
    recurring,
    recurringTotal: sumCents(recurring.map((r) => r.amount)),
    history: isMonth
      ? monthlyTotals(transactions, monthsEndingAt(period.month!, 3).filter((m) => !earliest || m >= toMonthKey(earliest))).map(withRate)
      : monthsWithin(period.current).map(({ month, period: p }) => withRate({ month, ...summarize(transactions, p) })),
  }
  const balanceChecks = accounts
    .filter(isBankAccount)
    .map((a) => reconcileAccount(transactions, a, period, points))
    .filter((r) => r.opening !== null)
  return { ...report, observations: buildObservations(report), balanceChecks }
}

/**
 * Plain-English observations, each computed from the report's numbers.
 * Rules, not guesses: if the data doesn't support a statement, it isn't made.
 */
export function buildObservations(r: Omit<MonthlyReport, 'observations' | 'balanceChecks'>): Observation[] {
  const out: Observation[] = []
  const { summary, previous } = r

  // 1. Did you save?
  if (summary.income > 0) {
    out.push(
      summary.net >= 0
        ? { tone: 'good', text: `You saved ${formatCents(summary.net)}, ${formatPercent(summary.savingsRate)} of your income.` }
        : { tone: 'bad', text: `You spent ${formatCents(-summary.net)} more than you earned.` },
    )
  } else if (summary.expenses > 0) {
    out.push({ tone: 'neutral', text: `No income was recorded, and spending was ${formatCents(summary.expenses)}.` })
  }

  // 2. Overall spending vs the previous period.
  if (previous && previous.expenses > 0) {
    const pct = ((summary.expenses - previous.expenses) / previous.expenses) * 100
    if (Math.abs(pct) >= 5) {
      out.push({
        tone: pct > 0 ? 'bad' : 'good',
        text: `Total spending was ${Math.abs(pct).toFixed(0)}% ${pct > 0 ? 'higher' : 'lower'} than ${r.previousLabel} (${formatCents(summary.expenses)} vs ${formatCents(previous.expenses)}).`,
      })
    }
  }

  // 3. Largest category.
  const top = r.categories[0]
  if (top) {
    out.push({
      tone: 'neutral',
      text: `${top.category} was your largest expense: ${formatCents(top.amount)}, ${Math.round(top.share * 100)}% of spending.`,
    })
  }

  // 4–5. Biggest notable rise and fall by category.
  const notable = r.categoryChanges.filter(
    (c) => c.percent !== null && Math.abs(c.difference) >= MIN_CHANGE_CENTS && Math.abs(c.percent) >= MIN_CHANGE_PERCENT,
  )
  const rise = notable.filter((c) => c.difference > 0).sort((a, b) => b.difference - a.difference)[0]
  const fall = notable.filter((c) => c.difference < 0).sort((a, b) => a.difference - b.difference)[0]
  if (rise) {
    out.push({
      tone: 'bad',
      text: `${rise.category} spending rose ${rise.percent!.toFixed(0)}% (${formatCents(rise.difference, { signed: true })}) compared with ${r.previousLabel}.`,
    })
  }
  if (fall) {
    out.push({
      tone: 'good',
      // "fell 100%" is clumsy: say plainly that there was none.
      text:
        fall.current === 0
          ? `No spending in the ${fall.category} category, down from ${formatCents(fall.previous)} in ${r.previousLabel}.`
          : `${fall.category} spending fell ${Math.abs(fall.percent!).toFixed(0)}% (${formatCents(fall.difference)}) compared with ${r.previousLabel}.`,
    })
  }

  // 6. Recurring payments.
  if (r.recurring.length > 0) {
    out.push({
      tone: 'neutral',
      text: `${r.recurring.length} recurring ${r.recurring.length === 1 ? 'payment' : 'payments'} came to ${formatCents(r.recurringTotal)}.`,
    })
  }

  // 7. Largest single payment.
  const biggest = r.biggestExpenses[0]
  if (biggest) {
    out.push({
      tone: 'neutral',
      text: `Your largest single payment was ${biggest.description} (${formatCents(-biggest.amount)}) on ${formatDay(biggest.date)}.`,
    })
  }

  return out
}
