import { describe, expect, it } from 'vitest'
import { tx } from '../test/factories'
import { filterTransactions, NO_FILTERS, transactionsMatchingKeyword } from './transactions'

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
