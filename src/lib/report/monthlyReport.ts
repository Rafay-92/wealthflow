import type { Transaction } from '../../types/transaction'
import { compareCategories, largestExpenses, type CategoryChange, type MonthlyWithRate } from '../analytics/analytics'
import { spendingByCategory, type CategoryTotal } from '../analytics/byCategory'
import { comparisonPeriods, type MonthComparison, type Period } from '../analytics/periods'
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
  month: MonthKey
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
  /** This month and up to two before it. */
  history: MonthlyWithRate[]
  observations: Observation[]
}

/** A category change is only worth mentioning if it's at least this big… */
export const MIN_CHANGE_CENTS = 2500
/** …and at least this many percent. */
export const MIN_CHANGE_PERCENT = 15

function rangeLabel({ start, end }: Period, wholeMonth: boolean): string {
  return wholeMonth ? formatMonth(toMonthKey(start)) : `${formatDay(start)}–${Number(end.slice(8))}`
}

/**
 * Builds everything in a monthly report. Both the on-screen report and the
 * PDF render this one object, so they can never disagree.
 */
export function buildMonthlyReport(transactions: readonly Transaction[], month: MonthKey, latestDate: ISODate | null): MonthlyReport {
  const comparison = comparisonPeriods(month, latestDate)
  const summary = summarize(transactions, comparison.current)
  const prev = summarize(transactions, comparison.previous)
  const previous = prev.transactionCount > 0 ? prev : null
  const recurring = detectRecurring(transactions, month)
  const earliest = transactions.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null)

  const report: Omit<MonthlyReport, 'observations'> = {
    month,
    comparison,
    periodLabel: rangeLabel(comparison.current, !comparison.isPartial),
    previousLabel: rangeLabel(comparison.previous, !comparison.isPartial),
    summary,
    previous,
    categories: spendingByCategory(transactions, comparison.current),
    categoryChanges: previous ? compareCategories(transactions, comparison.current, comparison.previous) : [],
    biggestExpenses: largestExpenses(transactions, comparison.current, 5),
    recurring,
    recurringTotal: sumCents(recurring.map((r) => r.amount)),
    history: monthlyTotals(
      transactions,
      monthsEndingAt(month, 3).filter((m) => !earliest || m >= toMonthKey(earliest)),
    ).map((m) => ({ ...m, savingsRate: m.income > 0 ? percentOf(m.net, m.income) : null })),
  }
  return { ...report, observations: buildObservations(report) }
}

/**
 * Plain-English observations, each computed from the report's numbers.
 * Rules, not guesses: if the data doesn't support a statement, it isn't made.
 */
export function buildObservations(r: Omit<MonthlyReport, 'observations'>): Observation[] {
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
