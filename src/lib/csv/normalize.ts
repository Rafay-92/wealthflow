import type { ColumnMapping, DraftTransaction, RowError } from '../../types/import'
import type { ISODate } from '../dates'
import { parseAmountToCents, type Cents } from '../money'
import { parseDate } from './dateFormats'
import { isBlankRow } from './parseCsv'
import { readTransactionType } from './detectColumns'

export interface NormalizeResult {
  drafts: DraftTransaction[]
  errors: RowError[]
}

/**
 * Turns raw CSV rows into transaction drafts using the confirmed mapping.
 * Bad rows don't stop the import: each one becomes a RowError with a
 * plain-English reason, and the good rows carry on.
 *
 * @param firstRowNumber the 1-based file line of dataRows[0], for error messages.
 */
export function normalizeRows(
  dataRows: readonly string[][],
  mapping: ColumnMapping,
  firstRowNumber: number,
): NormalizeResult {
  const drafts: DraftTransaction[] = []
  const errors: RowError[] = []

  dataRows.forEach((row, i) => {
    if (isBlankRow(row)) return // blank lines are kept only to preserve line numbers
    const rowNumber = firstRowNumber + i
    const cell = (column: number | null) => (column === null ? '' : (row[column] ?? '').trim())
    const fail = (message: string) => errors.push({ rowNumber, message })

    const rawDate = cell(mapping.dateColumn)
    const date = parseDate(rawDate, mapping.dateFormat)
    if (!date) return fail(rawDate ? `“${rawDate}” isn’t a valid date in the chosen format.` : 'Missing date.')

    const description = cell(mapping.descriptionColumn).replace(/\s+/g, ' ')
    if (!description) return fail('Missing description.')

    const amount = readAmount(cell, mapping)
    if (typeof amount === 'string') return fail(amount)

    let balance: Cents | null = null
    const rawBalance = cell(mapping.balanceColumn)
    if (rawBalance) {
      balance = parseAmountToCents(rawBalance, { decimalComma: mapping.decimalComma ?? false })
      if (balance === null) return fail(`Balance “${rawBalance}” isn’t a valid amount.`)
    }

    drafts.push({ rowNumber, date, description, amount, balance })
  })

  return { drafts, errors }
}

/** Returns the signed amount in cents, or an error message. */
function readAmount(cell: (column: number | null) => string, mapping: ColumnMapping): Cents | string {
  const format = { decimalComma: mapping.decimalComma ?? false }
  let amount: Cents

  if (mapping.amountMode === 'single') {
    const raw = cell(mapping.amountColumn)
    if (!raw) return 'Missing amount.'
    const parsed = parseAmountToCents(raw, format)
    if (parsed === null) return `“${raw}” isn’t a valid amount.`
    amount = parsed

    // A type column ("Debit"/"Credit") decides the sign; the amount is just the size.
    if (mapping.typeColumn != null) {
      const rawType = cell(mapping.typeColumn)
      const direction = readTransactionType(rawType)
      if (!direction) return rawType ? `Unknown transaction type “${rawType}” (expected Debit or Credit).` : 'Missing transaction type.'
      amount = direction === 'out' ? -Math.abs(amount) : Math.abs(amount)
    }
  } else {
    const rawOut = cell(mapping.debitColumn)
    const rawIn = cell(mapping.creditColumn)
    const out = rawOut ? parseAmountToCents(rawOut, format) : 0
    const into = rawIn ? parseAmountToCents(rawIn, format) : 0
    if (out === null) return `Money-out value “${rawOut}” isn’t a valid amount.`
    if (into === null) return `Money-in value “${rawIn}” isn’t a valid amount.`
    if (out !== 0 && into !== 0) return 'Row has both a money-out and a money-in amount.'
    if (out === 0 && into === 0) return 'Missing amount.'
    // Banks write debits as either "12.00" or "-12.00"; both mean money out.
    amount = into !== 0 ? Math.abs(into) : -Math.abs(out)
  }

  if (mapping.invertAmounts) amount = -amount
  return amount === 0 ? 0 : amount // avoid -0
}

/**
 * The account balance at the end of the statement, if the file has a balance column.
 * Statements are sorted either oldest-first or newest-first, so for the latest
 * date we take the row that comes last in time order.
 */
export function closingBalance(drafts: readonly DraftTransaction[]): { balance: Cents; asOf: ISODate } | null {
  const withBalance = drafts.filter((d) => d.balance !== null)
  if (withBalance.length === 0) return null

  const first = withBalance[0]!
  const last = withBalance.at(-1)!
  const newestFirst = first.date > last.date
  const latestDate = withBalance.reduce((max, d) => (d.date > max ? d.date : max), first.date)
  const onLatest = withBalance.filter((d) => d.date === latestDate)
  const closing = newestFirst ? onLatest[0]! : onLatest.at(-1)!
  return { balance: closing.balance!, asOf: latestDate }
}
