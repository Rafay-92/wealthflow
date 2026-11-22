import type { DraftTransaction } from '../../types/import'
import { addDays, type ISODate } from '../dates'
import type { Cents } from '../money'

/**
 * A balance your bank reported in a statement's running-balance column:
 * what the account held at the START of `date`.
 *
 * Running balances are checkpoints, never transactions: they're stored in
 * their own table and are never added to income, spending or each other.
 * They're used to work out opening balances and to check that the imported
 * transactions really add up to what the bank says.
 */
export interface StatementBalance {
  /** "accountId:date:importId" */
  id: string
  accountId: string
  importId: string
  date: ISODate
  amount: Cents
}

/**
 * Reads checkpoints from a statement's rows (all of them, including rows that
 * were skipped as duplicates: the bank's balance includes them).
 *
 *   - the end of each day = the running balance after that day's LAST row,
 *     stored as the start of the next day;
 *   - the start of the first day = the first row's balance minus its amount
 *     (the bank states both, so the balance before it follows exactly).
 *
 * Banks list rows oldest-first or newest-first; the direction is worked out
 * from the dates. A day where the last row has no balance gets no checkpoint
 * rather than a guess.
 */
export function statementCheckpoints(drafts: readonly DraftTransaction[], accountId: string, importId: string): StatementBalance[] {
  if (drafts.length === 0) return []
  const newestFirst = drafts[0]!.date > drafts.at(-1)!.date
  const chronological = newestFirst ? [...drafts].reverse() : [...drafts]
  const make = (date: ISODate, amount: Cents): StatementBalance => ({ id: `${accountId}:${date}:${importId}`, accountId, importId, date, amount })

  const out: StatementBalance[] = []
  const first = chronological[0]!
  let previousEnd: Cents | null = first.balance !== null ? first.balance - first.amount : null
  if (previousEnd !== null) out.push(make(first.date, previousEnd))

  // Group by day, in date order.
  const days: DraftTransaction[][] = []
  for (const row of chronological) {
    const last = days.at(-1)
    if (last && last[0]!.date === row.date) last.push(row)
    else days.push([row])
  }
  for (const rows of days) {
    const dayTotal = rows.reduce((sum, r) => sum + r.amount, 0)
    // Same-day rows aren't always listed in the order they happened. The day's
    // closing balance is the row whose balance equals yesterday's + today's
    // total; if none does, the last row's balance is used and any mismatch
    // shows up as a reconciliation difference, never hidden.
    const consistent = previousEnd === null ? undefined : rows.find((r) => r.balance === previousEnd! + dayTotal)
    const end = consistent?.balance ?? rows.at(-1)!.balance
    if (end !== null) out.push(make(addDays(rows[0]!.date, 1), end))
    previousEnd = end
  }
  return out
}

/** Whether a file has a usable running-balance column. */
export function hasRunningBalance(drafts: readonly DraftTransaction[]): boolean {
  return drafts.some((d) => d.balance !== null)
}
