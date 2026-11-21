// `?raw` makes Vite load the file's text as a string, so these tests use the
// exact sample files offered on the Import page.
import cardCsv from '../../../public/sample-data/rewards-card-nov.csv?raw'
import messyCsv from '../../../public/sample-data/messy-export.csv?raw'
import overlapCsv from '../../../public/sample-data/everyday-checking-oct15-nov20.csv?raw'
import octCsv from '../../../public/sample-data/everyday-checking-oct.csv?raw'
import { describe, expect, it } from 'vitest'
import { suggestMapping } from './detectColumns'
import { detectHeaderRow, parseCsvText } from './parseCsv'
import { isSelectedByDefault, prepareImport, toTransactions } from './prepareImport'
import type { Transaction } from '../../types/transaction'

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
    const imported = toTransactions(kept, 'chk', 'imp1')

    const second = run(overlapCsv, imported)
    expect(second.rows.filter((r) => r.status === 'duplicate')).toHaveLength(13) // Oct 15–30
    expect(second.rows.filter((r) => r.status === 'new')).toHaveLength(18) // Nov 1–20
    expect(second.closing).toEqual({ balance: 814370, asOf: '2026-11-20' })
  })

  it('credit card: skips the info lines and reads debit/credit columns', () => {
    const result = run(cardCsv, [], 'card')
    expect(result.headerRow).toBe(3) // 4th line, after two info lines and a blank one
    expect(result.mapping).toMatchObject({ amountMode: 'split', dateColumn: 0, descriptionColumn: 2 })
    expect(result.errors).toEqual([])
    const refund = result.rows.find((r) => r.draft.description === 'AMAZON.COM REFUND')!
    expect(refund.draft.amount).toBe(1999)
    expect(result.rows[0]!.draft.amount).toBe(-3412)
  })

  it('messy export: keeps good rows and explains each bad one', () => {
    const result = run(messyCsv)
    expect(result.rows.map((r) => r.draft.description)).toEqual(['COFFEE BEAN', 'CVS PHARMACY', 'FARMERS MARKET, DOWNTOWN'])
    expect(result.errors.map((e) => e.rowNumber)).toEqual([3, 4, 5, 8])
  })
})
