import type { Transaction } from '../../types/transaction'
import type { WealthEntry, WealthItem } from '../../types/wealth'
import { compareCategories, type MonthlyWithRate } from '../analytics/analytics'
import { spendingByCategory } from '../analytics/byCategory'
import { comparisonPeriods, isInPeriod, monthPeriod } from '../analytics/periods'
import { isTransfer, summarize } from '../analytics/summary'
import { monthlyTotals } from '../analytics/trends'
import { addMonths, formatDay, formatMonth, monthsEndingAt, toMonthKey, type ISODate, type MonthKey } from '../dates'
import { percentOf, sumCents } from '../money'
import { findSubscriptions, groupSubscriptions, type SubscriptionDecision } from '../recurring/subscriptions'
import { needsReview } from '../transactions'
import { netWorthHistory } from '../wealth/netWorth'
import type { InsightContext } from './types'

/** An expense counts as unusual when it's at least this many times its category's typical expense… */
export const UNUSUAL_MULTIPLE = 3
/** …and at least this big, so a $12 purchase in a $4 category isn't flagged. */
export const UNUSUAL_MIN_CENTS = 10000

export interface InsightInputs {
  transactions: readonly Transaction[]
  subscriptionDecisions: readonly SubscriptionDecision[]
  wealthItems: readonly WealthItem[]
  wealthEntries: readonly WealthEntry[]
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/** Does all the maths once, producing the aggregated numbers insights are written from. */
export function buildInsightContext(inputs: InsightInputs, month: MonthKey, latestDate: ISODate): InsightContext {
  const { transactions } = inputs
  const comparison = comparisonPeriods(month, latestDate)
  const prev = summarize(transactions, comparison.previous)
  const earliest = transactions.reduce<string>((min, t) => (t.date < min ? t.date : min), latestDate)
  const label = (p: { start: string; end: string }) =>
    comparison.isPartial ? `${formatDay(p.start)}–${Number(p.end.slice(8))}` : formatMonth(toMonthKey(p.start))

  // Subscriptions
  const overview = groupSubscriptions(findSubscriptions(transactions, latestDate), inputs.subscriptionDecisions)
  const likely = overview.toReview.filter((s) => s.likely && s.active)

  // Unusual expenses: compare each expense with its category's median over the 3 months before.
  const lookback = { start: monthPeriod(addMonths(month, -3)).start, end: monthPeriod(addMonths(month, -1)).end }
  const unusualExpenses = transactions
    .filter((t) => t.amount < 0 && !isTransfer(t) && t.category !== 'Income' && t.category !== 'Housing' && isInPeriod(t.date, comparison.current))
    .flatMap((t) => {
      const past = transactions
        .filter((p) => p.category === t.category && p.amount < 0 && isInPeriod(p.date, lookback))
        .map((p) => -p.amount)
      if (past.length < 3) return []
      const typical = Math.round(median(past))
      const amount = -t.amount
      return amount >= UNUSUAL_MIN_CENTS && amount >= typical * UNUSUAL_MULTIPLE
        ? [{ description: t.description, date: t.date, category: t.category, amount, typical }]
        : []
    })
    .sort((a, b) => b.amount - a.amount)

  // Net worth: the latest two recorded points, if any.
  const nw = netWorthHistory(inputs.wealthItems, inputs.wealthEntries)
  const nwNow = nw.at(-1)
  const nwBefore = nw.at(-2)

  const history: MonthlyWithRate[] = monthlyTotals(
    transactions,
    monthsEndingAt(month, 6).filter((m) => m >= toMonthKey(earliest)),
  ).map((m) => ({ ...m, savingsRate: m.income > 0 ? percentOf(m.net, m.income) : null }))

  return {
    month,
    periodLabel: label(comparison.current),
    previousLabel: label(comparison.previous),
    isPartial: comparison.isPartial,
    current: summarize(transactions, comparison.current),
    previous: prev.transactionCount > 0 ? prev : null,
    categories: spendingByCategory(transactions, comparison.current),
    categoryChanges: prev.transactionCount > 0 ? compareCategories(transactions, comparison.current, comparison.previous) : [],
    history,
    subscriptions: {
      confirmedCount: overview.confirmed.filter((s) => s.active).length,
      confirmedMonthly: overview.monthlyTotal,
      confirmedAnnual: overview.annualTotal,
      unreviewedLikelyCount: likely.length,
      unreviewedLikelyAnnual: sumCents(likely.map((s) => s.annualCost)),
      priceIncreases: [...overview.confirmed, ...overview.toReview]
        .filter((s) => s.active && s.previousAmount !== null && s.lastAmount > s.previousAmount)
        .map((s) => ({ name: s.name, from: s.previousAmount!, to: s.lastAmount })),
    },
    unusualExpenses,
    netWorth: nwNow && nwBefore ? { current: nwNow.netWorth, date: nwNow.date, previous: nwBefore.netWorth, previousDate: nwBefore.date } : null,
    needsReviewCount: transactions.filter((t) => needsReview(t) && isInPeriod(t.date, comparison.current)).length,
  }
}
