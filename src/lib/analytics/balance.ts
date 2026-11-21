import type { Account } from '../../types/account'
import type { ISODate } from '../dates'
import { sumCents, type Cents } from '../money'

export interface BalanceTotal {
  total: Cents
  /** How many accounts reported a balance. */
  accountCount: number
  /** The oldest "as of" date among them: the total is only as fresh as its stalest part. */
  asOf: ISODate | null
}

/**
 * Adds up the balances the bank reported.
 * Returns null when no account has a balance, so the UI can say
 * "not provided" rather than showing a misleading $0.00.
 */
export function totalBalance(accounts: readonly Account[]): BalanceTotal | null {
  const withBalance = accounts.filter((a) => a.balance !== undefined)
  if (withBalance.length === 0) return null

  const dates = withBalance.map((a) => a.balanceAsOf).filter((d): d is ISODate => d !== undefined)
  return {
    total: sumCents(withBalance.map((a) => a.balance as Cents)),
    accountCount: withBalance.length,
    asOf: dates.length > 0 ? dates.sort()[0]! : null,
  }
}
