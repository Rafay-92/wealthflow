import { describe, expect, it } from 'vitest'
import type { ColumnMapping } from '../../types/import'
import { mappingProblems, readTransactionType, suggestMapping } from './detectColumns'

describe('suggestMapping', () => {
  it('maps a single-amount layout', () => {
    const mapping = suggestMapping(
      ['Date', 'Description', 'Amount', 'Running Balance'],
      [['11/03/2026', 'COFFEE', '-4.50', '100.00']],
    )
    expect(mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountMode: 'single',
      amountColumn: 2,
      balanceColumn: 3,
      dateFormat: 'MM/DD/YYYY',
    })
  })

  it('maps a debit/credit layout and prefers transaction date over posted date', () => {
    const mapping = suggestMapping(
      ['Posted Date', 'Transaction Date', 'Details', 'Debit', 'Credit'],
      [['2026-11-04', '2026-11-03', 'COFFEE', '4.50', '']],
    )
    expect(mapping).toMatchObject({
      dateColumn: 1,
      descriptionColumn: 2,
      amountMode: 'split',
      amountColumn: null,
      debitColumn: 3,
      creditColumn: 4,
      dateFormat: 'YYYY-MM-DD',
    })
  })

  it('maps a French-Canadian export and detects the decimal comma', () => {
    const mapping = suggestMapping(
      ['Date', 'Libellé', 'Retrait', 'Dépôt', 'Solde'],
      [
        ['2026-11-03', 'LOBLAWS', '52,30', '', '1 234,56'],
        ['2026-11-04', 'PAIE', '', '2 450,00', '3 684,56'],
      ],
    )
    expect(mapping).toMatchObject({
      dateColumn: 0,
      descriptionColumn: 1,
      amountMode: 'split',
      debitColumn: 2,
      creditColumn: 3,
      balanceColumn: 4,
      decimalComma: true,
    })
  })

  it('keeps the English number format for English exports', () => {
    expect(suggestMapping(['Date', 'Description', 'Amount'], [['2026-11-03', 'X', '-1,234.56']]).decimalComma).toBe(false)
  })

  it('finds an unlabelled amount column from its numbers', () => {
    const mapping = suggestMapping(
      ['Date', 'Payee', 'Value (CAD)'],
      [['2026-11-03', 'COFFEE', '-4.50'], ['2026-11-04', 'PAY', '100']],
    )
    expect(mapping.amountColumn).toBe(2)
  })
})

describe('readTransactionType', () => {
  it.each([
    ['Debit', 'out'],
    ['DR', 'out'],
    ['withdrawal', 'out'],
    ['Retrait', 'out'],
    ['Credit', 'in'],
    ['cr.', 'in'],
    ['Deposit', 'in'],
    ['Dépôt', 'in'],
    ['Pending', null],
    ['', null],
  ] as const)('%j -> %s', (value, expected) => {
    expect(readTransactionType(value)).toBe(expected)
  })
})

describe('sign detection', () => {
  const rows = (amounts: string[]) => amounts.map((a, i) => [`2026-11-0${i + 1}`, `SHOP ${i}`, a])

  it('flips signs when nearly every amount is positive (card exports list purchases as positive)', () => {
    const mapping = suggestMapping(['Date', 'Description', 'Amount'], rows(['12.00', '45.10', '8.99', '120.00', '15.00', '-300.00']))
    expect(mapping.invertAmounts).toBe(true)
  })

  it('leaves normal bank exports alone', () => {
    const mapping = suggestMapping(['Date', 'Description', 'Amount'], rows(['-12.00', '-45.10', '2450.00', '-8.99', '-120.00', '-15.00']))
    expect(mapping.invertAmounts).toBe(false)
  })

  it('does not guess from too few rows', () => {
    expect(suggestMapping(['Date', 'Description', 'Amount'], rows(['12.00', '45.10'])).invertAmounts).toBe(false)
  })

  it('ignores a "Type" column that does not contain debit/credit words', () => {
    const mapping = suggestMapping(['Date', 'Description', 'Type', 'Amount'], [['2026-11-01', 'X', 'Online', '-5.00']])
    expect(mapping.typeColumn).toBeNull()
  })
})

describe('mappingProblems', () => {
  const ok: ColumnMapping = {
    dateColumn: 0,
    descriptionColumn: 1,
    amountMode: 'single',
    amountColumn: 2,
    debitColumn: null,
    creditColumn: null,
    balanceColumn: null,
    dateFormat: 'YYYY-MM-DD',
    invertAmounts: false,
  }

  it('accepts a complete mapping', () => {
    expect(mappingProblems(ok)).toEqual([])
  })

  it('reports missing fields', () => {
    expect(mappingProblems({ ...ok, dateColumn: null, amountColumn: null })).toHaveLength(2)
  })

  it('needs both debit and credit in split mode', () => {
    expect(mappingProblems({ ...ok, amountMode: 'split', debitColumn: 2 })).toEqual([
      'Choose both the money-out and money-in columns.',
    ])
  })

  it('rejects one column used twice', () => {
    expect(mappingProblems({ ...ok, descriptionColumn: 0 })).toContain('Each column can only be used for one field.')
  })
})
