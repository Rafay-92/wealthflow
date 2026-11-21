import { create } from 'zustand'
import { SAMPLE_ACCOUNTS, SAMPLE_TRANSACTIONS } from '../data/sampleData'
import * as repository from '../data/repository'
import type { Account } from '../types/account'
import type { ImportRecord, SavedMapping } from '../types/import'
import type { Transaction } from '../types/transaction'

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

  load: () => Promise<void>
  commitImport: (input: repository.CommitImportInput) => Promise<void>
  removeImport: (importId: string) => Promise<void>
  deleteAllData: () => Promise<void>
}

export const useFinanceStore = create<FinanceState>()((set, get) => ({
  status: 'loading',
  error: null,
  transactions: [],
  accounts: [],
  imports: [],
  mappings: [],

  load: async () => {
    try {
      const data = await repository.loadAll()
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
}))

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
    transactions: isSample ? SAMPLE_TRANSACTIONS : transactions,
    accounts: isSample ? SAMPLE_ACCOUNTS : accounts,
  }
}
