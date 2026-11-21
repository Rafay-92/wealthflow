// fake-indexeddb gives Node an in-memory IndexedDB, so storage can be tested without a browser.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { tx } from '../test/factories'
import type { ImportRecord } from '../types/import'
import { WealthFlowDB } from './db'
import { commitImport, deleteAllData, loadAll, removeImport } from './repository'

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
    expect(await loadAll(db)).toEqual({ transactions: [], accounts: [], imports: [], mappings: [] })
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

  it('deletes everything', async () => {
    await commitImport({ record: record('imp1', 1), account, mapping: null, transactions: [tx()] }, db)
    await deleteAllData(db)
    expect(await loadAll(db)).toEqual({ transactions: [], accounts: [], imports: [], mappings: [] })
  })
})
