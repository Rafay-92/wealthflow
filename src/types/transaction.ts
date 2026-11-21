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
 * How a transaction got its category, in priority order:
 * manual   - you chose it; automatic categorization never changes it
 * rule     - one of your merchant rules matched
 * transfer - detected as money moving between your own accounts
 * keyword  - a built-in merchant keyword matched
 * default  - nothing matched; worth reviewing
 */
export type CategorySource = 'manual' | 'rule' | 'transfer' | 'keyword' | 'default'

/** A single bank transaction, after import and normalisation. */
export interface Transaction {
  id: string
  /** Calendar date as 'YYYY-MM-DD'. Stored as text to avoid timezone shifts. */
  date: string
  description: string
  /** Signed integer cents: positive = money in, negative = money out. */
  amount: Cents
  category: Category
  /** Missing on transactions that haven't been categorized yet. */
  categorySource?: CategorySource
  /** A short, human explanation of why it got this category. */
  categoryNote?: string
  /** Which account this came from, used to detect transfers between accounts. */
  accountId?: string
  /** The import batch it arrived in, so a whole import can be undone. */
  importId?: string
}

/** "Always put transactions containing <keyword> in <category>." */
export interface CategoryRule {
  id: string
  /** As the user typed it, e.g. "Starbucks". Matched case-insensitively on whole words. */
  keyword: string
  category: Category
  createdAt: string
}
