import { describe, expect, it } from 'vitest'
import { detectDateFormat, parseDate } from './dateFormats'

describe('parseDate', () => {
  it.each([
    ['2026-11-03', 'YYYY-MM-DD', '2026-11-03'],
    ['2026/11/3', 'YYYY-MM-DD', '2026-11-03'],
    ['11/03/2026', 'MM/DD/YYYY', '2026-11-03'],
    ['3/11/2026', 'DD/MM/YYYY', '2026-11-03'],
    ['03.11.2026', 'DD/MM/YYYY', '2026-11-03'],
    ['11/03/26', 'MM/DD/YY', '2026-11-03'],
    ['03-11-26', 'DD/MM/YY', '2026-11-03'],
    ['Nov 3, 2026', 'MONTH_NAME', '2026-11-03'],
    ['November 3 2026', 'MONTH_NAME', '2026-11-03'],
    ['3 Nov 2026', 'MONTH_NAME', '2026-11-03'],
    ['03-Nov-2026', 'MONTH_NAME', '2026-11-03'],
    ['2026-11-03 14:22:10', 'YYYY-MM-DD', '2026-11-03'],
    ['2026-11-03T14:22:10Z', 'YYYY-MM-DD', '2026-11-03'],
    ['11/03/2026 12:00 AM', 'MM/DD/YYYY', '2026-11-03'],
  ] as const)('reads %j as %s', (input, format, expected) => {
    expect(parseDate(input, format)).toBe(expected)
  })

  it('rejects impossible dates instead of rolling them over', () => {
    expect(parseDate('02/30/2026', 'MM/DD/YYYY')).toBeNull()
    expect(parseDate('13/01/2026', 'MM/DD/YYYY')).toBeNull()
    expect(parseDate('Foo 3, 2026', 'MONTH_NAME')).toBeNull()
  })

  it('rejects text in the wrong format', () => {
    expect(parseDate('2026-11-03', 'MM/DD/YYYY')).toBeNull()
    expect(parseDate('', 'YYYY-MM-DD')).toBeNull()
  })
})

describe('detectDateFormat', () => {
  it('detects ISO dates', () => {
    expect(detectDateFormat(['2026-11-03', '2026-11-14'])).toEqual({ format: 'YYYY-MM-DD', ambiguous: false })
  })

  it('detects US dates when a day is above 12', () => {
    expect(detectDateFormat(['11/03/2026', '11/25/2026'])).toEqual({ format: 'MM/DD/YYYY', ambiguous: false })
  })

  it('detects day-first dates when a day is above 12', () => {
    expect(detectDateFormat(['03/11/2026', '25/11/2026'])).toEqual({ format: 'DD/MM/YYYY', ambiguous: false })
  })

  it('flags dates that could be read either way', () => {
    // Is 03/11 March 11th or 3rd November? Can't tell, so ask.
    expect(detectDateFormat(['03/11/2026', '04/11/2026'])).toEqual({ format: 'MM/DD/YYYY', ambiguous: true })
  })

  it('detects month names', () => {
    expect(detectDateFormat(['Nov 3, 2026', 'Nov 14, 2026']).format).toBe('MONTH_NAME')
  })
})
