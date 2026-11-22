// fake-indexeddb gives Node an in-memory IndexedDB, so storage can be tested without a browser.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { tx } from '../test/factories'
import type { ImportRecord } from '../types/import'
import { WealthFlowDB } from './db'
import { commitImport, deleteAllData, deleteTransactions, loadAll, removeImport, replaceAllData, saveBalancePoint, saveRuleChange, saveTransaction } from './repository'

let db: WealthFlowDB
let n = 0

beforeEach(async () => {
  db = new WealthFlowDB(`test-${++n}`) // a fresh database per test
})

const record = (id: string, count: number): ImportRecord => ({
  id,
  fileName: `${id}.csv`,
  importedAt: `2026-11-21T10:0${n}:00Z`,
  accountId: 'chk',
  transactionCount: count,
})

const account = { id: 'chk', name: 'Checking', type: 'checking' as const }

describe('repository', () => {
  it('starts empty', async () => {
    expect(await loadAll(db)).toEqual({ transactions: [], accounts: [], imports: [], mappings: [], rules: [], subscriptionDecisions: [], wealthItems: [], wealthEntries: [], balancePoints: [], statementBalances: [], deletedTransactions: [], budgets: [] })
  })

  it('saves an import and loads it back, sorted by date', async () => {
    await commitImport(
      {
        record: record('imp1', 2),
        account,
        mapping: null,
        transactions: [
          tx({ id: 'b', date: '2026-11-05', importId: 'imp1' }),
          tx({ id: 'a', date: '2026-11-01', importId: 'imp1' }),
        ],
      },
      db,
    )
    const data = await loadAll(db)
    expect(data.transactions.map((t) => t.id)).toEqual(['a', 'b'])
    expect(data.accounts).toEqual([account])
    expect(data.imports).toHaveLength(1)
  })

  it('is all-or-nothing: a failed import leaves no partial data', async () => {
    const clash = tx({ id: 'same' })
    await expect(
      commitImport({ record: record('imp1', 2), account, mapping: null, transactions: [clash, { ...clash }] }, db),
    ).rejects.toThrow()
    const data = await loadAll(db)
    expect(data.transactions).toEqual([])
    expect(data.imports).toEqual([])
    expect(data.accounts).toEqual([])
  })

  it('undoes a single import without touching others', async () => {
    await commitImport({ record: record('imp1', 1), account, mapping: null, transactions: [tx({ importId: 'imp1' })] }, db)
    await commitImport({ record: record('imp2', 1), account, mapping: null, transactions: [tx({ importId: 'imp2' })] }, db)

    expect(await removeImport('imp1', db)).toBe(1)
    const data = await loadAll(db)
    expect(data.transactions.map((t) => t.importId)).toEqual(['imp2'])
    expect(data.imports.map((i) => i.id)).toEqual(['imp2'])
  })

  it('saves a rule together with the transactions it re-categorised', async () => {
    const t = tx({ id: 'coffee', description: 'STARBUCKS' })
    await commitImport({ record: record('imp1', 1), account, mapping: null, transactions: [t] }, db)
    const newRule = { id: 'r1', keyword: 'Starbucks', category: 'Restaurants' as const, createdAt: '2026-11-21T00:00:00Z' }
    await saveRuleChange({ add: newRule, transactions: [{ ...t, category: 'Restaurants', categorySource: 'rule' }] }, db)

    let data = await loadAll(db)
    expect(data.rules).toEqual([newRule])
    expect(data.transactions[0]!.category).toBe('Restaurants')

    await saveRuleChange({ removeId: 'r1', transactions: [] }, db)
    data = await loadAll(db)
    expect(data.rules).toEqual([])
  })

  it('upgrades a Stage 3 (version 1) database without losing data', async () => {
    const name = `upgrade-${++n}`
    // Recreate the old schema exactly as Stage 3 shipped it.
    const old = new Dexie(name)
    old.version(1).stores({
      transactions: 'id, date, accountId, importId, category',
      accounts: 'id',
      imports: 'id, importedAt',
      mappings: 'signature',
    })
    await old.table('transactions').add(tx({ id: 'kept' }))
    old.close()

    const upgraded = new WealthFlowDB(name)
    const data = await loadAll(upgraded)
    expect(data.transactions.map((t) => t.id)).toEqual(['kept'])
    expect(data.rules).toEqual([])
    expect(upgraded.verno).toBe(8)
  })

  it('replaces everything with a backup, or nothing at all if the backup is bad', async () => {
    await commitImport({ record: record('imp1', 1), account, mapping: null, transactions: [tx({ id: 'old' })] }, db)
    const restored = { ...(await loadAll(db)), transactions: [tx({ id: 'new1' }), tx({ id: 'new2' })], imports: [] }
    await replaceAllData(restored, db)
    expect((await loadAll(db)).transactions.map((t) => t.id).sort()).toEqual(['new1', 'new2'])

    // A duplicate id makes bulkAdd fail halfway: the previous data must survive untouched.
    const bad = { ...restored, transactions: [tx({ id: 'x' }), tx({ id: 'x' })] }
    await expect(replaceAllData(bad, db)).rejects.toThrow()
    expect((await loadAll(db)).transactions.map((t) => t.id).sort()).toEqual(['new1', 'new2'])
  })

  it('saves balances you enter apart from transactions, and removes them when cleared', async () => {
    await saveBalancePoint('chk', '2026-11-22', 500000, db)
    let data = await loadAll(db)
    expect(data.balancePoints).toMatchObject([{ id: 'chk:2026-11-22', accountId: 'chk', date: '2026-11-22', amount: 500000 }])
    expect(data.transactions).toEqual([]) // a balance is never stored as a transaction
    await saveBalancePoint('chk', '2026-11-22', null, db)
    data = await loadAll(db)
    expect(data.balancePoints).toEqual([])
  })

  it('converts monthly balances saved by an older version when upgrading', async () => {
    const name = `upgrade-balances-${n}`
    const v6 = new Dexie(name)
    v6.version(6).stores({ transactions: 'id, date, accountId, importId, category', monthlyBalances: 'id, accountId, month' })
    await v6.open()
    await v6.table('transactions').add({ id: 't1', date: '2026-11-20', description: 'X', amount: -100, category: 'Other' })
    await v6.table('monthlyBalances').bulkAdd([
      { id: 'chk:2026-10', accountId: 'chk', month: '2026-10', opening: 100000, actualClosing: 150000, updatedAt: '' },
      { id: 'chk:2026-11', accountId: 'chk', month: '2026-11', opening: null, actualClosing: 160000, updatedAt: '' },
    ])
    v6.close()
    const upgraded = new WealthFlowDB(name)
    const data = await loadAll(upgraded)
    expect(data.balancePoints.map((p) => [p.date, p.amount]).sort()).toEqual([
      ['2026-10-01', 100000],
      ['2026-11-01', 150000], // October's closing = the start of Nov 1
      ['2026-11-21', 160000], // November was unfinished: closing as of the last day with data (Nov 20)
    ])
    upgraded.close()
  })

  it('deletes everything', async () => {
    await commitImport({ record: record('imp1', 1), account, mapping: null, transactions: [tx()] }, db)
    await saveRuleChange({ add: { id: 'r', keyword: 'X', category: 'Other', createdAt: '' }, transactions: [] }, db)
    await deleteAllData(db)
    expect(await loadAll(db)).toEqual({ transactions: [], accounts: [], imports: [], mappings: [], rules: [], subscriptionDecisions: [], wealthItems: [], wealthEntries: [], balancePoints: [], statementBalances: [], deletedTransactions: [], budgets: [] })
  })
})

describe('editing and deleting transactions', () => {
  it('saves a hand-added transaction together with its new account', async () => {
    await saveTransaction(tx({ id: 'cash1', accountId: 'cash' }), { id: 'cash', name: 'Cash', type: 'checking' }, db)
    const data = await loadAll(db)
    expect(data.accounts.map((a) => a.id)).toEqual(['cash'])
    expect(data.transactions.map((t) => t.id)).toEqual(['cash1'])
  })

  it('remembers deleted imported transactions, and forgets them when the import is undone', async () => {
    await commitImport({ record: record('imp1', 2), account, mapping: null, transactions: [tx({ id: 'a', accountId: 'chk', importId: 'imp1' }), tx({ id: 'b', accountId: 'chk', importId: 'imp1' })] }, db)
    await saveTransaction(tx({ id: 'manual', accountId: 'chk' }), null, db)
    await deleteTransactions(['a', 'manual'], '2026-11-21T00:00:00Z', db)

    let data = await loadAll(db)
    expect(data.transactions.map((t) => t.id)).toEqual(['b'])
    // Only the imported one needs remembering: a hand-added one can't come back in a statement.
    expect(data.deletedTransactions.map((d) => d.id)).toEqual(['a'])

    await removeImport('imp1', db)
    data = await loadAll(db)
    expect(data.deletedTransactions).toEqual([])
  })
})
