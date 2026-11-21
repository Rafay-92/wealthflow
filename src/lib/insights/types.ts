import type { CategoryChange, MonthlyWithRate } from '../analytics/analytics'
import type { CategoryTotal } from '../analytics/byCategory'
import type { PeriodSummary } from '../analytics/summary'
import type { ISODate, MonthKey } from '../dates'
import type { Cents } from '../money'
import type { Category } from '../../types/transaction'

export type InsightTone = 'good' | 'bad' | 'neutral'

/** One finding about your finances, with the numbers that back it up. */
export interface Insight {
  /** Stable id: the rule plus what it's about, e.g. "category-change:Restaurants". */
  id: string
  /** Which rule (or, in future, which model) produced it. */
  source: string
  tone: InsightTone
  /** Short headline, e.g. "Restaurant spending is up 64%". */
  title: string
  /** One or two sentences with the specifics. */
  detail: string
  /** How it was calculated: the exact figures, so every claim can be checked. */
  evidence: string[]
  /** Lower comes first. */
  priority: number
}

/**
 * Everything insights are generated from: AGGREGATED numbers only, no raw
 * transaction list. This is deliberately the boundary for a future AI
 * provider: it would receive this object (with the user's explicit opt-in),
 * never the bank statements themselves.
 */
export interface InsightContext {
  month: MonthKey
  periodLabel: string
  previousLabel: string
  isPartial: boolean
  current: PeriodSummary
  previous: PeriodSummary | null
  categories: CategoryTotal[]
  categoryChanges: CategoryChange[]
  /** Up to 6 months ending at `month`, oldest first. */
  history: MonthlyWithRate[]
  subscriptions: {
    confirmedCount: number
    confirmedMonthly: Cents
    confirmedAnnual: Cents
    /** Detected, in the Subscriptions category, but not yet reviewed. */
    unreviewedLikelyCount: number
    unreviewedLikelyAnnual: Cents
    priceIncreases: { name: string; from: Cents; to: Cents }[]
  }
  /** Expenses this period far above what's normal for their category. */
  unusualExpenses: { description: string; date: ISODate; category: Category; amount: Cents; typical: Cents }[]
  netWorth: { current: Cents; date: ISODate; previous: Cents; previousDate: ISODate } | null
  needsReviewCount: number
}

/**
 * Anything that can turn a context into insights. Today that's
 * RuleBasedProvider; an AI-backed provider would implement the same
 * interface, so the rest of the app wouldn't change.
 */
export interface InsightProvider {
  readonly name: string
  generate(context: InsightContext): Promise<Insight[]>
}
