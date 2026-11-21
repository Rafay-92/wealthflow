// fake-indexeddb gives Node an in-memory IndexedDB, so storage can be tested without a browser.
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { tx } from '../test/factories'
import type { ImportRecord } from '../types/import'
import { WealthFlowDB } from './db'
import { commitImport, deleteAllData, loadAll, removeImport, saveRuleChange } from './repository'

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
    expect(await loadAll(db)).toEqual({ transactions: [], accounts: [], imports: [], mappings: [], rules: [], subscriptionDecisions: [], wealthItems: [], wealthEntries: [] })
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
    expect(upgraded.verno).toBe(4)
  })

  it('deletes everything', async () => {
    await commitImport({ record: record('imp1', 1), account, mapping: null, transactions: [tx()] }, db)
    await saveRuleChange({ add: { id: 'r', keyword: 'X', category: 'Other', createdAt: '' }, transactions: [] }, db)
    await deleteAllData(db)
    expect(await loadAll(db)).toEqual({ transactions: [], accounts: [], imports: [], mappings: [], rules: [], subscriptionDecisions: [], wealthItems: [], wealthEntries: [] })
  })
})
