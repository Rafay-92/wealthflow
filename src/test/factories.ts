import type { Transaction } from '../types/transaction'

let counter = 0

/**
 * Builds a Transaction for tests with sensible defaults, so each test only
 * spells out the fields it cares about:  tx({ amount: -1250, category: 'Groceries' })
 */
export function tx(overrides: Partial<Transaction> = {}): Transaction {
  counter++
  return {
    id: `t${String(counter).padStart(4, '0')}`,
    date: '2026-10-15',
    description: 'TEST MERCHANT',
    amount: -1000,
    category: 'Other',
    ...overrides,
  }
}
