import { describe, expect, it } from 'vitest'
import { tx } from '../../test/factories'
import type { Account } from '../../types/account'
import { pointsFromMonthlyBalances, type BalancePoint } from '../../types/balance'
import { monthPeriod } from '../analytics/periods'
import { resolvePeriod } from '../analytics/reportPeriod'
import { summarize } from '../analytics/summary'
import { sumCents } from '../money'
import { balanceAt, combineReconciliations, describeOpening, explainDifference, isBankAccount, reconcileAccount } from './reconcile'

const chequing: Account = { id: 'chk', name: 'Chequing', type: 'checking' }
const savings: Account = { id: 'sav', name: 'Savings', type: 'savings' }
const point = (accountId: string, date: string, amount: number): BalancePoint => ({ id: `${accountId}:${date}`, accountId, date, amount, updatedAt: '' })
/** An opening on the 1st and, optionally, an actual closing at the end of the month. */
const monthBalances = (accountId: string, month: string, opening: number | null, actualClosing: number | null = null) =>
  pointsFromMonthlyBalances([{ id: `${accountId}:${month}`, accountId, month, opening, actualClosing, updatedAt: '' }], null)
const oct = resolvePeriod({ kind: 'month', month: '2026-10' }, '2026-11-01')

// October in chequing: pay, rent, groceries, a refund, money to savings, an e-transfer sent.
const october = [
  tx({ accountId: 'chk', date: '2026-10-01', amount: 400000, category: 'Income' }),
  tx({ accountId: 'chk', date: '2026-10-02', amount: -165000, category: 'Housing' }),
  tx({ accountId: 'chk', date: '2026-10-05', amount: -12000, category: 'Groceries' }),
  tx({ accountId: 'chk', date: '2026-10-09', amount: 2000, category: 'Shopping' }), // refund
  tx({ accountId: 'chk', date: '2026-10-16', amount: -50000, category: 'Transfers' }), // to savings
  tx({ accountId: 'sav', date: '2026-10-16', amount: 50000, category: 'Transfers' }), // from chequing
  tx({ accountId: 'chk', date: '2026-10-20', amount: -4000, category: 'E-Transfers' }),
  tx({ accountId: 'chk', date: '2026-11-01', amount: 400000, category: 'Income' }), // next month: ignored
]

describe('reconcileAccount', () => {
  const r = reconcileAccount(october, chequing, oct, monthBalances('chk', '2026-10', 100000, 271000))

  it('splits the period into income, expenses and transfers like the Dashboard does', () => {
    expect(r).toMatchObject({ income: 400000, expenses: 165000 + 12000 - 2000 + 4000, transfersIn: 0, transfersOut: 50000, transactionCount: 6 }) // the savings side belongs to the other account
  })

  it('adds up EXACTLY to the real cash flow, so nothing is counted twice or invented', () => {
    const cashFlow = sumCents(october.filter((t) => t.accountId === 'chk' && t.date.startsWith('2026-10')).map((t) => t.amount))
    expect(r.income - r.expenses + r.transfersIn - r.transfersOut).toBe(cashFlow)
  })

  it('computes total available funds and the expected closing balance', () => {
    expect(r.totalAvailable).toBe(100000 + 400000)
    expect(r.expectedClosing).toBe(100000 + 400000 - 179000 - 50000)
  })

  it('compares with the actual closing balance; both user-provided, so it is verified', () => {
    expect(r).toMatchObject({ actualClosing: 271000, difference: 0, openingSource: 'user', verified: true })
  })

  it('reports a difference when a transaction is missing', () => {
    const missingFee = reconcileAccount(october, chequing, oct, monthBalances('chk', '2026-10', 100000, 270500))
    expect(missingFee.difference).toBe(-500) // the bank shows $5 less: an unimported fee, say
  })

  it('never changes income: balances are not transactions', () => {
    expect(summarize(october, monthPeriod('2026-10')).income).toBe(400000)
    expect(r.income).toBe(400000) // the $1,000 opening balance is NOT income
  })

  it('has no expected closing without an opening balance', () => {
    const none = reconcileAccount(october, chequing, oct, [])
    expect(none).toMatchObject({ opening: null, openingSource: null, totalAvailable: null, expectedClosing: null, difference: null, verified: false })
  })

  it('treats the receiving side of a transfer as a transfer, not income', () => {
    const s = reconcileAccount(october, savings, oct, monthBalances('sav', '2026-10', 0))
    expect(s).toMatchObject({ income: 0, transfersIn: 50000, expectedClosing: 50000 })
  })

  it('labels an unfinished month by the last date it covers', () => {
    const nov = reconcileAccount(october, chequing, resolvePeriod({ kind: 'month', month: '2026-11' }, '2026-11-01'), monthBalances('chk', '2026-11', 0))
    expect(nov).toMatchObject({ isPartial: true, throughDate: '2026-11-01', expectedClosing: 400000 })
  })

  it('works for a custom period spanning two months', () => {
    const custom = resolvePeriod({ kind: 'custom', start: '2026-10-16', end: '2026-11-01' }, '2026-11-01')
    const c = reconcileAccount(october, chequing, custom, [point('chk', '2026-10-16', 300000)])
    expect(c).toMatchObject({ transactionCount: 3, income: 400000, expenses: 4000, transfersOut: 50000, expectedClosing: 300000 + 400000 - 4000 - 50000 })
  })
})

describe('balanceAt: where an opening balance comes from', () => {
  const reported: Account = { ...chequing, balance: 271000, balanceAsOf: '2026-10-31' }

  it('a balance you entered for that exact date is User-provided', () => {
    expect(balanceAt(october, reported, '2026-10-01', [point('chk', '2026-10-01', 123)])).toEqual({ amount: 123, source: 'user', basedOn: null })
  })

  it('a balance worked back from the bank’s reported closing is Inferred, never User-provided', () => {
    // $2,710 at the end of Oct 31, minus October's net flow (+$1,710) = $1,000 at the start of Oct 1.
    expect(balanceAt(october, reported, '2026-10-01', [])).toEqual({ amount: 100000, source: 'inferred', basedOn: '2026-10-31' })
  })

  it('a balance carried from one you entered for another date is Estimated', () => {
    const r = balanceAt(october, chequing, '2026-10-16', [point('chk', '2026-10-01', 100000)])
    // Oct 1–15 net flow: +4,000 − 1,650 − 120 + 20 = +2,250
    expect(r).toEqual({ amount: 100000 + 225000, source: 'estimated', basedOn: '2026-10-01' })
  })

  it('last month’s actual closing is the same moment as this month’s opening', () => {
    const points = monthBalances('chk', '2026-10', null, 271000) // closing at the end of Oct 31
    expect(balanceAt(october, chequing, '2026-11-01', points)).toEqual({ amount: 271000, source: 'user', basedOn: null })
  })

  it('is Unknown with nothing to go on', () => {
    expect(balanceAt(october, chequing, '2026-10-01', [])).toBeNull()
    expect(describeOpening(null)).toMatch(/^Unknown/)
  })

  it('an inferred opening can never be "verified", even when it matches', () => {
    // Worked back from the bank's Oct 31 balance, so expected closing equals it by construction.
    const r = reconcileAccount(october, reported, oct, [point('chk', '2026-11-01', 271000)])
    expect(r).toMatchObject({ openingSource: 'inferred', expectedClosing: 271000, difference: 0, verified: false })
    expect(explainDifference(0, r.throughDate, false, r.verified)).toMatch(/^Can’t be verified/)
  })
})

describe('pointsFromMonthlyBalances (upgrading older data)', () => {
  it('turns openings into the 1st and closings into the next day', () => {
    const points = pointsFromMonthlyBalances([{ id: 'chk:2026-10', accountId: 'chk', month: '2026-10', opening: 100, actualClosing: 200, updatedAt: '' }], '2026-11-20')
    expect(points.map((p) => [p.date, p.amount]).sort()).toEqual([['2026-10-01', 100], ['2026-11-01', 200]])
  })

  it('an unfinished month’s closing was entered for the last day with data', () => {
    const points = pointsFromMonthlyBalances([{ id: 'chk:2026-11', accountId: 'chk', month: '2026-11', opening: null, actualClosing: 300, updatedAt: '' }], '2026-11-20')
    expect(points).toMatchObject([{ date: '2026-11-21', amount: 300 }])
  })

  it('when a closing and the next opening collide, the opening you typed wins', () => {
    const points = pointsFromMonthlyBalances(
      [
        { id: 'chk:2026-10', accountId: 'chk', month: '2026-10', opening: null, actualClosing: 200, updatedAt: '' },
        { id: 'chk:2026-11', accountId: 'chk', month: '2026-11', opening: 250, actualClosing: null, updatedAt: '' },
      ],
      null,
    )
    expect(points).toMatchObject([{ date: '2026-11-01', amount: 250 }])
  })
})

describe('combineReconciliations', () => {
  it('adds accounts up; a transfer between your own accounts cancels out', () => {
    const items = [
      reconcileAccount(october, chequing, oct, monthBalances('chk', '2026-10', 100000, 271000)),
      reconcileAccount(october, savings, oct, monthBalances('sav', '2026-10', 500000, 550000)),
    ]
    expect(combineReconciliations(items)).toMatchObject({
      accountCount: 2,
      opening: 600000,
      income: 400000,
      transfersNet: 0,
      expectedClosing: 821000,
      actualClosing: 821000,
      difference: 0,
      verified: true,
      allOpeningsProvided: true,
    })
  })

  it('leaves out accounts with no opening balance, and names them', () => {
    const items = [reconcileAccount(october, chequing, oct, monthBalances('chk', '2026-10', 100000)), reconcileAccount(october, savings, oct, [])]
    const c = combineReconciliations(items)
    expect(c).toMatchObject({ accountCount: 1, missingOpening: ['Savings'], actualClosing: null, difference: null })
  })
})

describe('isBankAccount', () => {
  it('includes chequing and savings, not credit cards', () => {
    expect(isBankAccount(chequing)).toBe(true)
    expect(isBankAccount(savings)).toBe(true)
    expect(isBankAccount({ id: 'c', name: 'Card', type: 'credit' })).toBe(false)
  })
})

describe('explainDifference', () => {
  it('explains both directions and the balanced case', () => {
    expect(explainDifference(0, '2026-10-31', false)).toMatch(/^Balanced/)
    expect(explainDifference(21215, '2026-10-31', false)).toMatch(/\$212\.15 MORE .* deposit or refund that wasn’t imported/)
    expect(explainDifference(-500, '2026-11-20', true)).toMatch(/\$5\.00 LESS .* only runs to Nov 20/)
  })
})
