import { create } from 'zustand'
import { SAMPLE_ACCOUNTS, SAMPLE_TRANSACTIONS } from '../data/sampleData'
import type { Account } from '../types/account'
import type { Transaction } from '../types/transaction'

/**
 * The app's shared data, held in a Zustand store.
 *
 * A store is a single place that any component can read from:
 *   const transactions = useFinanceStore((s) => s.transactions)
 * The function you pass is a "selector": the component re-renders only when
 * the value it selects changes.
 *
 * Stage 2: pre-filled with fictional sample data.
 * Stage 3: CSV import adds real data, saved to IndexedDB on this device.
 */
export type DataSource = 'sample' | 'imported'

interface FinanceState {
  transactions: Transaction[]
  accounts: Account[]
  dataSource: DataSource
}

export const useFinanceStore = create<FinanceState>()(() => ({
  transactions: SAMPLE_TRANSACTIONS,
  accounts: SAMPLE_ACCOUNTS,
  dataSource: 'sample',
}))
