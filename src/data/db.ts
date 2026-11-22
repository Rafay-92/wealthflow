import Dexie, { type EntityTable } from 'dexie'
import type { Account } from '../types/account'
import type { ImportRecord, SavedMapping } from '../types/import'
import type { SubscriptionDecision } from '../lib/recurring/subscriptions'
import type { CategoryRule, DeletedTransaction, Transaction } from '../types/transaction'
import type { Budget } from '../types/budget'
import type { WealthEntry, WealthItem } from '../types/wealth'
import { pointsFromMonthlyBalances, type BalancePoint, type MonthlyBalance } from '../types/balance'
import type { StatementBalance } from '../lib/balances/checkpoints'

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
  balancePoints!: EntityTable<BalancePoint, 'id'>
  statementBalances!: EntityTable<StatementBalance, 'id'>
  deletedTransactions!: EntityTable<DeletedTransaction, 'id'>
  budgets!: EntityTable<Budget, 'category'>

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
    // Opening / actual closing balances per bank account per month. Kept apart
    // from transactions on purpose: they must never count as income.
    this.version(5).stores({
      monthlyBalances: 'id, accountId, month',
    })
    // Live editing: a record of imported transactions you deleted (so a
    // re-import doesn't bring them back), and monthly budgets per category.
    this.version(6).stores({
      deletedTransactions: 'id, importId',
      budgets: 'category',
    })
    // Balances you enter are kept per DATE (not per month), so a custom period
    // like Nov 22 – Dec 22 can have its own opening balance. Monthly balances
    // saved by version 5–6 are converted, then the old table is removed.
    this.version(7)
      .stores({ balancePoints: 'id, accountId, date', monthlyBalances: null })
      .upgrade(async (tx) => {
        const old = (await tx.table('monthlyBalances').toArray()) as MonthlyBalance[]
        if (old.length === 0) return
        const latest = (await tx.table('transactions').orderBy('date').last()) as { date: string } | undefined
        await tx.table('balancePoints').bulkPut(pointsFromMonthlyBalances(old, latest?.date ?? null))
      })
    // Running balances from statements, as daily checkpoints for reconciliation.
    // A new, empty table: nothing existing is changed.
    this.version(8).stores({
      statementBalances: 'id, accountId, date, importId',
    })
  }
}

export const db = new WealthFlowDB()
