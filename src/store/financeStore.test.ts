// The real store against an in-memory IndexedDB: every action goes through
// Dexie exactly as in the browser, then the totals are recalculated from what was saved.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { accountBalances } from '../lib/analytics/balance'
import { monthPeriod } from '../lib/analytics/periods'
import { resolvePeriod } from '../lib/analytics/reportPeriod'
import { summarize } from '../lib/analytics/summary'
import { reconcileAccount } from '../lib/balances/reconcile'
import { classifyDrafts } from '../lib/csv/duplicates'
import { budgetSummary } from '../lib/budgets/budgets'
import { useFinanceStore } from './financeStore'

const store = () => useFinanceStore.getState()
const october = () => summarize(store().transactions, monthPeriod('2026-10'))
const chequing = { name: 'Chequing', type: 'checking' as const }
const octPeriod = resolvePeriod({ kind: 'month', month: '2026-10' }, '2026-10-31')

beforeEach(async () => {
  await store().deleteAllData()
})

/** Adds the first transaction (creating the account) and returns the account id. */
async function setUp(): Promise<string> {
  await store().addTransaction({ date: '2026-10-01', description: 'ACME PAYROLL', amount: 300000, category: 'auto', account: chequing })
  return store().accounts[0]!.id
}

describe('adding transactions', () => {
  it('creates the account, categorises automatically and recalculates income', async () => {
    await setUp()
    expect(store().accounts).toHaveLength(1)
    expect(store().transactions[0]).toMatchObject({ category: 'Income', categorySource: 'keyword' })
    expect(october()).toMatchObject({ income: 300000, expenses: 0, net: 300000 })
  })

  it('an expense raises expenses and lowers net cash flow, which can go negative', async () => {
    const id = await setUp()
    await store().addTransaction({ date: '2026-10-03', description: 'MAPLE COURT RENT', amount: -350000, category: 'auto', account: { id } })
    expect(store().transactions.find((t) => t.amount === -350000)?.category).toBe('Housing')
    expect(october()).toMatchObject({ income: 300000, expenses: 350000, net: -50000 })
  })

  it('a category you pick is kept as yours', async () => {
    const id = await setUp()
    await store().addTransaction({ date: '2026-10-04', description: 'CORNER STORE', amount: -1200, category: 'Groceries', account: { id } })
    expect(store().transactions.find((t) => t.description === 'CORNER STORE')).toMatchObject({ category: 'Groceries', categorySource: 'manual' })
  })
})

describe('editing transactions', () => {
  it('changing the amount recalculates expenses', async () => {
    const id = await setUp()
    const txId = await store().addTransaction({ date: '2026-10-05', description: 'STARBUCKS', amount: -500, category: 'auto', account: { id } })
    expect(october().expenses).toBe(500)
    await store().updateTransaction(txId, { date: '2026-10-05', description: 'STARBUCKS', amount: -2500, category: 'auto', account: { id } })
    expect(october().expenses).toBe(2500)
  })

  it('moving a transaction to another month moves it out of this month’s totals', async () => {
    const id = await setUp()
    const txId = await store().addTransaction({ date: '2026-10-05', description: 'STARBUCKS', amount: -500, category: 'auto', account: { id } })
    await store().updateTransaction(txId, { date: '2026-11-02', description: 'STARBUCKS', amount: -500, category: 'auto', account: { id } })
    expect(october().expenses).toBe(0)
    expect(summarize(store().transactions, monthPeriod('2026-11')).expenses).toBe(500)
  })

  it('changing the description re-categorises it automatically (unless you chose the category)', async () => {
    const id = await setUp()
    const txId = await store().addTransaction({ date: '2026-10-05', description: 'STARBUCKS', amount: -500, category: 'auto', account: { id } })
    expect(store().transactions.find((t) => t.id === txId)?.category).toBe('Restaurants')
    await store().updateTransaction(txId, { date: '2026-10-05', description: 'LOBLAWS', amount: -500, category: 'auto', account: { id } })
    expect(store().transactions.find((t) => t.id === txId)?.category).toBe('Groceries')
  })

  it('an edited imported transaction is still recognised when the statement is imported again', async () => {
    const id = await setUp()
    const importId = 'imp1'
    await store().commitImport({
      record: { id: importId, fileName: 'oct.csv', importedAt: '2026-11-01T00:00:00Z', accountId: id, transactionCount: 1 },
      account: store().accounts[0]!,
      mapping: null,
      transactions: [{ id: 'bank1', date: '2026-10-08', description: 'STARBUCKS #12', amount: -450, category: 'Other', accountId: id, importId }],
    })
    await store().updateTransaction('bank1', { date: '2026-10-08', description: 'Coffee with Sam', amount: -900, category: 'Restaurants', account: { id } })
    const again = classifyDrafts([{ rowNumber: 2, date: '2026-10-08', description: 'STARBUCKS #12', amount: -450, balance: null }], store().transactions, id, store().deletedTransactions)
    expect(again).toEqual(['duplicate'])
  })
})

describe('deleting transactions', () => {
  it('removes it from every total', async () => {
    const id = await setUp()
    const txId = await store().addTransaction({ date: '2026-10-05', description: 'STARBUCKS', amount: -500, category: 'auto', account: { id } })
    await store().deleteTransaction(txId)
    expect(october()).toMatchObject({ income: 300000, expenses: 0 })
  })

  it('a deleted imported transaction is not brought back by an overlapping import', async () => {
    const id = await setUp()
    await store().commitImport({
      record: { id: 'imp1', fileName: 'oct.csv', importedAt: '2026-11-01T00:00:00Z', accountId: id, transactionCount: 1 },
      account: store().accounts[0]!,
      mapping: null,
      transactions: [{ id: 'bank1', date: '2026-10-08', description: 'STARBUCKS #12', amount: -450, category: 'Other', accountId: id, importId: 'imp1' }],
    })
    await store().deleteTransaction('bank1')
    const again = classifyDrafts([{ rowNumber: 2, date: '2026-10-08', description: 'STARBUCKS #12', amount: -450, balance: null }], store().transactions, id, store().deletedTransactions)
    expect(again).toEqual(['deleted'])
  })
})

describe('refunds, transfers and balances stay accurate as you edit', () => {
  it('a refund lowers expenses and never raises income', async () => {
    const id = await setUp()
    await store().addTransaction({ date: '2026-10-05', description: 'AMAZON.CA ORDER', amount: -6000, category: 'auto', account: { id } })
    await store().addTransaction({ date: '2026-10-09', description: 'REFUND AMAZON.CA', amount: 2000, category: 'auto', account: { id } })
    expect(october()).toMatchObject({ income: 300000, expenses: 4000 })
  })

  it('a transfer to savings is neither income nor spending, but moves both balances', async () => {
    const chk = await setUp()
    await store().addTransaction({ date: '2026-10-10', description: 'TFR TO SAVINGS', amount: -100000, category: 'auto', account: { id: chk } })
    await store().addTransaction({ date: '2026-10-10', description: 'TFR FROM CHEQUING', amount: 100000, category: 'auto', account: { name: 'Savings', type: 'savings' } })
    expect(october()).toMatchObject({ income: 300000, expenses: 0 })
    expect(store().transactions.filter((t) => t.category === 'Transfers')).toHaveLength(2)
  })

  it('opening balance + transactions = expected closing, and the opening is never income', async () => {
    const id = await setUp()
    await store().setBalancePoint(id, '2026-10-01', 120000)
    await store().addTransaction({ date: '2026-10-03', description: 'MAPLE COURT RENT', amount: -150000, category: 'auto', account: { id } })

    const account = store().accounts[0]!
    const check = reconcileAccount(store().transactions, account, octPeriod, store().balancePoints)
    expect(check).toMatchObject({ opening: 120000, income: 300000, expenses: 150000, totalAvailable: 420000, expectedClosing: 270000 })
    expect(october().income).toBe(300000) // unchanged by the opening balance
    expect(accountBalances(store().accounts, store().transactions, store().balancePoints)[0]?.balance).toBe(270000)

    // Edit the rent: the expected closing and the live balance follow immediately.
    const rent = store().transactions.find((t) => t.amount === -150000)!
    await store().updateTransaction(rent.id, { date: '2026-10-03', description: 'MAPLE COURT RENT', amount: -160000, category: 'auto', account: { id } })
    const after = reconcileAccount(store().transactions, account, octPeriod, store().balancePoints)
    expect(after.expectedClosing).toBe(260000)
  })
})

describe('budgets', () => {
  it('are saved, and recalculate as transactions are added, edited and deleted', async () => {
    const id = await setUp()
    await store().setBudget('Restaurants', 10000)
    const restaurants = () => budgetSummary(store().transactions, store().budgets, '2026-10', '2026-10-31').lines.find((l) => l.category === 'Restaurants')!

    expect(restaurants()).toMatchObject({ budget: 10000, spent: 0, remaining: 10000 })
    const txId = await store().addTransaction({ date: '2026-10-05', description: 'STARBUCKS', amount: -4000, category: 'auto', account: { id } })
    expect(restaurants()).toMatchObject({ spent: 4000, remaining: 6000, percentUsed: 40 })
    await store().updateTransaction(txId, { date: '2026-10-05', description: 'STARBUCKS', amount: -12000, category: 'auto', account: { id } })
    expect(restaurants()).toMatchObject({ spent: 12000, remaining: -2000, status: 'over' })
    await store().deleteTransaction(txId)
    expect(restaurants()).toMatchObject({ spent: 0 })

    await store().setBudget('Restaurants', null)
    expect(store().budgets).toEqual([])
  })
})
