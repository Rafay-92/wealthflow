import { describe, expect, it } from 'vitest'
import { containsKeyword, normalizeMerchantText, suggestKeyword } from './text'

describe('normalizeMerchantText', () => {
  it.each([
    ['Starbucks Store #12345 Seattle', 'STARBUCKS STORE SEATTLE'],
    ['AMZN Mktp US*2K3L9', 'AMZN MKTP'],
    ['APPLE.COM/BILL', 'APPLE BILL'],
    ["TRADER JOE'S #552", 'TRADER JOE S'],
    ['POS PURCHASE T-MOBILE 10/31', 'T MOBILE'],
    ['Hydro-Québec', 'HYDRO QUEBEC'],
    ['Épicerie Métro', 'EPICERIE METRO'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeMerchantText(input)).toBe(expected)
  })
})

describe('containsKeyword', () => {
  it('matches whole words only', () => {
    expect(containsKeyword('MAPLE COURT APARTMENTS RENT', 'RENT')).toBe(true)
    expect(containsKeyword('CURRENT ACCOUNT FEE', 'RENT')).toBe(false)
    expect(containsKeyword('T MOBILE', 'MOBIL')).toBe(false)
  })

  it('matches multi-word keywords in sequence', () => {
    expect(containsKeyword('WHOLE FOODS MARKET', 'WHOLE FOODS')).toBe(true)
    expect(containsKeyword('FOODS WHOLE', 'WHOLE FOODS')).toBe(false)
  })

  it('never matches an empty keyword', () => {
    expect(containsKeyword('ANYTHING', '')).toBe(false)
  })
})

describe('suggestKeyword', () => {
  it.each([
    ['STARBUCKS STORE #12345', 'STARBUCKS'],
    ['WHOLE FOODS MARKET', 'WHOLE FOODS'],
    ['AMAZON.COM REFUND', 'AMAZON'],
    ['THAI BASIL KITCHEN', 'THAI BASIL'],
  ])('%j -> %j', (input, expected) => {
    expect(suggestKeyword(input)).toBe(expected)
  })
})
