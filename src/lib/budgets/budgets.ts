import type { Budget } from '../../types/budget'
import { CATEGORIES, type Category, type Transaction } from '../../types/transaction'
import { comparisonPeriods } from '../analytics/periods'
import { isInPeriod } from '../analytics/periods'
import { daysBetween, daysInMonth, type ISODate, type MonthKey } from '../dates'
import { sumCents, type Cents } from '../money'

/** Categories you can budget for: spending ones. Income and transfers aren't spending. */
export const BUDGET_CATEGORIES: readonly Category[] = CATEGORIES.filter((c) => c !== 'Income' && c !== 'Transfers')

export type BudgetStatus = 'ok' | 'near' | 'over'
/** "Near" from this share of the budget used. */
export const NEAR_LIMIT = 0.8

export interface BudgetLine {
  category: Category
  /** null when this category has spending but no budget. */
  budget: Cents | null
  /** Net spending this month: purchases minus refunds, never below zero. */
  spent: Cents
  /** budget − spent; negative when over budget. null without a budget. */
  remaining: Cents | null
  /** spent ÷ budget × 100. null without a budget. */
  percentUsed: number | null
  status: BudgetStatus | null
}

export interface BudgetSummary {
  month: MonthKey
  /** Budgeted categories first (most used first), then unbudgeted spending. */
  lines: BudgetLine[]
  totalBudget: Cents
  /** Spending in budgeted categories only, so it compares fairly with totalBudget. */
  totalSpent: Cents
  totalRemaining: Cents
  /** Spending in categories without a budget. */
  unbudgetedSpent: Cents
  /** Share of the month gone (1 for a finished month), to judge the pace. */
  monthElapsed: number
  isPartial: boolean
}

function statusFor(spent: Cents, budget: Cents): BudgetStatus {
  if (spent > budget) return 'over'
  return spent >= budget * NEAR_LIMIT ? 'near' : 'ok'
}

/**
 * Budget vs actual spending for one month, worked out fresh from the
 * transactions every time. Nothing is stored except the budget amounts, so
 * adding, editing or deleting a transaction updates every line immediately.
 *
 * Spending uses the same rules as every other total in the app: transfers
 * and income are excluded, and refunds reduce the category they belong to.
 */
export function budgetSummary(transactions: readonly Transaction[], budgets: readonly Budget[], month: MonthKey, latestDate: ISODate | null): BudgetSummary {
  const { current, isPartial } = comparisonPeriods(month, latestDate)
  const net = new Map<Category, Cents[]>()
  for (const tx of transactions) {
    if (!isInPeriod(tx.date, current) || tx.category === 'Income' || tx.category === 'Transfers') continue
    const list = net.get(tx.category) ?? []
    list.push(tx.amount)
    net.set(tx.category, list)
  }
  const spentIn = (c: Category) => Math.max(0, -sumCents(net.get(c) ?? []))

  const budgeted: BudgetLine[] = budgets
    .filter((b) => BUDGET_CATEGORIES.includes(b.category))
    .map((b) => {
      const spent = spentIn(b.category)
      return { category: b.category, budget: b.amount, spent, remaining: b.amount - spent, percentUsed: (spent / b.amount) * 100, status: statusFor(spent, b.amount) }
    })
    .sort((a, b) => b.percentUsed! - a.percentUsed! || a.category.localeCompare(b.category))
  const has = new Set(budgeted.map((l) => l.category))
  const unbudgeted: BudgetLine[] = BUDGET_CATEGORIES.filter((c) => !has.has(c) && spentIn(c) > 0)
    .map((c) => ({ category: c, budget: null, spent: spentIn(c), remaining: null, percentUsed: null, status: null }))
    .sort((a, b) => b.spent - a.spent)

  const totalBudget = sumCents(budgeted.map((l) => l.budget!))
  const totalSpent = sumCents(budgeted.map((l) => l.spent))
  return {
    month,
    lines: [...budgeted, ...unbudgeted],
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
    unbudgetedSpent: sumCents(unbudgeted.map((l) => l.spent)),
    monthElapsed: isPartial ? (daysBetween(current.start, current.end) + 1) / daysInMonth(month) : 1,
    isPartial,
  }
}
