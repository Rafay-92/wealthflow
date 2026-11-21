import type { Account } from '../types/account'
import type { ImportRecord, SavedMapping } from '../types/import'
import type { SubscriptionDecision, SubscriptionStatus } from '../lib/recurring/subscriptions'
import type { CategoryRule, Transaction } from '../types/transaction'
import type { WealthEntry, WealthItem } from '../types/wealth'
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
  rules: CategoryRule[]
  subscriptionDecisions: SubscriptionDecision[]
  wealthItems: WealthItem[]
  wealthEntries: WealthEntry[]
}

export async function loadAll(db: WealthFlowDB = defaultDb): Promise<StoredData> {
  const [transactions, accounts, imports, mappings, rules, subscriptionDecisions, wealthItems, wealthEntries] = await Promise.all([
    db.transactions.orderBy('date').toArray(),
    db.accounts.toArray(),
    db.imports.orderBy('importedAt').reverse().toArray(),
    db.mappings.toArray(),
    db.rules.toArray(),
    db.subscriptionDecisions.toArray(),
    db.wealthItems.toArray(),
    db.wealthEntries.orderBy('date').toArray(),
  ])
  return { transactions, accounts, imports, mappings, rules, subscriptionDecisions, wealthItems, wealthEntries }
}

/** Saves a confirm/dismiss decision, or clears it when `status` is null. */
export async function saveSubscriptionDecision(key: string, status: SubscriptionStatus | null, db: WealthFlowDB = defaultDb): Promise<void> {
  if (status === null) await db.subscriptionDecisions.delete(key)
  else await db.subscriptionDecisions.put({ key, status, decidedAt: new Date().toISOString() })
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

/** Saves changed transactions (e.g. new categories). */
export async function saveTransactions(transactions: Transaction[], db: WealthFlowDB = defaultDb): Promise<void> {
  if (transactions.length > 0) await db.transactions.bulkPut(transactions)
}

/** Adds or removes a rule together with the re-categorised transactions it affects, atomically. */
export async function saveRuleChange(
  change: { add?: CategoryRule; removeId?: string; transactions: Transaction[] },
  db: WealthFlowDB = defaultDb,
): Promise<void> {
  await db.transaction('rw', [db.rules, db.transactions], async () => {
    if (change.add) await db.rules.put(change.add)
    if (change.removeId) await db.rules.delete(change.removeId)
    await saveTransactions(change.transactions, db)
  })
}

/** Saves a new or edited wealth item, optionally with values (atomically). */
export async function saveWealth(items: WealthItem[], entries: WealthEntry[], db: WealthFlowDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.wealthItems, db.wealthEntries], async () => {
    if (items.length > 0) await db.wealthItems.bulkPut(items)
    if (entries.length > 0) await db.wealthEntries.bulkPut(entries)
  })
}

/** Deletes a wealth item and its whole value history. */
export async function deleteWealthItem(itemId: string, db: WealthFlowDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.wealthItems, db.wealthEntries], async () => {
    await db.wealthEntries.where('itemId').equals(itemId).delete()
    await db.wealthItems.delete(itemId)
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
  const tables = [db.transactions, db.accounts, db.imports, db.mappings, db.rules, db.subscriptionDecisions, db.wealthItems, db.wealthEntries]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
  })
}
