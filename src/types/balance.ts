import { addDays, daysInMonth, dateInMonth, toMonthKey, type ISODate, type MonthKey } from '../lib/dates'
import type { Cents } from '../lib/money'

/**
 * A balance YOU provided: what one bank account held at the START of `date`,
 * before that day's transactions.
 *
 * One idea covers both kinds of balance you can type:
 *   - an opening balance for a period starting Nov 22  -> the start of Nov 22
 *   - an actual closing balance for a period ending Dec 22 -> the start of Dec 23
 * So "October's closing" and "November's opening" are the same moment, and
 * can never disagree.
 *
 * These are NOT transactions and live in their own table, so they can never
 * be counted as income or spending.
 */
export interface BalancePoint {
  /** "accountId:YYYY-MM-DD" */
  id: string
  accountId: string
  date: ISODate
  amount: Cents
  updatedAt: string
}

export function balancePointId(accountId: string, date: ISODate): string {
  return `${accountId}:${date}`
}

/** The point holding a closing balance for the end of `date`. */
export function closingPointDate(date: ISODate): ISODate {
  return addDays(date, 1)
}

/**
 * The older (database v5–6, backup v2–3) format: an opening and an actual
 * closing per account per month. Only read when upgrading.
 */
export interface MonthlyBalance {
  id: string
  accountId: string
  month: MonthKey
  opening: Cents | null
  actualClosing: Cents | null
  updatedAt: string
}

/**
 * Converts the older monthly balances. An opening becomes the start of the 1st;
 * an actual closing becomes the start of the day after the date it was entered
 * for: the month's last day, or the last day with data if the month was
 * unfinished (`latestDate`), exactly as the app showed it. If a closing and the
 * next month's opening land on the same day, the opening you typed wins.
 */
export function pointsFromMonthlyBalances(balances: readonly MonthlyBalance[], latestDate: ISODate | null): BalancePoint[] {
  const points = new Map<string, BalancePoint>()
  const put = (accountId: string, date: ISODate, amount: Cents, updatedAt: string) =>
    points.set(balancePointId(accountId, date), { id: balancePointId(accountId, date), accountId, date, amount, updatedAt })
  for (const b of balances) {
    if (b.actualClosing === null) continue
    const through = latestDate && toMonthKey(latestDate) === b.month ? latestDate : dateInMonth(b.month, daysInMonth(b.month))
    put(b.accountId, closingPointDate(through), b.actualClosing, b.updatedAt)
  }
  for (const b of balances) if (b.opening !== null) put(b.accountId, dateInMonth(b.month, 1), b.opening, b.updatedAt)
  return [...points.values()]
}
