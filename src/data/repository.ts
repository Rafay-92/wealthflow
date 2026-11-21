import type { Account } from '../types/account'
import type { ImportRecord, SavedMapping } from '../types/import'
import type { Transaction } from '../types/transaction'
import { db as defaultDb, type WealthFlowDB } from './db'

/**
 * Every read and write to the database goes through these functions.
 * The rest of the app never touches `db` directly, which keeps storage
 * details in one place (and makes it easy to swap or test).
 */

export interface StoredData {
  transactions: Transaction[]
  accounts: Account[]
  imports: ImportRecord[]
  mappings: SavedMapping[]
}

export async function loadAll(db: WealthFlowDB = defaultDb): Promise<StoredData> {
  const [transactions, accounts, imports, mappings] = await Promise.all([
    db.transactions.orderBy('date').toArray(),
    db.accounts.toArray(),
    db.imports.orderBy('importedAt').reverse().toArray(),
    db.mappings.toArray(),
  ])
  return { transactions, accounts, imports, mappings }
}

export interface CommitImportInput {
  record: ImportRecord
  transactions: Transaction[]
  /** The account, created or updated (e.g. with a new closing balance). */
  account: Account
  /** Remember this file layout for next time; null to skip. */
  mapping: SavedMapping | null
}

/**
 * Saves an import atomically: inside a database transaction, either every
 * write succeeds or none do. A crash halfway can't leave half an import behind.
 */
export async function commitImport(input: CommitImportInput, db: WealthFlowDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.transactions, db.accounts, db.imports, db.mappings], async () => {
    await db.accounts.put(input.account)
    await db.transactions.bulkAdd(input.transactions)
    await db.imports.add(input.record)
    if (input.mapping) await db.mappings.put(input.mapping)
  })
}

/** Undoes an import: removes its transactions and its history entry. */
export async function removeImport(importId: string, db: WealthFlowDB = defaultDb): Promise<number> {
  return db.transaction('rw', [db.transactions, db.imports], async () => {
    const removed = await db.transactions.where('importId').equals(importId).delete()
    await db.imports.delete(importId)
    return removed
  })
}

/** Permanently erases everything WealthFlow has stored on this device. */
export async function deleteAllData(db: WealthFlowDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.transactions, db.accounts, db.imports, db.mappings], async () => {
    await Promise.all([db.transactions.clear(), db.accounts.clear(), db.imports.clear(), db.mappings.clear()])
  })
}
