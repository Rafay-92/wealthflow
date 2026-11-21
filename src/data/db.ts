import Dexie, { type EntityTable } from 'dexie'
import type { Account } from '../types/account'
import type { ImportRecord, SavedMapping } from '../types/import'
import type { SubscriptionDecision } from '../lib/recurring/subscriptions'
import type { CategoryRule, Transaction } from '../types/transaction'
import type { WealthEntry, WealthItem } from '../types/wealth'

/**
 * The on-device database (IndexedDB, via the Dexie library).
 *
 * IndexedDB is built into every browser. Data stored here never leaves this
 * computer, survives page reloads, and is separate per website. Dexie wraps
 * IndexedDB's awkward API in a simple, promise-based one.
 *
 * The strings in `stores()` list each table's primary key first, then the
 * fields we want to search by (indexes). Other fields are stored but not indexed.
 *
 * To change the schema later, add `this.version(2).stores({...})` below:
 * never edit version 1, because users' browsers already have it.
 */
export class WealthFlowDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  accounts!: EntityTable<Account, 'id'>
  imports!: EntityTable<ImportRecord, 'id'>
  mappings!: EntityTable<SavedMapping, 'signature'>
  rules!: EntityTable<CategoryRule, 'id'>
  subscriptionDecisions!: EntityTable<SubscriptionDecision, 'key'>
  wealthItems!: EntityTable<WealthItem, 'id'>
  wealthEntries!: EntityTable<WealthEntry, 'id'>

  constructor(name = 'wealthflow') {
    super(name)
    this.version(1).stores({
      transactions: 'id, date, accountId, importId, category',
      accounts: 'id',
      imports: 'id, importedAt',
      mappings: 'signature',
    })
    // Stage 4: categorisation rules. Dexie upgrades existing browsers from
    // version 1 automatically, keeping all their data.
    this.version(2).stores({
      rules: 'id',
    })
    // Stage 7: your confirm/dismiss decisions on detected subscriptions.
    this.version(3).stores({
      subscriptionDecisions: 'key',
    })
    // Stage 8: assets and liabilities you track, and their values over time.
    this.version(4).stores({
      wealthItems: 'id',
      wealthEntries: 'id, itemId, date',
    })
  }
}

export const db = new WealthFlowDB()
