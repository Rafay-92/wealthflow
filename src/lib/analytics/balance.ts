import type { Account } from '../../types/account'
import type { BalancePoint } from '../../types/balance'
import type { StatementBalance } from '../balances/checkpoints'
import type { Transaction } from '../../types/transaction'
import { addDays, type ISODate } from '../dates'
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

export interface AccountBalance {
  accountId: string
  name: string
  /** The balance now: the anchor plus every transaction after it. */
  balance: Cents
  /** The date of the latest information included. */
  asOf: ISODate
  /** What the balance is built on: the bank's reported balance, or a balance you entered. */
  basis: 'bank' | 'user'
  anchorBalance: Cents
  /** First date of the transactions added on top of the anchor. */
  countFrom: ISODate
  /** Sum and number of those transactions (e.g. ones you added by hand after the statement). */
  since: Cents
  sinceCount: number
}

/**
 * Each account's balance, kept up to date as transactions change.
 *
 * A balance needs a known starting point (an "anchor"): either the balance the
 * bank reported on a date, or a balance you entered for a date. The
 * most recent anchor wins, and every transaction dated after it is added on top.
 * Transactions on or before the anchor are already inside the bank's figure, so
 * they're not added again. Accounts with no anchor are left out, never guessed.
 */
export function accountBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
  points: readonly BalancePoint[] = [],
  checkpoints: readonly StatementBalance[] = [],
): AccountBalance[] {
  const out: AccountBalance[] = []
  for (const account of accounts) {
    const anchors: { countFrom: ISODate; balance: Cents; basis: AccountBalance['basis'] }[] = []
    if (account.balance !== undefined && account.balanceAsOf) {
      anchors.push({ countFrom: addDays(account.balanceAsOf, 1), balance: account.balance, basis: 'bank' })
    }
    for (const c of checkpoints) if (c.accountId === account.id) anchors.push({ countFrom: c.date, balance: c.amount, basis: 'bank' })
    for (const p of points) if (p.accountId === account.id) anchors.push({ countFrom: p.date, balance: p.amount, basis: 'user' })
    // Latest anchor wins. On the same date, the balance you typed wins,
    // just as it does in the Balance check.
    const anchor = anchors.sort((a, b) => b.countFrom.localeCompare(a.countFrom) || (a.basis === 'user' ? -1 : 1))[0]
    if (!anchor) continue

    const after = transactions.filter((t) => t.accountId === account.id && t.date >= anchor.countFrom)
    const since = sumCents(after.map((t) => t.amount))
    const lastDate = after.reduce<ISODate>((max, t) => (t.date > max ? t.date : max), addDays(anchor.countFrom, -1))
    out.push({
      accountId: account.id,
      name: account.name,
      balance: anchor.balance + since,
      asOf: lastDate,
      basis: anchor.basis,
      anchorBalance: anchor.balance,
      countFrom: anchor.countFrom,
      since,
      sinceCount: after.length,
    })
  }
  return out
}

/** Adds up live account balances; null when no account has a known balance. */
export function sumBalances(balances: readonly AccountBalance[]): BalanceTotal | null {
  if (balances.length === 0) return null
  return {
    total: sumCents(balances.map((b) => b.balance)),
    accountCount: balances.length,
    asOf: balances.map((b) => b.asOf).sort()[0]!,
  }
}
