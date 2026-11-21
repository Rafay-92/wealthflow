import type { ColumnMapping } from '../../types/import'
import { parseAmountToCents } from '../money'
import { detectDateFormat } from './dateFormats'

/** Lower-case with accents removed: "Dépôt" -> "depot", so French headers match simple patterns. */
function plain(header: string): string {
  return header.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** Finds the first header matching any pattern, trying patterns in priority order. */
function findColumn(headers: readonly string[], patterns: readonly RegExp[], exclude: ReadonlySet<number>): number | null {
  for (const pattern of patterns) {
    const index = headers.findIndex((h, i) => !exclude.has(i) && pattern.test(plain(h)))
    if (index !== -1) return index
  }
  return null
}

/**
 * Suggests a column mapping from header names and the data underneath.
 * This is only a starting point: the user always sees and confirms it.
 */
export function suggestMapping(headers: readonly string[], dataRows: readonly string[][]): ColumnMapping {
  const used = new Set<number>()
  const take = (index: number | null) => {
    if (index !== null) used.add(index)
    return index
  }

  const dateColumn = take(
    findColumn(
      headers,
      [/^(transaction|trans\.?|txn)\s*date$/i, /^date( de (la )?transaction)?$/i, /^(posted|posting|post)\s*date$/i, /date/i],
      used,
    ),
  )
  // English and French (Quebec) header names. Headers are compared without accents.
  const balanceColumn = take(findColumn(headers, [/balance|solde/i], used))
  const debitColumn = take(findColumn(headers, [/debit|withdrawal|retrait|money\s*out|paid\s*out|outflow/i], used))
  const creditColumn = take(findColumn(headers, [/credit|deposit|depot|money\s*in|paid\s*in|inflow/i], used))
  let amountColumn = take(findColumn(headers, [/^(amount|montant)$/i, /amount|montant/i, /^value$/i], used))
  const descriptionColumn = take(
    findColumn(
      headers,
      [
        /^description$/i,
        /description|details|memo|narrative|payee|merchant|libelle|commercant|beneficiaire/i,
        /name|reference|transaction/i,
      ],
      used,
    ),
  )

  const split = amountColumn === null && debitColumn !== null && creditColumn !== null

  // No "Amount" header? Fall back to the first unused column that's mostly numbers.
  if (amountColumn === null && !split) {
    const width = headers.length
    for (let i = 0; i < width; i++) {
      if (used.has(i)) continue
      const values = dataRows.map((row) => row[i] ?? '').filter((v) => v !== '')
      const numeric = values.filter((v) => parseAmountToCents(v) !== null || parseAmountToCents(v, { decimalComma: true }) !== null).length
      if (values.length > 0 && numeric / values.length >= 0.9) {
        amountColumn = take(i)
        break
      }
    }
  }

  const dateValues = dateColumn === null ? [] : dataRows.map((row) => row[dateColumn] ?? '')
  const moneyColumns = [...(split ? [debitColumn, creditColumn] : [amountColumn]), balanceColumn].filter((c): c is number => c !== null)

  return {
    dateColumn,
    descriptionColumn,
    amountMode: split ? 'split' : 'single',
    amountColumn: split ? null : amountColumn,
    debitColumn: split ? debitColumn : null,
    creditColumn: split ? creditColumn : null,
    balanceColumn,
    dateFormat: detectDateFormat(dateValues).format,
    invertAmounts: false,
    decimalComma: detectDecimalComma(moneyColumns.flatMap((c) => dataRows.map((row) => row[c] ?? ''))),
  }
}

/**
 * True when the amounts only make sense in French-Canadian format ("1 234,56"):
 * more values parse with a decimal comma than without one. Ties keep the
 * English default.
 */
export function detectDecimalComma(values: readonly string[]): boolean {
  const sample = values.filter((v) => v.trim() !== '').slice(0, 200)
  const english = sample.filter((v) => parseAmountToCents(v) !== null).length
  const french = sample.filter((v) => parseAmountToCents(v, { decimalComma: true }) !== null).length
  return french > english
}

/** Problems that stop the mapping from being usable. Empty array = ready. */
export function mappingProblems(mapping: ColumnMapping): string[] {
  const problems: string[] = []
  if (mapping.dateColumn === null) problems.push('Choose the date column.')
  if (mapping.descriptionColumn === null) problems.push('Choose the description column.')
  if (mapping.amountMode === 'single' && mapping.amountColumn === null) problems.push('Choose the amount column.')
  if (mapping.amountMode === 'split' && (mapping.debitColumn === null || mapping.creditColumn === null)) {
    problems.push('Choose both the money-out and money-in columns.')
  }

  const chosen = [
    mapping.dateColumn,
    mapping.descriptionColumn,
    ...(mapping.amountMode === 'single' ? [mapping.amountColumn] : [mapping.debitColumn, mapping.creditColumn]),
    mapping.balanceColumn,
  ].filter((c): c is number => c !== null)
  if (new Set(chosen).size !== chosen.length) problems.push('Each column can only be used for one field.')

  return problems
}
