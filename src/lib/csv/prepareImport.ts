import type { ColumnMapping, DraftStatus, DraftTransaction, RowError } from '../../types/import'
import type { Category, Transaction } from '../../types/transaction'
import type { ISODate } from '../dates'
import type { Cents } from '../money'
import { classifyDrafts } from './duplicates'
import { closingBalance, normalizeRows } from './normalize'

export interface ReviewRow {
  draft: DraftTransaction
  status: DraftStatus
}

export interface PreparedImport {
  rows: ReviewRow[]
  errors: RowError[]
  closing: { balance: Cents; asOf: ISODate } | null
}

/**
 * The whole "rows -> reviewable transactions" pipeline:
 * normalise the data rows under the header, then label duplicates.
 */
export function prepareImport(
  allRows: readonly string[][],
  headerRow: number,
  mapping: ColumnMapping,
  existing: readonly Transaction[],
  accountId: string,
): PreparedImport {
  const dataRows = allRows.slice(headerRow + 1)
  // +2: one because file lines are 1-based, one to skip the header itself.
  const { drafts, errors } = normalizeRows(dataRows, mapping, headerRow + 2)
  const statuses = classifyDrafts(drafts, existing, accountId)
  return {
    rows: drafts.map((draft, i) => ({ draft, status: statuses[i]! })),
    errors,
    closing: closingBalance(drafts),
  }
}

/** Default selection: import everything except rows already imported before. */
export function isSelectedByDefault(status: DraftStatus): boolean {
  return status !== 'duplicate'
}

/**
 * A placeholder category until Stage 4's categorisation engine exists:
 * money in -> Income, money out -> Other.
 */
export function provisionalCategory(amount: Cents): Category {
  return amount > 0 ? 'Income' : 'Other'
}

/** Turns the drafts the user kept into Transactions ready to save. */
export function toTransactions(
  drafts: readonly DraftTransaction[],
  accountId: string,
  importId: string,
  makeId: () => string = () => crypto.randomUUID(),
): Transaction[] {
  return drafts.map((d) => ({
    id: makeId(),
    date: d.date,
    description: d.description,
    amount: d.amount,
    category: provisionalCategory(d.amount),
    accountId,
    importId,
  }))
}
