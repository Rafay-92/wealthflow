import type { ISODate } from '../lib/dates'
import type { Cents } from '../lib/money'

export type AccountType = 'checking' | 'savings' | 'credit'

/** A bank account that transactions belong to. */
export interface Account {
  id: string
  name: string
  type: AccountType
  /**
   * Balance as reported by the bank, if the statement included one.
   * Optional on purpose: many CSV exports have no balance column,
   * and we never invent a balance by guessing an opening amount.
   */
  balance?: Cents
  /** The date the balance was reported. */
  balanceAsOf?: ISODate
}
