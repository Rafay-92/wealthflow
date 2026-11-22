import { describe, expect, it } from 'vitest'
import { tx } from '../test/factories'
import { filterTransactions, merchantNames, NO_FILTERS, sortTransactions, transactionsMatchingKeyword, transactionType } from './transactions'

const data = [
  tx({ id: 'a', date: '2026-10-03', description: 'STARBUCKS #12', category: 'Restaurants', accountId: 'chk', categorySource: 'keyword' }),
  tx({ id: 'b', date: '2026-11-04', description: 'WHOLE FOODS', category: 'Groceries', accountId: 'chk', categorySource: 'keyword' }),
  tx({ id: 'c', date: '2026-11-05', description: 'MYSTERY SHOP', category: 'Other', accountId: 'card', categorySource: 'default' }),
  tx({ id: 'd', date: '2026-11-06', description: 'STARBUCKS #40', category: 'Entertainment', accountId: 'card', categorySource: 'manual' }),
]
const ids = (list: { id: string }[]) => list.map((t) => t.id)

describe('filterTransactions', () => {
  it('returns everything with no filters', () => {
    expect(ids(filterTransactions(data, NO_FILTERS))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('searches descriptions and categories, ignoring case', () => {
    expect(ids(filterTransactions(data, { ...NO_FILTERS, search: 'starbucks' }))).toEqual(['a', 'd'])
    expect(ids(filterTransactions(data, { ...NO_FILTERS, search: 'grocer' }))).toEqual(['b'])
  })

  it('combines month, category and account filters', () => {
    expect(ids(filterTransactions(data, { ...NO_FILTERS, month: '2026-11', accountId: 'card' }))).toEqual(['c', 'd'])
    expect(ids(filterTransactions(data, { ...NO_FILTERS, category: 'Restaurants' }))).toEqual(['a'])
  })

  it('shows only uncategorised transactions when reviewing', () => {
    expect(ids(filterTransactions(data, { ...NO_FILTERS, needsReview: true }))).toEqual(['c'])
  })
})

describe('transactionsMatchingKeyword', () => {
  it('finds what a rule would change, skipping manual choices', () => {
    expect(ids(transactionsMatchingKeyword(data, 'Starbucks'))).toEqual(['a'])
  })

  it('matches nothing for an empty keyword', () => {
    expect(transactionsMatchingKeyword(data, '  #  ')).toEqual([])
  })
})

describe('transaction types, filters and sorting', () => {
  const list = [
    tx({ id: 'pay', date: '2026-10-01', amount: 300000, category: 'Income', description: 'ACME PAYROLL' }),
    tx({ id: 'buy', date: '2026-10-05', amount: -4500, category: 'Shopping', description: 'BLUE HERON GIFTS #12' }),
    tx({ id: 'ref', date: '2026-10-09', amount: 4500, category: 'Shopping', description: 'RETURN BLUE HERON GIFTS' }),
    tx({ id: 'tfr', date: '2026-10-10', amount: -90000, category: 'Transfers', description: 'TFR TO SAVINGS' }),
    tx({ id: 'rev', date: '2026-10-12', amount: -300000, category: 'Income', description: 'ACME PAYROLL REVERSAL' }),
  ]

  it('classifies each transaction by what it means for your totals', () => {
    expect(list.map(transactionType)).toEqual(['income', 'expense', 'refund', 'transfer', 'income'])
  })

  it('filters by type, merchant and date range', () => {
    expect(ids(filterTransactions(list, { ...NO_FILTERS, type: 'refund' }))).toEqual(['ref'])
    expect(ids(filterTransactions(list, { ...NO_FILTERS, merchant: 'blue heron' }))).toEqual(['buy', 'ref'])
    expect(ids(filterTransactions(list, { ...NO_FILTERS, dateFrom: '2026-10-05', dateTo: '2026-10-10' }))).toEqual(['buy', 'ref', 'tfr'])
  })

  it('sorts by date either way, and by the size of the amount', () => {
    expect(ids(sortTransactions(list, 'date-asc'))).toEqual(['pay', 'buy', 'ref', 'tfr', 'rev'])
    expect(ids(sortTransactions(list, 'date-desc'))).toEqual(['rev', 'tfr', 'ref', 'buy', 'pay'])
    // $3,000 reversal and $3,000 pay are equal in size: newest first.
    expect(ids(sortTransactions(list, 'amount-desc'))).toEqual(['rev', 'pay', 'tfr', 'ref', 'buy'])
    expect(ids(sortTransactions(list, 'amount-asc'))[0]).toBe('ref')
  })

  it('lists merchant names for suggestions', () => {
    expect(merchantNames(list)).toContain('BLUE HERON')
  })
})
