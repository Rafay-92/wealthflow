import type { BalanceTotal } from '../../lib/analytics/balance'
import { formatDay } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import type { Account } from '../../types/account'
import { Card } from '../ui/Card'

interface BalanceCardProps {
  balance: BalanceTotal | null
  accounts: readonly Account[]
}

/** The dashboard's one hero number: the total balance the bank reported. */
export function BalanceCard({ balance, accounts }: BalanceCardProps) {
  const withBalance = accounts.filter((a) => a.balance !== undefined)

  return (
    <Card className="relative overflow-hidden motion-safe:animate-rise">
      {/* Soft glow in the corner, purely decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-positive/10 blur-3xl"
      />

      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-ink-muted">Total balance</p>
          {balance ? (
            <>
              <p className="mt-2 text-5xl font-semibold tracking-tight">{formatCents(balance.total)}</p>
              <p className="mt-2 text-sm text-ink-faint">
                Across {balance.accountCount} {balance.accountCount === 1 ? 'account' : 'accounts'}
                {balance.asOf && <> · as of {formatDay(balance.asOf)}</>}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold text-ink-muted">Not provided</p>
              <p className="mt-2 max-w-md text-sm text-ink-faint">
                Your statements didn't include a balance. Income and spending are still accurate.
              </p>
            </>
          )}
        </div>

        {withBalance.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:min-w-96">
            {withBalance.map((account) => (
              <li key={account.id} className="rounded-xl bg-navy-900/60 px-4 py-3">
                <p className="text-xs text-ink-faint">{account.name}</p>
                <p className="mt-1 font-medium tabular">{formatCents(account.balance!)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
