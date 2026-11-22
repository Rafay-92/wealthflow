import { describe, expect, it } from 'vitest'
import type { StoredData } from '../data/repository'
import { tx } from '../test/factories'
import { backupData, backupFileName, createBackup, parseBackup, summarizeData, type Backup } from './backup'

const empty: StoredData = {
  transactions: [],
  accounts: [],
  imports: [],
  mappings: [],
  rules: [],
  subscriptionDecisions: [],
  wealthItems: [],
  wealthEntries: [],
  balancePoints: [],
  deletedTransactions: [],
  budgets: [],
}

describe('createBackup', () => {
  it('includes every table plus a header, and survives a JSON round trip', () => {
    const data: StoredData = { ...empty, transactions: [tx({ id: 'a' })], accounts: [{ id: 'chk', name: 'Checking', type: 'checking' }] }
    const backup = createBackup(data, new Date('2026-11-21T10:00:00Z'))
    expect(backup).toMatchObject({ app: 'WealthFlow', formatVersion: 4, exportedAt: '2026-11-21T10:00:00.000Z' })
    for (const key of Object.keys(empty)) expect(backup).toHaveProperty(key)
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup)
  })
})

describe('parseBackup', () => {
  const good = createBackup(
    {
      ...empty,
      transactions: [tx({ id: 'a', amount: -1234, category: 'Groceries' })],
      wealthItems: [{ id: 'w', name: 'TFSA', type: 'registered', createdAt: '' }],
      wealthEntries: [{ id: 'w:2026-11-01', itemId: 'w', date: '2026-11-01', value: 500000 }],
    },
    new Date('2026-11-21T10:00:00Z'),
  )
  const text = (value: unknown) => JSON.stringify(value)
  const broken = (patch: (b: Record<string, unknown>) => void) => {
    const copy = JSON.parse(text(good)) as Record<string, unknown>
    patch(copy)
    return parseBackup(text(copy))
  }

  it('accepts what createBackup produces, unchanged', () => {
    const parsed = parseBackup(text(good))
    expect(parsed).toEqual(good)
    expect(backupData(parsed as Backup)).toEqual({ ...empty, transactions: good.transactions, wealthItems: good.wealthItems, wealthEntries: good.wealthEntries })
  })

  it.each([
    ['not JSON', () => parseBackup('{oops'), /isn’t valid JSON/],
    ['another app', () => parseBackup(text({ app: 'Other' })), /isn’t a WealthFlow backup/],
    ['a newer version', () => broken((b) => (b.formatVersion = 99)), /newer version/],
    ['a missing table', () => broken((b) => delete b.rules), /“rules” is missing/],
    ['a fractional amount', () => broken((b) => ((b.transactions as { amount: number }[])[0]!.amount = 12.34)), /Transaction 1 .* invalid amount/],
    ['an impossible date', () => broken((b) => ((b.transactions as { date: string }[])[0]!.date = '2026-02-30')), /invalid date/],
    ['an unknown category', () => broken((b) => ((b.transactions as { category: string }[])[0]!.category = 'Yachts')), /unknown category/],
    ['an unknown wealth type', () => broken((b) => ((b.wealthItems as { type: string }[])[0]!.type = 'gold-bars')), /Wealth item 1/],
    ['duplicate transactions', () => broken((b) => (b.transactions = [...(b.transactions as unknown[]), ...(b.transactions as unknown[])])), /duplicate/],
    ['a damaged balance', () => broken((b) => (b.balancePoints = [{ id: 'x', accountId: 'chk', date: 'October', amount: 1.5 }])), /Balance 1/],
  ])('refuses %s with a clear reason', (_label, run, message) => {
    expect(run()).toMatch(message)
  })

  it('still restores a backup made before monthly balances existed (version 1)', () => {
    const old = JSON.parse(text(good)) as Record<string, unknown>
    old.formatVersion = 1
    delete old.balancePoints
    const parsed = parseBackup(text(old))
    expect(typeof parsed).not.toBe('string')
    expect((parsed as Backup).balancePoints).toEqual([])
  })
})

describe('backupFileName', () => {
  it('uses the local date', () => {
    expect(backupFileName(new Date(2026, 10, 21, 23, 0))).toBe('wealthflow-backup-2026-11-21.json')
  })
})

describe('summarizeData', () => {
  it('counts what is stored and knows when nothing is', () => {
    expect(summarizeData(empty).isEmpty).toBe(true)
    const s = summarizeData({ ...empty, transactions: [tx(), tx()], rules: [{ id: 'r', keyword: 'X', category: 'Other', createdAt: '' }] })
    expect(s).toMatchObject({ transactions: 2, rules: 1, isEmpty: false })
  })
})

describe('backup formats 3 and 4', () => {
  const good = (extra: Partial<StoredData>) => JSON.stringify(createBackup({ ...empty, ...extra }))

  it('converts a version-3 backup’s monthly balances into dated balances', () => {
    const v3 = { ...createBackup(empty), formatVersion: 3, monthlyBalances: [{ id: 'chk:2026-10', accountId: 'chk', month: '2026-10', opening: 351240, actualClosing: 538183, updatedAt: '' }] } as Record<string, unknown>
    delete v3.balancePoints
    const result = parseBackup(JSON.stringify(v3)) as Backup
    expect(result.balancePoints.map((p) => [p.date, p.amount]).sort()).toEqual([['2026-10-01', 351240], ['2026-11-01', 538183]])
  })

  it('restores balances, budgets and deleted-transaction records', () => {
    const data = {
      balancePoints: [{ id: 'chk:2026-11-22', accountId: 'chk', date: '2026-11-22', amount: 500000, updatedAt: '2026-11-21' }],
      budgets: [{ category: 'Groceries' as const, amount: 60000, updatedAt: '2026-11-21' }],
      deletedTransactions: [{ id: 'x', accountId: 'chk', importId: 'imp1', importKey: 'chk|2026-10-01|-450|STARBUCKS', deletedAt: '2026-11-21' }],
    }
    const result = parseBackup(good(data))
    expect(typeof result).not.toBe('string')
    expect(backupData(result as Backup)).toMatchObject(data)
  })

  it('restores a version-2 backup, with no budgets or deleted records', () => {
    const { budgets: _b, deletedTransactions: _d, balancePoints: _p, ...v2 } = createBackup(empty)
    const result = parseBackup(JSON.stringify({ ...v2, monthlyBalances: [], formatVersion: 2 }))
    expect(result).toMatchObject({ budgets: [], deletedTransactions: [] })
  })

  it('refuses a budget that is zero, negative or for an unknown category', () => {
    expect(parseBackup(good({ budgets: [{ category: 'Groceries', amount: -5, updatedAt: '' }] }))).toMatch(/Budget 1/)
    expect(parseBackup(good({ budgets: [{ category: 'Nope' as never, amount: 500, updatedAt: '' }] }))).toMatch(/Budget 1/)
  })
})
