import type { Cents } from '../lib/money'
import type { Category } from './transaction'

/** A monthly spending limit for one category. The same amount applies every month. */
export interface Budget {
  category: Category
  /** Positive cents per month. */
  amount: Cents
  updatedAt: string
}
