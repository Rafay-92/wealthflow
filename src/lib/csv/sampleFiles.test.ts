// `?raw` makes Vite load the file's text as a string, so these tests use the
// exact sample files offered on the Import page.
import cardCsv from '../../../public/sample-data/rewards-card-nov.csv?raw'
import messyCsv from '../../../public/sample-data/messy-export.csv?raw'
import overlapCsv from '../../../public/sample-data/everyday-chequing-oct15-nov20.csv?raw'
import octCsv from '../../../public/sample-data/everyday-chequing-oct.csv?raw'
import frenchCsv from '../../../public/sample-data/compte-cheques-nov.csv?raw'
import { describe, expect, it } from 'vitest'
import { suggestMapping } from './detectColumns'
import { detectHeaderRow, parseCsvText } from './parseCsv'
import { isSelectedByDefault, prepareImport, toTransactions } from './prepareImport'
import type { Transaction } from '../../types/transaction'
import { categorizeAll } from '../categorize/categorize'
import { summarize } from '../analytics/summary'
import { monthPeriod } from '../analytics/periods'

describe('French-Canadian sample export', () => {
  it('detects semicolons, French headers and decimal commas, and reads every row', () => {
    const rows = parseCsvText(frenchCsv)
    const headerRow = detectHeaderRow(rows)
    const mapping = suggestMapping(rows[headerRow]!, rows.slice(headerRow + 1))
    expect(mapping).toMatchObject({ amountMode: 'split', descriptionColumn: 1, debitColumn: 2, creditColumn: 3, balanceColumn: 4, decimalComma: true })

    const prepared = prepareImport(rows, headerRow, mapping, [], 'qc')
    expect(prepared.errors).toEqual([])
    expect(prepared.rows).toHaveLength(10)
    expect(prepared.rows[0]!.draft.amount).toBe(238000) // "2 380,00" deposit
    expect(prepared.rows[1]!.draft.amount).toBe(-142500) // "1 425,00" withdrawal
    expect(prepared.closing).toEqual({ balance: 566725, asOf: '2026-11-18' }) // "5 667,25"

    const categorized = categorizeAll(toTransactions(prepared.rows.map((r) => r.draft), [], 'qc', 'imp'), [])
    const byName = (d: string) => categorized.find((t) => t.description === d)!.category
    expect(byName('HYDRO-QUÉBEC')).toBe('Utilities')
    expect(byName('DEPOT DIRECT PAIE')).toBe('Income')
    expect(byName('LOYER NOVEMBRE')).toBe('Housing')
    expect(byName('VIREMENT INTERAC A MARIE')).not.toBe('Transfers') // paying a person is spending
  })
})

/** Imports a file the way the app does, keeping only the default selection. */
function importFile(text: string, existing: Transaction[], accountId: string, importId: string) {
  const kept = run(text, existing, accountId).rows.filter((r) => isSelectedByDefault(r.status)).map((r) => r.draft)
  let n = 0
  return toTransactions(kept, [], accountId, importId, () => `${importId}-${++n}`)
}

describe('sample files, categorised together', () => {
  const october = importFile(octCsv, [], 'chk', 'a')
  const overlap = importFile(overlapCsv, october, 'chk', 'b')
  const card = importFile(cardCsv, [...october, ...overlap], 'card', 'c')
  const all = categorizeAll([...october, ...overlap, ...card], [], [
    { id: 'chk', name: 'Everyday Chequing', type: 'checking' },
    { id: 'card', name: 'Rewards Card', type: 'credit' },
  ])
  const find = (description: string) => all.find((t) => t.description === description)!

  it('pairs the card payment across the two accounts', () => {
    expect(find('ONLINE PMT REWARDS CARD')).toMatchObject({
      category: 'Transfers',
      categoryNote: 'Matches +$425.00 in Rewards Card on Nov 14',
    })
    expect(find('PAYMENT THANK YOU').category).toBe('Transfers')
  })

  it('categorises every sample transaction without needing review', () => {
    expect(all.filter((t) => t.categorySource === 'default').map((t) => t.description)).toEqual([])
  })

  it('fixes the Stage 3 totals: refunds and card payments are not income', () => {
    // November income is two paychecks plus one invoice, nothing else.
    expect(summarize(all, monthPeriod('2026-11')).income).toBe(2 * 245000 + 60000)
  })
})

function run(text: string, existing: Transaction[] = [], accountId = 'chk') {
  const rows = parseCsvText(text)
  const headerRow = detectHeaderRow(rows)
  const mapping = suggestMapping(rows[headerRow]!, rows.slice(headerRow + 1))
  return { headerRow, mapping, ...prepareImport(rows, headerRow, mapping, existing, accountId) }
}

describe('sample files', () => {
  it('checking (October): reads every row and the closing balance', () => {
    const result = run(octCsv)
    expect(result.errors).toEqual([])
    expect(result.rows).toHaveLength(25)
    expect(result.mapping.dateFormat).toBe('MM/DD/YYYY')
    expect(result.rows.filter((r) => r.status === 'repeat')).toHaveLength(1) // the two Oct 19 coffees
    expect(result.closing).toEqual({ balance: 538183, asOf: '2026-10-30' }) // last row: "5,381.83"
  })

  it('overlapping checking file: the shared rows are recognised as duplicates', () => {
    const first = run(octCsv)
    const kept = first.rows.filter((r) => isSelectedByDefault(r.status)).map((r) => r.draft)
    const imported = toTransactions(kept, [], 'chk', 'imp1')

    const second = run(overlapCsv, imported)
    expect(second.rows.filter((r) => r.status === 'duplicate')).toHaveLength(13) // Oct 15–30
    expect(second.rows.filter((r) => r.status === 'new')).toHaveLength(19) // Nov 1–20
    expect(second.closing).toEqual({ balance: 771870, asOf: '2026-11-20' })
  })

  it('credit card: skips the info lines and reads debit/credit columns', () => {
    const result = run(cardCsv, [], 'card')
    expect(result.headerRow).toBe(3) // 4th line, after two info lines and a blank one
    expect(result.mapping).toMatchObject({ amountMode: 'split', dateColumn: 0, descriptionColumn: 2 })
    expect(result.errors).toEqual([])
    const refund = result.rows.find((r) => r.draft.description === 'AMAZON.CA REFUND')!
    expect(refund.draft.amount).toBe(1999)
    expect(result.rows[0]!.draft.amount).toBe(-3412)
  })

  it('messy export: keeps good rows and explains each bad one', () => {
    const result = run(messyCsv)
    expect(result.rows.map((r) => r.draft.description)).toEqual(['COFFEE BEAN', 'SHOPPERS DRUG MART', 'FARMERS MARKET, DOWNTOWN'])
    expect(result.errors.map((e) => e.rowNumber)).toEqual([3, 4, 5, 8])
  })
})
