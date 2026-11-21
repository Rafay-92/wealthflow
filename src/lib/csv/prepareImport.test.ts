import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import { suggestMapping } from './detectColumns'
import { detectHeaderRow, parseCsvText } from './parseCsv'
import { isSelectedByDefault, prepareImport, toTransactions } from './prepareImport'

/** End-to-end: realistic file text all the way to transactions. */
describe('import pipeline', () => {
  const csv = [
    'Everyday Checking ****1234',
    'Export date,11/21/2026',
    '',
    'Date,Description,Amount,Balance',
    '11/01/2026,ACME CORP PAYROLL,"2,450.00","3,200.00"',
    '11/02/2026,STARBUCKS,-4.50,"3,195.50"',
    '11/02/2026,STARBUCKS,-4.50,"3,191.00"',
    '11/03/2026,WHOLE FOODS MARKET,-52.30,"3,138.70"',
    '11/31/2026,BROKEN DATE,-1.00,"3,137.70"',
  ].join('\n')

  it('parses, maps, flags duplicates and builds transactions', () => {
    const rows = parseCsvText(csv)
    const headerRow = detectHeaderRow(rows)
    expect(rows[headerRow]).toEqual(['Date', 'Description', 'Amount', 'Balance'])

    const mapping = suggestMapping(rows[headerRow]!, rows.slice(headerRow + 1))
    const existing = [tx({ accountId: 'chk', date: '2026-11-03', amount: -5230, description: 'WHOLE FOODS MARKET' })]
    const prepared = prepareImport(rows, headerRow, mapping, existing, 'chk')

    expect(prepared.rows.map((r) => [r.draft.description, r.status])).toEqual([
      ['ACME CORP PAYROLL', 'new'],
      ['STARBUCKS', 'new'],
      ['STARBUCKS', 'repeat'],
      ['WHOLE FOODS MARKET', 'duplicate'],
    ])
    // Line 9 of the file (counting the blank line 3): November has no 31st.
    expect(prepared.errors).toEqual([{ rowNumber: 9, message: '“11/31/2026” isn’t a valid date in the chosen format.' }])
    expect(prepared.closing).toEqual({ balance: 313870, asOf: '2026-11-03' })

    const kept = prepared.rows.filter((r) => isSelectedByDefault(r.status)).map((r) => r.draft)
    let n = 0
    const transactions = toTransactions(kept, 'chk', 'imp1', () => `id${++n}`)
    expect(transactions).toHaveLength(3)
    expect(transactions[0]).toEqual({
      id: 'id1',
      date: '2026-11-01',
      description: 'ACME CORP PAYROLL',
      amount: 245000,
      category: 'Income',
      accountId: 'chk',
      importId: 'imp1',
    })
    expect(transactions[1]!.category).toBe('Other')
  })
})
