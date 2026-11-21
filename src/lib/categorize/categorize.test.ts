import { describe, expect, it } from 'vitest'
import { SAMPLE_ACCOUNTS, SAMPLE_TRANSACTIONS } from '../../data/sampleData'
import { tx } from '../../test/factories'
import type { CategoryRule, Transaction } from '../../types/transaction'
import { categorizeAll, previewCategories } from './categorize'
import { findTransferPairs } from './transfers'

const one = (t: Transaction, rules: CategoryRule[] = []) => categorizeAll([t], rules)[0]!
const rule = (keyword: string, category: CategoryRule['category']): CategoryRule => ({
  id: keyword,
  keyword,
  category,
  createdAt: '2026-11-21T00:00:00Z',
})

describe('built-in keywords', () => {
  it.each([
    ['WHOLE FOODS MARKET #10233', -5230, 'Groceries'],
    ['STARBUCKS STORE 12345', -575, 'Restaurants'],
    ['UBER EATS', -2400, 'Restaurants'], // longer keyword beats "UBER"
    ['UBER *TRIP', -1800, 'Transportation'],
    ['AMAZON PRIME*2K4', -1499, 'Subscriptions'], // beats "AMAZON"
    ['AMZN Mktp US*2K3L9', -3412, 'Shopping'],
    ['APPLE.COM/BILL', -299, 'Subscriptions'],
    ['MAPLE COURT APARTMENTS RENT', -165000, 'Housing'],
    ['CITY POWER & LIGHT', -9640, 'Utilities'],
    ['CVS/PHARMACY #0423', -1899, 'Healthcare'],
    ['ACME CORP PAYROLL', 245000, 'Income'],
  ] as const)('%j -> %s', (description, amount, category) => {
    const result = one(tx({ description, amount }))
    expect(result.category).toBe(category)
    expect(result.categorySource).toBe('keyword')
  })

  it('treats a refund from a shop as that shop’s category (it reduces spending)', () => {
    expect(one(tx({ description: 'AMAZON.COM REFUND', amount: 3499 })).category).toBe('Shopping')
  })

  it('only counts "INTEREST" as income when money comes in', () => {
    expect(one(tx({ description: 'INTEREST PAYMENT', amount: 412 })).category).toBe('Income')
    expect(one(tx({ description: 'INTEREST CHARGE', amount: -1250 })).category).toBe('Other')
  })

  it('reproduces every category in the sample data', () => {
    const result = categorizeAll(SAMPLE_TRANSACTIONS, [], SAMPLE_ACCOUNTS)
    const mismatches = result
      .map((t, i) => ({ description: t.description, got: t.category, expected: SAMPLE_TRANSACTIONS[i]!.category }))
      .filter((m) => m.got !== m.expected)
    expect(mismatches).toEqual([])
  })
})

describe('fallbacks', () => {
  it('marks unknown spending as Other, needing review', () => {
    expect(one(tx({ description: 'XYZ123 LOCAL SHOP', amount: -1000 }))).toMatchObject({ category: 'Other', categorySource: 'default' })
  })

  it('marks unknown money in as Income, needing review', () => {
    expect(one(tx({ description: 'MYSTERY CREDIT', amount: 1000 }))).toMatchObject({ category: 'Income', categorySource: 'default' })
  })
})

describe('priority', () => {
  it('never changes a category you set by hand', () => {
    const manual = tx({ description: 'STARBUCKS', category: 'Entertainment', categorySource: 'manual' })
    expect(one(manual, [rule('STARBUCKS', 'Groceries')])).toBe(manual)
  })

  it('applies your rules before built-in keywords', () => {
    expect(one(tx({ description: 'STARBUCKS #12', amount: -500 }), [rule('Starbucks', 'Entertainment')])).toMatchObject({
      category: 'Entertainment',
      categorySource: 'rule',
      categoryNote: 'Your rule: “Starbucks”',
    })
  })

  it('prefers the more specific of two of your rules', () => {
    const rules = [rule('AMAZON', 'Shopping'), rule('AMAZON FRESH', 'Groceries')]
    expect(one(tx({ description: 'AMAZON FRESH ORDER' }), rules).category).toBe('Groceries')
  })

  it('returns the same object when nothing changed, so changes are cheap to find', () => {
    const first = one(tx({ description: 'NETFLIX.COM', amount: -1549 }))
    expect(categorizeAll([first], [])[0]).toBe(first)
  })
})

describe('transfers', () => {
  it('recognises clear transfer wording', () => {
    expect(one(tx({ description: 'ONLINE TRANSFER TO SAVINGS 4521', amount: -50000 })).category).toBe('Transfers')
    expect(one(tx({ description: 'PAYMENT THANK YOU', amount: 42500 })).category).toBe('Transfers')
  })

  it('does not treat payments to other people as transfers', () => {
    expect(one(tx({ description: 'ZELLE TRANSFER TO ALEX', amount: -4000 })).category).toBe('Other')
    expect(one(tx({ description: 'VENMO PAYMENT', amount: -2500 })).category).not.toBe('Transfers')
  })

  it('lets a merchant win over weak wording like AUTOPAY', () => {
    expect(one(tx({ description: 'COMCAST AUTOPAY', amount: -8999 })).category).toBe('Utilities')
    expect(one(tx({ description: 'REWARDS CARD AUTOPAY', amount: -42500 })).category).toBe('Transfers')
  })

  it('pairs matching amounts across two accounts and explains the match', () => {
    const out = tx({ id: 'out', accountId: 'chk', date: '2026-11-14', description: 'ONLINE PMT REWARDS', amount: -42500 })
    const into = tx({ id: 'in', accountId: 'card', date: '2026-11-15', description: 'THANK YOU', amount: 42500 })
    const [a, b] = categorizeAll([out, into], [], [{ id: 'card', name: 'Rewards Card', type: 'credit' }])
    expect(a).toMatchObject({ category: 'Transfers', categoryNote: 'Matches +$425.00 in Rewards Card on Nov 15' })
    expect(b!.category).toBe('Transfers')
  })
})

describe('findTransferPairs', () => {
  const out = (o: Partial<Transaction> = {}) => tx({ id: 'o', accountId: 'chk', date: '2026-11-14', description: 'TRANSFER', amount: -10000, ...o })
  const inc = (o: Partial<Transaction> = {}) => tx({ id: 'i', accountId: 'sav', date: '2026-11-14', description: 'DEPOSIT', amount: 10000, ...o })

  it('pairs opposite amounts in different accounts within 3 days', () => {
    expect(findTransferPairs([out(), inc({ date: '2026-11-17' })]).get('o')?.id).toBe('i')
  })

  it('rejects pairs more than 3 days apart', () => {
    expect(findTransferPairs([out(), inc({ date: '2026-11-18' })]).size).toBe(0)
  })

  it('rejects pairs in the same account', () => {
    expect(findTransferPairs([out(), inc({ accountId: 'chk' })]).size).toBe(0)
  })

  it('rejects coincidences with no transfer-like wording', () => {
    expect(findTransferPairs([out({ description: 'GROCERY STORE' }), inc({ description: 'BOOKSHOP REFUND' })]).size).toBe(0)
  })

  it('pairs each transaction only once, choosing the closest date', () => {
    const far = inc({ id: 'far', date: '2026-11-16' })
    const near = inc({ id: 'near', date: '2026-11-15' })
    const pairs = findTransferPairs([out(), far, near])
    expect(pairs.get('o')?.id).toBe('near')
    expect(pairs.has('far')).toBe(false)
  })

  it('never pairs a transaction you categorised by hand', () => {
    expect(findTransferPairs([out({ categorySource: 'manual' }), inc()]).size).toBe(0)
  })
})

describe('previewCategories', () => {
  it('predicts categories for rows about to be imported, including pairs with saved data', () => {
    const saved = [tx({ accountId: 'card', date: '2026-11-14', description: 'PAYMENT RECEIVED', amount: 42500, category: 'Transfers' })]
    const drafts = [
      { rowNumber: 2, date: '2026-11-14', description: 'ONLINE PMT', amount: -42500, balance: null },
      { rowNumber: 3, date: '2026-11-15', description: 'SAFEWAY', amount: -3000, balance: null },
    ]
    expect(previewCategories(drafts, 'chk', saved, [])).toEqual(['Transfers', 'Groceries'])
  })
})
