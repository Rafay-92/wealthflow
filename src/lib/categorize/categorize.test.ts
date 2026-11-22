import { describe, expect, it } from 'vitest'
import { SAMPLE_ACCOUNTS, SAMPLE_TRANSACTIONS } from '../../data/sampleData'
import { tx } from '../../test/factories'
import type { CategoryRule, Transaction } from '../../types/transaction'
import { categorizeAll, previewCategories } from './categorize'
import { findTransferPairs } from './transfers'
import { BUILTIN_KEYWORDS } from './builtinRules'
import { normalizeMerchantText } from './text'

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

  it.each([
    ['LOBLAWS #1234 TORONTO ON', -8450, 'Groceries'],
    ['TIM HORTONS #2231', -425, 'Restaurants'],
    ['PRESTO AUTOLOAD', -5000, 'Transportation'],
    ['PETRO-CANADA 4410', -6123, 'Transportation'],
    ['TORONTO HYDRO', -9640, 'Utilities'],
    ['Hydro-Québec', -11200, 'Utilities'],
    ['ROGERS ******1234', -9500, 'Utilities'],
    ['SHOPPERS DRUG MART #0912', -2399, 'Healthcare'],
    ['CANADIAN TIRE #145', -6410, 'Shopping'],
    ['CINEPLEX ENTERTAINMENT', -3100, 'Entertainment'],
    ['TACO BELL', -1200, 'Restaurants'], // not "Bell" the phone company
    ['CANADA GST', 12250, 'Income'],
    ['DEPOT DIRECT PAIE', 245000, 'Income'],
  ] as const)('Canada: %j -> %s', (description, amount, category) => {
    expect(one(tx({ description, amount })).category).toBe(category)
  })

  it('treats a refund from a shop as that shop’s category (it reduces spending)', () => {
    expect(one(tx({ description: 'AMAZON.COM REFUND', amount: 3499 })).category).toBe('Shopping')
  })

  it('only counts "INTEREST" as income when money comes in', () => {
    expect(one(tx({ description: 'INTEREST PAYMENT', amount: 412 })).category).toBe('Income')
    expect(one(tx({ description: 'INTEREST CHARGE', amount: -1250 })).category).toBe('Other')
  })

  it('has no keyword that cleaning erases or collapses into one generic word', () => {
    // Cleaning drops filler words (INC, COM…) and words with digits. A keyword
    // like "METRO INC" would silently become just "METRO" and start matching
    // "METRO WATER DISTRICT"; "FIT4LESS" would vanish entirely.
    // ("APPLE.COM/BILL" -> "APPLE BILL" is fine: still specific.)
    const broken = BUILTIN_KEYWORDS.flatMap((g) => g.keywords).filter((k) => {
      const cleaned = normalizeMerchantText(k)
      const wordsBefore = k.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).length
      return cleaned === '' || (wordsBefore > 1 && cleaned.split(' ').length === 1)
    })
    expect(broken).toEqual([])
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
    expect(one(tx({ description: 'ZELLE TRANSFER TO ALEX', amount: -4000 })).category).toBe('E-Transfers')
    expect(one(tx({ description: 'VENMO PAYMENT', amount: -2500 })).category).not.toBe('Transfers')
  })

  it('recognises Canadian banks’ transfer wording', () => {
    expect(one(tx({ description: 'TFR-TO 5214821', amount: -50000 })).category).toBe('Transfers') // TD
    expect(one(tx({ description: 'WWW TRF DDA - 4021', amount: -50000 })).category).toBe('Transfers') // RBC
    expect(one(tx({ description: 'MB-TRANSFER TO DEPOSIT ACCOUNT', amount: -50000 })).category).toBe('Transfers') // CIBC
    expect(one(tx({ description: 'PAIEMENT MERCI', amount: 42500 })).category).toBe('Transfers')
  })

  it('treats Interac e-Transfers as payments to people, not transfers', () => {
    expect(one(tx({ description: 'SEND E-TFR ***Xd4 ALEX', amount: -4000 })).category).not.toBe('Transfers')
    expect(one(tx({ description: 'INTERAC E-TRANSFER TO SAM', amount: -2500 })).category).not.toBe('Transfers')
    expect(one(tx({ description: 'VIREMENT INTERAC A MARIE', amount: -3000 })).category).not.toBe('Transfers')
  })

  it('puts e-transfers in their own category, never Utilities (the reported bug)', () => {
    // "INTERNET" is a Utilities keyword; it must not win for an e-transfer.
    expect(one(tx({ description: 'INTERNET BANKING E-TRANSFER 105234 JOHN', amount: -15000 }))).toMatchObject({
      category: 'E-Transfers',
      categoryNote: 'E-transfer sent',
    })
    expect(one(tx({ description: 'SEND E-TFR ***Xd4', amount: -4000 })).category).toBe('E-Transfers')
    expect(one(tx({ description: 'Interac e-Transfer To: ROGERS', amount: -9500 })).category).toBe('E-Transfers')
    expect(one(tx({ description: 'VIREMENT INTERAC A MARIE', amount: -3000 })).category).toBe('E-Transfers')
  })

  it('counts a received e-transfer as income', () => {
    expect(one(tx({ description: 'INTERNET BANKING E-TRANSFER DEPOSIT', amount: 25000 }))).toMatchObject({
      category: 'Income',
      categoryNote: 'E-transfer received',
    })
  })

  it('keeps PayPal shopping as shopping, not an e-transfer', () => {
    expect(one(tx({ description: 'PAYPAL *EBAY', amount: -4500 })).category).toBe('Shopping')
  })

  it('lets your own rules override the e-transfer category', () => {
    expect(one(tx({ description: 'E-TRANSFER SENT LANDLORD', amount: -165000 }), [rule('LANDLORD', 'Housing')]).category).toBe('Housing')
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

describe('refunds, reversals and credit cards', () => {
  const card = [{ id: 'card', name: 'Visa', type: 'credit' as const }]

  it('a refund from a known merchant reduces that category, it is never income', () => {
    const r = one(tx({ description: 'REFUND AMAZON.CA', amount: 3412 }))
    expect(r.category).toBe('Shopping')
    expect(r.categoryNote).toMatch(/Refund/)
  })

  it('a refund from an unknown merchant takes the category of the earlier purchase', () => {
    const purchase = tx({ description: 'BLUE HERON GIFTS #12', amount: -4500, date: '2026-10-02', category: 'Shopping', categorySource: 'manual' })
    const refund = tx({ description: 'RETURN - BLUE HERON GIFTS', amount: 4500, date: '2026-10-09' })
    const [, r] = categorizeAll([purchase, refund], [])
    expect(r!.category).toBe('Shopping')
  })

  it('an unmatched refund is "Other" (lower spending) and flagged, never income', () => {
    const r = one(tx({ description: 'MERCHANT REVERSAL 88123', amount: 1999 }))
    expect(r.category).toBe('Other')
    expect(r.categorySource).toBe('default')
  })

  it('a tax refund is still income', () => {
    expect(one(tx({ description: 'CANADA FED TAX REFUND', amount: 84000 })).category).toBe('Income')
  })

  it('a reversed paycheque lowers income instead of counting as spending', () => {
    const r = one(tx({ description: 'PAYROLL REVERSAL ACME', amount: -245000 }))
    expect(r.category).toBe('Income')
  })

  it('an unrecognised credit on a credit card is a payment, not income', () => {
    const [r] = categorizeAll([tx({ description: 'THANK YOU 0001', amount: 50000, accountId: 'card' })], [], card)
    expect(r!.category).toBe('Transfers')
    expect(r!.categorySource).toBe('default') // shown under "needs review"
  })

  it('paying the card from chequing is a transfer even when the card statement is not imported', () => {
    expect(one(tx({ description: 'TD VISA PAYMENT 4520', amount: -50000, accountId: 'chk' })).category).toBe('Transfers')
    expect(one(tx({ description: 'PAYMENT - MASTERCARD', amount: -12000 })).category).toBe('Transfers')
  })
})
