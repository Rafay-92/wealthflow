import { describe, expect, it } from 'vitest'
import type { ColumnMapping, DraftTransaction } from '../../types/import'
import { closingBalance, normalizeRows } from './normalize'

const single: ColumnMapping = {
  dateColumn: 0,
  descriptionColumn: 1,
  amountMode: 'single',
  amountColumn: 2,
  debitColumn: null,
  creditColumn: null,
  balanceColumn: 3,
  dateFormat: 'MM/DD/YYYY',
  invertAmounts: false,
}

const split: ColumnMapping = {
  ...single,
  amountMode: 'split',
  amountColumn: null,
  debitColumn: 2,
  creditColumn: 3,
  balanceColumn: null,
}

describe('normalizeRows', () => {
  it('converts dates, cents and tidies descriptions', () => {
    const { drafts, errors } = normalizeRows([['11/03/2026', '  WHOLE   FOODS  ', '-$52.30', '1,000.00']], single, 2)
    expect(errors).toEqual([])
    expect(drafts).toEqual([
      { rowNumber: 2, date: '2026-11-03', description: 'WHOLE FOODS', amount: -5230, balance: 100000 },
    ])
  })

  it('reports bad rows with their file line number and keeps the good ones', () => {
    const { drafts, errors } = normalizeRows(
      [
        ['11/03/2026', 'OK', '-1.00', ''],
        ['13/45/2026', 'BAD DATE', '-1.00', ''],
        ['11/04/2026', '', '-1.00', ''],
        ['11/05/2026', 'BAD AMOUNT', 'twelve', ''],
        ['Total', '', '-3.00', ''],
      ],
      single,
      2,
    )
    expect(drafts).toHaveLength(1)
    expect(errors.map((e) => e.rowNumber)).toEqual([3, 4, 5, 6])
    expect(errors[0]!.message).toMatch(/13\/45\/2026/)
    expect(errors[1]!.message).toBe('Missing description.')
  })

  it('reads debit/credit columns, whatever sign the bank uses for debits', () => {
    const { drafts } = normalizeRows(
      [
        ['11/03/2026', 'COFFEE', '4.50', ''],
        ['11/04/2026', 'RENT', '-1650.00', ''],
        ['11/05/2026', 'PAYROLL', '', '2450.00'],
      ],
      split,
      2,
    )
    expect(drafts.map((d) => d.amount)).toEqual([-450, -165000, 245000])
  })

  it('rejects rows with both or neither debit and credit', () => {
    const { errors } = normalizeRows(
      [
        ['11/03/2026', 'BOTH', '4.50', '4.50'],
        ['11/04/2026', 'NEITHER', '', ''],
      ],
      split,
      2,
    )
    expect(errors.map((e) => e.message)).toEqual(['Row has both a money-out and a money-in amount.', 'Missing amount.'])
  })

  it('silently skips blank rows but keeps counting lines', () => {
    const { drafts, errors } = normalizeRows([['', '', '', ''], ['11/03/2026', 'OK', '-1.00', '']], single, 2)
    expect(errors).toEqual([])
    expect(drafts[0]!.rowNumber).toBe(3)
  })

  it('flips signs for exports that show purchases as positive', () => {
    const { drafts } = normalizeRows([['11/03/2026', 'COFFEE', '4.50', '']], { ...single, invertAmounts: true }, 2)
    expect(drafts[0]!.amount).toBe(-450)
  })
})

describe('closingBalance', () => {
  const d = (date: string, balance: number | null): DraftTransaction => ({
    rowNumber: 0,
    date,
    description: 'X',
    amount: -100,
    balance,
  })

  it('takes the last row of an oldest-first statement', () => {
    expect(closingBalance([d('2026-11-01', 500), d('2026-11-03', 400), d('2026-11-03', 300)])).toEqual({
      balance: 300,
      asOf: '2026-11-03',
    })
  })

  it('takes the first row of a newest-first statement', () => {
    expect(closingBalance([d('2026-11-03', 300), d('2026-11-03', 400), d('2026-11-01', 500)])).toEqual({
      balance: 300,
      asOf: '2026-11-03',
    })
  })

  it('returns null without a balance column', () => {
    expect(closingBalance([d('2026-11-01', null)])).toBeNull()
  })
})
