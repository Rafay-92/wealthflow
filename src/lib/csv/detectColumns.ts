import { DATE_FORMATS, type ColumnMapping } from '../../types/import'
import { parseAmountToCents } from '../money'
import { detectDateFormat, parseDate } from './dateFormats'

/** Lower-case with accents removed: "Dépôt" -> "depot", so French headers match simple patterns. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** Finds the first header matching any pattern, trying patterns in priority order. */
function findColumn(headers: readonly string[], patterns: readonly RegExp[], exclude: ReadonlySet<number>): number | null {
  for (const pattern of patterns) {
    const index = headers.findIndex((h, i) => !exclude.has(i) && pattern.test(plain(h)))
    if (index !== -1) return index
  }
  return null
}

/** Words banks use in a "type" column. Compared without accents or case. */
const MONEY_OUT_WORDS = new Set(['debit', 'dr', 'd', 'db', 'withdrawal', 'withdraw', 'purchase', 'retrait', 'debit card', 'out'])
const MONEY_IN_WORDS = new Set(['credit', 'cr', 'c', 'deposit', 'depot', 'refund', 'in'])

/**
 * Reads a "type" cell: 'out' for Debit/DR/Withdrawal…, 'in' for Credit/CR/Deposit…,
 * null if it's neither (so the row is reported instead of guessed).
 */
export function readTransactionType(value: string): 'in' | 'out' | null {
  const word = plain(value).replace(/\.$/, '')
  if (MONEY_OUT_WORDS.has(word)) return 'out'
  if (MONEY_IN_WORDS.has(word)) return 'in'
  return null
}

const isAmount = (v: string) => parseAmountToCents(v) !== null || parseAmountToCents(v, { decimalComma: true }) !== null
const isDate = (v: string) => DATE_FORMATS.some((f) => parseDate(v, f) !== null)

/** Share (0–1) of a column's non-empty cells passing a test, and how full the column is. */
function profile(dataRows: readonly string[][], column: number, test: (v: string) => boolean) {
  const values = dataRows.map((row) => (row[column] ?? '').trim())
  const filled = values.filter((v) => v !== '')
  return { filled: filled.length / Math.max(1, values.length), passing: filled.length ? filled.filter(test).length / filled.length : 0, values }
}

/**
 * Suggests a column mapping from header names AND the data underneath.
 *
 * Header names are tried first (English and French). Anything still unknown
 * is worked out from the contents, which is what makes header-less files
 * (TD, CIBC) and unusual header names work. This is only a starting point:
 * the user always sees a live preview and confirms it.
 */
export function suggestMapping(headers: readonly string[], dataRows: readonly string[][]): ColumnMapping {
  const used = new Set<number>()
  const take = (index: number | null) => {
    if (index !== null) used.add(index)
    return index
  }
  const width = Math.max(headers.length, ...dataRows.slice(0, 50).map((r) => r.length))
  const unused = () => Array.from({ length: width }, (_, i) => i).filter((i) => !used.has(i))

  // 1. By header name (English and French; compared without accents).
  let dateColumn = take(
    findColumn(headers, [/^(transaction|trans\.?|txn)\s*date$/i, /^date( de (la )?transaction)?$/i, /^(posted|posting|post)\s*date$/i, /date/i], used),
  )
  // A "type" column must also CONTAIN debit/credit words, or "Type" could mean anything.
  let typeColumn = take(
    findColumn(headers, [/type of transaction|transaction type|^type$|dr\s*\/\s*cr|cr\s*\/\s*dr|debit\s*\/\s*credit|credit\s*\/\s*debit/i], used),
  )
  if (typeColumn !== null && profile(dataRows, typeColumn, (v) => readTransactionType(v) !== null).passing < 0.9) {
    used.delete(typeColumn)
    typeColumn = null
  }
  let balanceColumn = take(findColumn(headers, [/balance|solde/i], used))
  let debitColumn = take(findColumn(headers, [/debit|withdrawal|retrait|money\s*out|paid\s*out|outflow/i], used))
  let creditColumn = take(findColumn(headers, [/credit|deposit|depot|money\s*in|paid\s*in|inflow/i], used))
  let amountColumn = take(findColumn(headers, [/^(amount|montant)$/i, /amount|montant|cad\$|^\$$/i, /^value$/i], used))
  let descriptionColumn = take(
    findColumn(
      headers,
      [/^description$/i, /description|details|memo|narrative|payee|merchant|libelle|commercant|beneficiaire/i, /name|reference|transaction/i],
      used,
    ),
  )

  // 2. From the contents, for anything still unknown.
  if (dateColumn === null) {
    dateColumn = take(unused().find((i) => profile(dataRows, i, isDate).passing >= 0.8) ?? null)
  }
  if (typeColumn === null) {
    const found = unused().find((i) => {
      const p = profile(dataRows, i, (v) => readTransactionType(v) !== null)
      return p.filled >= 0.9 && p.passing >= 0.95
    })
    typeColumn = take(found ?? null)
  }

  const haveAmounts = amountColumn !== null || (debitColumn !== null && creditColumn !== null)
  if (!haveAmounts) {
    const numeric = unused().filter((i) => profile(dataRows, i, isAmount).passing >= 0.9 && profile(dataRows, i, isAmount).filled > 0)
    // A debit/credit pair: on every row exactly one of the two is filled in.
    const pair = numeric.flatMap((a) => numeric.filter((b) => b > a).map((b) => [a, b] as const)).find(([a, b]) => {
      const rows = dataRows.filter((r) => (r[a] ?? '').trim() !== '' || (r[b] ?? '').trim() !== '')
      return rows.length > 0 && rows.every((r) => ((r[a] ?? '').trim() === '') !== ((r[b] ?? '').trim() === ''))
    })
    if (pair) {
      debitColumn = take(pair[0])
      creditColumn = take(pair[1])
    } else {
      amountColumn = take(numeric[0] ?? null)
    }
    // A remaining always-filled numeric column is most likely the running balance.
    if (balanceColumn === null) {
      balanceColumn = take(unused().find((i) => numeric.includes(i) && profile(dataRows, i, isAmount).filled >= 0.95) ?? null)
    }
  }

  if (descriptionColumn === null) {
    // The column with the most (and longest) text that isn't a date or a number.
    const scored = unused()
      .map((i) => {
        const p = profile(dataRows, i, (v) => !isDate(v) && !isAmount(v))
        const avgLength = p.values.reduce((s, v) => s + v.length, 0) / Math.max(1, p.values.length)
        return { i, score: p.passing * p.filled * avgLength }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
    descriptionColumn = take(scored[0]?.i ?? null)
  }

  const split = amountColumn === null && debitColumn !== null && creditColumn !== null
  const dateValues = dateColumn === null ? [] : dataRows.map((row) => row[dateColumn!] ?? '')
  const moneyColumns = [...(split ? [debitColumn, creditColumn] : [amountColumn]), balanceColumn].filter((c): c is number => c !== null)
  const decimalComma = detectDecimalComma(moneyColumns.flatMap((c) => dataRows.map((row) => row[c] ?? '')))

  const mapping: ColumnMapping = {
    dateColumn,
    descriptionColumn,
    amountMode: split ? 'split' : 'single',
    amountColumn: split ? null : amountColumn,
    debitColumn: split ? debitColumn : null,
    creditColumn: split ? creditColumn : null,
    balanceColumn,
    typeColumn: split ? null : typeColumn,
    dateFormat: detectDateFormat(dateValues).format,
    invertAmounts: false,
    decimalComma,
  }
  mapping.invertAmounts = looksLikePurchasesArePositive(mapping, dataRows)
  return mapping
}

/**
 * Some exports (mostly credit cards) list purchases as POSITIVE numbers and
 * payments as negative. If almost every amount is positive and there's no
 * type column to say otherwise, that's what's happening, so flip the signs.
 * The preview shows the result, and the user can untick "Flip signs".
 */
export function looksLikePurchasesArePositive(mapping: ColumnMapping, dataRows: readonly string[][]): boolean {
  if (mapping.amountMode !== 'single' || mapping.amountColumn === null || mapping.typeColumn != null) return false
  const amounts = dataRows
    .map((row) => parseAmountToCents(row[mapping.amountColumn!] ?? '', { decimalComma: mapping.decimalComma ?? false }))
    .filter((a): a is number => a !== null && a !== 0)
  if (amounts.length < 5) return false
  return amounts.filter((a) => a > 0).length / amounts.length >= 0.8
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
    ...(mapping.amountMode === 'single' ? [mapping.amountColumn, mapping.typeColumn ?? null] : [mapping.debitColumn, mapping.creditColumn]),
    mapping.balanceColumn,
  ].filter((c): c is number => c !== null)
  if (new Set(chosen).size !== chosen.length) problems.push('Each column can only be used for one field.')

  return problems
}
