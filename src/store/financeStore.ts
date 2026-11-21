import { create } from 'zustand'
import { SAMPLE_ACCOUNTS, SAMPLE_TRANSACTIONS } from '../data/sampleData'
import * as repository from '../data/repository'
import { categorizeAll } from '../lib/categorize/categorize'
import type { Account } from '../types/account'
import type { ImportRecord, SavedMapping } from '../types/import'
import type { SubscriptionDecision, SubscriptionStatus } from '../lib/recurring/subscriptions'
import type { Category, CategoryRule, Transaction } from '../types/transaction'
import type { WealthEntry, WealthItem, WealthType } from '../types/wealth'
import type { ISODate } from '../lib/dates'
import type { Cents } from '../lib/money'

/**
 * The app's shared data, held in a Zustand store.
 *
 * A store is one place any component can read from:
 *   const transactions = useFinanceStore((s) => s.transactions)
 * The function passed in is a "selector": the component re-renders only
 * when the value it selects changes.
 *
 * The store mirrors what's in IndexedDB. Every action writes to the
 * database first, then reloads, so the screen always matches what's saved.
 */
interface FinanceState {
  status: 'loading' | 'ready' | 'error'
  error: string | null
  transactions: Transaction[]
  accounts: Account[]
  imports: ImportRecord[]
  mappings: SavedMapping[]
  rules: CategoryRule[]
  subscriptionDecisions: SubscriptionDecision[]
  wealthItems: WealthItem[]
  wealthEntries: WealthEntry[]

  load: () => Promise<void>
  commitImport: (input: repository.CommitImportInput) => Promise<void>
  removeImport: (importId: string) => Promise<void>
  deleteAllData: () => Promise<void>
  /** Sets a category by hand. Automatic categorisation will never change it. */
  setCategory: (transactionId: string, category: Category) => Promise<void>
  /** Hands a transaction back to automatic categorisation. */
  resetCategory: (transactionId: string) => Promise<void>
  addRule: (keyword: string, category: Category) => Promise<void>
  deleteRule: (ruleId: string) => Promise<void>
  /** Confirms or dismisses a detected subscription; null clears the decision. */
  setSubscriptionStatus: (key: string, status: SubscriptionStatus | null) => Promise<void>
  addWealthItem: (input: { name: string; type: WealthType; value: Cents; date: ISODate; sourceAccountId?: string }) => Promise<void>
  /** Records values for several items on one date (replacing any already recorded that day). */
  updateWealthValues: (date: ISODate, values: { itemId: string; value: Cents }[]) => Promise<void>
  deleteWealthItem: (itemId: string) => Promise<void>
}

/** Re-categorises and returns only the transactions whose category changed. */
function changedAfterCategorizing(transactions: Transaction[], rules: CategoryRule[], accounts: Account[]): Transaction[] {
  const result = categorizeAll(transactions, rules, accounts)
  return result.filter((tx, i) => tx !== transactions[i])
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  status: 'loading',
  error: null,
  transactions: [],
  accounts: [],
  imports: [],
  mappings: [],
  rules: [],
  subscriptionDecisions: [],
  wealthItems: [],
  wealthEntries: [],

  load: async () => {
    try {
      const data = await repository.loadAll()
      // Bring every transaction up to date with the current rules. This also
      // categorises freshly imported transactions and finds transfer pairs
      // that span two imports. Only real changes are written back.
      const changed = changedAfterCategorizing(data.transactions, data.rules, data.accounts)
      if (changed.length > 0) {
        await repository.saveTransactions(changed)
        const byId = new Map(changed.map((t) => [t.id, t]))
        data.transactions = data.transactions.map((t) => byId.get(t.id) ?? t)
      }
      set({ ...data, status: 'ready', error: null })
    } catch (error) {
      console.error('[WealthFlow] Failed to load data', error)
      set({ status: 'error', error: 'Your saved data couldn’t be loaded. Your browser may be blocking site storage.' })
    }
  },

  commitImport: async (input) => {
    await repository.commitImport(input)
    await get().load()
  },

  removeImport: async (importId) => {
    await repository.removeImport(importId)
    await get().load()
  },

  deleteAllData: async () => {
    await repository.deleteAllData()
    await get().load()
  },

  setCategory: async (transactionId, category) => {
    const tx = get().transactions.find((t) => t.id === transactionId)
    if (!tx) return
    await repository.saveTransactions([{ ...tx, category, categorySource: 'manual', categoryNote: 'Set by you' }])
    await get().load()
  },

  resetCategory: async (transactionId) => {
    const tx = get().transactions.find((t) => t.id === transactionId)
    if (!tx) return
    // Clearing the source lets the next load() categorise it automatically again.
    await repository.saveTransactions([{ ...tx, categorySource: undefined, categoryNote: undefined }])
    await get().load()
  },

  addRule: async (keyword, category) => {
    const { transactions, rules, accounts } = get()
    const rule: CategoryRule = { id: crypto.randomUUID(), keyword: keyword.trim(), category, createdAt: new Date().toISOString() }
    const changed = changedAfterCategorizing(transactions, [...rules, rule], accounts)
    await repository.saveRuleChange({ add: rule, transactions: changed })
    await get().load()
  },

  addWealthItem: async ({ name, type, value, date, sourceAccountId }) => {
    const item: WealthItem = { id: crypto.randomUUID(), name: name.trim(), type, sourceAccountId, createdAt: new Date().toISOString() }
    await repository.saveWealth([item], [{ id: `${item.id}:${date}`, itemId: item.id, date, value }])
    await get().load()
  },

  updateWealthValues: async (date, values) => {
    await repository.saveWealth([], values.map(({ itemId, value }) => ({ id: `${itemId}:${date}`, itemId, date, value })))
    await get().load()
  },

  deleteWealthItem: async (itemId) => {
    await repository.deleteWealthItem(itemId)
    await get().load()
  },

  setSubscriptionStatus: async (key, status) => {
    await repository.saveSubscriptionDecision(key, status)
    await get().load()
  },

  deleteRule: async (ruleId) => {
    const { transactions, rules, accounts } = get()
    const changed = changedAfterCategorizing(transactions, rules.filter((r) => r.id !== ruleId), accounts)
    await repository.saveRuleChange({ removeId: ruleId, transactions: changed })
    await get().load()
  },
}))

/** Sample data runs through the same categoriser, so it gets explanations too. */
const CATEGORIZED_SAMPLE = categorizeAll(SAMPLE_TRANSACTIONS, [], SAMPLE_ACCOUNTS)

/**
 * The data pages should display: your imported data, or the fictional
 * sample data while you haven't imported anything. Sample data is never
 * saved and never mixed with real data.
 */
export function useDisplayData() {
  const status = useFinanceStore((s) => s.status)
  const transactions = useFinanceStore((s) => s.transactions)
  const accounts = useFinanceStore((s) => s.accounts)

  const isSample = status === 'ready' && transactions.length === 0
  return {
    status,
    isSample,
    transactions: isSample ? CATEGORIZED_SAMPLE : transactions,
    accounts: isSample ? SAMPLE_ACCOUNTS : accounts,
  }
}
