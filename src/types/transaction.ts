import type { Cents } from '../lib/money'

/**
 * The categories WealthFlow understands. Declared `as const` so TypeScript
 * knows the exact strings, and `Category` below becomes a union type:
 * 'Shopping' | 'Restaurants' | ... — a typo like 'Resturants' won't compile.
 */
export const CATEGORIES = [
  'Shopping',
  'Restaurants',
  'Groceries',
  'Transportation',
  'Entertainment',
  'Subscriptions',
  'Housing',
  'Utilities',
  'Education',
  'Healthcare',
  'Transfers',
  'Income',
  'Other',
] as const

export type Category = (typeof CATEGORIES)[number]

/**
 * A single bank transaction, after import and normalisation.
 * Stages 3 and 4 will extend this (import batch, categorization source, etc.).
 */
export interface Transaction {
  id: string
  /** Calendar date as 'YYYY-MM-DD'. Stored as text to avoid timezone shifts. */
  date: string
  description: string
  /** Signed integer cents: positive = money in, negative = money out. */
  amount: Cents
  category: Category
  /** Which account this came from, used to detect transfers between accounts. */
  accountId?: string
}
