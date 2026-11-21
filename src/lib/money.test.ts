import { describe, expect, it } from 'vitest'
import { formatCents, formatPercent, parseAmountToCents, percentOf, sumCents } from './money'

describe('parseAmountToCents', () => {
  it.each([
    ['12.34', 1234],
    ['-12.34', -1234],
    ['+12.34', 1234],
    ['12', 1200],
    ['12.5', 1250],
    ['.5', 50],
    ['0.01', 1],
    ['$1,234.56', 123456],
    ['-$1,234.56', -123456],
    ['$-1,234.56', -123456],
    ['1,000,000.00', 100000000],
    ['(45.10)', -4510],
    ['45.10-', -4510],
    ['  7.00  ', 700],
    ['−12.00', -1200], // Unicode minus sign
    ['1.00', 100],
  ])('parses %j as %i cents', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected)
  })

  it('avoids floating-point errors that parseFloat * 100 would cause', () => {
    // parseFloat('1.15') * 100 === 114.99999999999999
    expect(parseAmountToCents('1.15')).toBe(115)
    expect(parseAmountToCents('4.35')).toBe(435)
  })

  it('returns 0, never -0, for zero amounts', () => {
    expect(Object.is(parseAmountToCents('-0.00'), 0)).toBe(true)
  })

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['12.345'], // more than 2 decimals: refuse rather than silently round
    ['12,34'], // European decimal comma: ambiguous, so refuse
    ['1,23,456'], // badly grouped thousands
    ['12.34.56'],
    ['$'],
    ['-'],
    ['.'],
    ['1e5'],
  ])('rejects %j', (input) => {
    expect(parseAmountToCents(input)).toBeNull()
  })
})

describe('formatCents', () => {
  it('formats US dollars with separators', () => {
    expect(formatCents(123456)).toBe('$1,234.56')
    expect(formatCents(5)).toBe('$0.05')
    expect(formatCents(0)).toBe('$0.00')
  })

  it('puts the minus sign before the dollar sign', () => {
    expect(formatCents(-1234)).toBe('-$12.34')
  })

  it('supports whole-dollar and signed formats', () => {
    expect(formatCents(123456, { whole: true })).toBe('$1,235')
    expect(formatCents(1200, { signed: true })).toBe('+$12.00')
    expect(formatCents(-1200, { signed: true })).toBe('-$12.00')
    expect(formatCents(0, { signed: true })).toBe('$0.00')
  })

  it('throws on non-integer input, catching bugs early', () => {
    expect(() => formatCents(12.34)).toThrow(TypeError)
  })
})

describe('sumCents', () => {
  it('sums exactly where floating-point dollars would drift', () => {
    // As dollars: 0.1 + 0.2 = 0.30000000000000004
    expect(sumCents([10, 20])).toBe(30)

    // 1,000 transactions of $0.10 add up to exactly $100.00
    expect(sumCents(Array.from({ length: 1000 }, () => 10))).toBe(10000)
  })

  it('handles income and expenses together', () => {
    expect(sumCents([500000, -120050, -4599, -1])).toBe(375350)
  })

  it('returns 0 for an empty list', () => {
    expect(sumCents([])).toBe(0)
  })

  it('rejects non-integer values', () => {
    expect(() => sumCents([100, 0.5])).toThrow(TypeError)
    expect(() => sumCents([100, Number.NaN])).toThrow(TypeError)
  })
})

describe('percentOf', () => {
  it('computes a savings rate', () => {
    // Saved $1,000 of $4,000 income = 25%
    expect(percentOf(100000, 400000)).toBe(25)
  })

  it('returns null rather than dividing by zero', () => {
    expect(percentOf(5000, 0)).toBeNull()
  })

  it('allows negative results (spent more than earned)', () => {
    expect(percentOf(-50000, 400000)).toBe(-12.5)
  })
})

describe('formatPercent', () => {
  it('rounds for display', () => {
    expect(formatPercent(18.456)).toBe('18.5%')
    expect(formatPercent(25, 0)).toBe('25%')
  })

  it('shows a dash when there is no value', () => {
    expect(formatPercent(null)).toBe('—')
  })
})
