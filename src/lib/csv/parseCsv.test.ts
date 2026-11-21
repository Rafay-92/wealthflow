import { describe, expect, it } from 'vitest'
import { checkFile, detectHeaderRow, headerSignature, ImportError, parseCsvText } from './parseCsv'

describe('checkFile', () => {
  it('accepts CSV files', () => {
    expect(checkFile({ name: 'October.CSV', size: 1200 })).toBeNull()
  })

  it.each([
    ['statement.pdf', /PDF/],
    ['export.xlsx', /Save as CSV/],
    ['photo.png', /\.png/],
  ])('rejects %s with a helpful message', (name, message) => {
    expect(checkFile({ name, size: 100 })).toMatch(message)
  })

  it('rejects empty and oversized files', () => {
    expect(checkFile({ name: 'a.csv', size: 0 })).toMatch(/empty/)
    expect(checkFile({ name: 'a.csv', size: 6 * 1024 * 1024 })).toMatch(/5 MB/)
  })
})

describe('parseCsvText', () => {
  it('handles quoted commas, escaped quotes and Windows line endings', () => {
    const rows = parseCsvText('Date,Description,Amount\r\n2026-11-03,"SMITH, J ""JJ"" PAYMENT",-12.50\r\n')
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['2026-11-03', 'SMITH, J "JJ" PAYMENT', '-12.50'],
    ])
  })

  it('strips the invisible byte-order mark Excel adds', () => {
    expect(parseCsvText('﻿Date,Amount\n2026-11-03,1')[0]![0]).toBe('Date')
  })

  it('auto-detects semicolon-separated files', () => {
    expect(parseCsvText('Date;Amount\n2026-11-03;12.00')[1]).toEqual(['2026-11-03', '12.00'])
  })

  it('keeps blank lines as empty rows so row numbers match the file, but drops trailing ones', () => {
    const rows = parseCsvText('Date,Amount\n\n,\n2026-11-03,1\n\n')
    expect(rows).toHaveLength(4)
    expect(rows[3]).toEqual(['2026-11-03', '1']) // line 4 of the file
  })

  it('skips blank lines when finding the header', () => {
    expect(detectHeaderRow(parseCsvText('Bank export\n\nDate,Description,Amount\n2026-11-03,X,-1'))).toBe(2)
  })

  it('recognises files that are not really CSV', () => {
    expect(() => parseCsvText('%PDF-1.7 ...')).toThrow(ImportError)
    expect(() => parseCsvText('PK\u0003\u0004 binary')).toThrow(/Excel/)
    expect(() => parseCsvText('just one column\nof text')).toThrow(/columns/)
    expect(() => parseCsvText('\n\n')).toThrow(/No rows/)
  })
})

describe('detectHeaderRow', () => {
  it('finds a header on the first row', () => {
    expect(detectHeaderRow([['Date', 'Description', 'Amount'], ['2026-11-03', 'X', '-1']])).toBe(0)
  })

  it('skips account information above the table', () => {
    const rows = [
      ['Account: Everyday Checking ****1234'],
      ['Statement period', '10/01/2026 - 10/31/2026'],
      ['Transaction Date', 'Details', 'Debit', 'Credit'],
      ['10/03/2026', 'COFFEE', '4.50', ''],
      ['10/04/2026', 'PAYROLL', '', '2450.00'],
    ]
    expect(detectHeaderRow(rows)).toBe(2)
  })
})

describe('headerSignature', () => {
  it('ignores case and surrounding spaces', () => {
    expect(headerSignature([' Date', 'AMOUNT '])).toBe(headerSignature(['date', 'amount']))
  })
})
