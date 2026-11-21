import type { Transaction } from '../../types/transaction'
import type { MonthKey } from '../dates'
import type { Cents } from '../money'
import { monthPeriod } from './periods'
import { summarize } from './summary'

export interface MonthlyTotals {
  month: MonthKey
  income: Cents
  expenses: Cents
  net: Cents
}

/** Income, spending and net for each month in `months` (keeps the given order). */
export function monthlyTotals(
  transactions: readonly Transaction[],
  months: readonly MonthKey[],
): MonthlyTotals[] {
  return months.map((month) => {
    const { income, expenses, net } = summarize(transactions, monthPeriod(month))
    return { month, income, expenses, net }
  })
}
