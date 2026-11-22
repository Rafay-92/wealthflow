import type { Account } from '../types/account'
import type { ImportRecord, SavedMapping } from '../types/import'
import type { SubscriptionDecision, SubscriptionStatus } from '../lib/recurring/subscriptions'
import type { CategoryRule, DeletedTransaction, Transaction } from '../types/transaction'
import type { Budget } from '../types/budget'
import { importFingerprint } from '../lib/csv/duplicates'
import type { WealthEntry, WealthItem } from '../types/wealth'
import type { BalancePoint } from '../types/balance'
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
  balancePoints: BalancePoint[]
  deletedTransactions: DeletedTransaction[]
  budgets: Budget[]
}

export async function loadAll(db: WealthFlowDB = defaultDb): Promise<StoredData> {
  const [transactions, accounts, imports, mappings, rules, subscriptionDecisions, wealthItems, wealthEntries, balancePoints, deletedTransactions, budgets] = await Promise.all([
    db.transactions.orderBy('date').toArray(),
    db.accounts.toArray(),
    db.imports.orderBy('importedAt').reverse().toArray(),
    db.mappings.toArray(),
    db.rules.toArray(),
    db.subscriptionDecisions.toArray(),
    db.wealthItems.toArray(),
    db.wealthEntries.orderBy('date').toArray(),
    db.balancePoints.toArray(),
    db.deletedTransactions.toArray(),
    db.budgets.toArray(),
  ])
  return { transactions, accounts, imports, mappings, rules, subscriptionDecisions, wealthItems, wealthEntries, balancePoints, deletedTransactions, budgets }
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

/** Saves a balance you entered for the start of a date; null removes it. */
export async function saveBalancePoint(accountId: string, date: string, amount: number | null, db: WealthFlowDB = defaultDb): Promise<void> {
  const id = `${accountId}:${date}`
  if (amount === null) await db.balancePoints.delete(id)
  else await db.balancePoints.put({ id, accountId, date, amount, updatedAt: new Date().toISOString() })
}

/** Saves a new or edited transaction, creating its account first if it's new (atomically). */
export async function saveTransaction(transaction: Transaction, newAccount: Account | null, db: WealthFlowDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.transactions, db.accounts], async () => {
    if (newAccount) await db.accounts.add(newAccount)
    await db.transactions.put(transaction)
  })
}

/**
 * Deletes transactions. For imported ones, a small record of the bank's
 * original row is kept, so importing an overlapping statement won't bring them back.
 */
export async function deleteTransactions(ids: readonly string[], now: string = new Date().toISOString(), db: WealthFlowDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.transactions, db.deletedTransactions], async () => {
    const found = (await db.transactions.bulkGet([...ids])).filter((t): t is Transaction => t !== undefined)
    const remembered: DeletedTransaction[] = found
      .filter((t) => t.importId && t.accountId)
      .map((t) => ({ id: t.id, accountId: t.accountId!, importId: t.importId!, importKey: importFingerprint(t), deletedAt: now }))
    if (remembered.length > 0) await db.deletedTransactions.bulkPut(remembered)
    await db.transactions.bulkDelete(found.map((t) => t.id))
  })
}

/** Saves a monthly budget, or removes it when `amount` is null. */
export async function saveBudget(category: Budget['category'], amount: number | null, db: WealthFlowDB = defaultDb): Promise<void> {
  if (amount === null) await db.budgets.delete(category)
  else await db.budgets.put({ category, amount, updatedAt: new Date().toISOString() })
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

/** Undoes an import: removes its transactions, its history entry and any memory of rows you deleted from it. */
export async function removeImport(importId: string, db: WealthFlowDB = defaultDb): Promise<number> {
  return db.transaction('rw', [db.transactions, db.imports, db.deletedTransactions], async () => {
    const removed = await db.transactions.where('importId').equals(importId).delete()
    await db.deletedTransactions.where('importId').equals(importId).delete()
    await db.imports.delete(importId)
    return removed
  })
}

/**
 * Replaces ALL stored data with a restored backup, atomically: if any write
 * fails, the database is left exactly as it was before.
 */
export async function replaceAllData(data: StoredData, db: WealthFlowDB = defaultDb): Promise<void> {
  const tables = [db.transactions, db.accounts, db.imports, db.mappings, db.rules, db.subscriptionDecisions, db.wealthItems, db.wealthEntries, db.balancePoints, db.deletedTransactions, db.budgets]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await db.transactions.bulkAdd(data.transactions)
    await db.accounts.bulkAdd(data.accounts)
    await db.imports.bulkAdd(data.imports)
    await db.mappings.bulkAdd(data.mappings)
    await db.rules.bulkAdd(data.rules)
    await db.subscriptionDecisions.bulkAdd(data.subscriptionDecisions)
    await db.wealthItems.bulkAdd(data.wealthItems)
    await db.wealthEntries.bulkAdd(data.wealthEntries)
    await db.balancePoints.bulkAdd(data.balancePoints)
    await db.deletedTransactions.bulkAdd(data.deletedTransactions)
    await db.budgets.bulkAdd(data.budgets)
  })
}

/** Permanently erases everything WealthFlow has stored on this device. */
export async function deleteAllData(db: WealthFlowDB = defaultDb): Promise<void> {
  const tables = [db.transactions, db.accounts, db.imports, db.mappings, db.rules, db.subscriptionDecisions, db.wealthItems, db.wealthEntries, db.balancePoints, db.deletedTransactions, db.budgets]
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
  })
}
