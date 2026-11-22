import type { AccountBalance, BalanceTotal } from '../../lib/analytics/balance'
import { formatDay } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import { Card } from '../ui/Card'

interface BalanceCardProps {
  balance: BalanceTotal | null
  accounts: readonly AccountBalance[]
}

/** How an account's live balance was worked out, in one short line. */
function explain(a: AccountBalance): string {
  const anchor =
    a.basis === 'bank'
      ? `Bank reported ${formatCents(a.anchorBalance)}`
      : `You entered ${formatCents(a.anchorBalance)} at the start of ${formatDay(a.countFrom)}`
  if (a.sinceCount === 0) return a.basis === 'bank' ? `Reported by your bank · ${formatDay(a.asOf)}` : anchor
  return `${anchor} ${a.since < 0 ? '−' : '+'} ${formatCents(Math.abs(a.since))} from ${a.sinceCount} later ${a.sinceCount === 1 ? 'transaction' : 'transactions'}`
}

/**
 * The dashboard's hero number: what your accounts hold now.
 * Each balance starts from a known figure (the bank's, or a balance
 * you entered) and adds every transaction after it, so it moves as soon as
 * you add, edit or delete a transaction.
 */
export function BalanceCard({ balance, accounts }: BalanceCardProps) {
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
              <p className="mt-2 text-5xl font-semibold tracking-tight" data-testid="total-balance">
                {formatCents(balance.total)}
              </p>
              <p className="mt-2 text-sm text-ink-faint">
                Across {balance.accountCount} {balance.accountCount === 1 ? 'account' : 'accounts'}
                {balance.asOf && <> · up to {formatDay(balance.asOf)}</>}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-3xl font-semibold text-ink-muted">Not provided</p>
              <p className="mt-2 max-w-md text-sm text-ink-faint">
                No account has a known balance yet. Type your balance in “Balance today” when you import, or add an
                opening balance in the Balance check below.
              </p>
            </>
          )}
        </div>

        {accounts.length > 0 && (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:min-w-96">
            {accounts.map((account) => (
              <li key={account.accountId} className="rounded-xl bg-navy-900/60 px-4 py-3">
                <p className="text-xs text-ink-faint">{account.name}</p>
                <p className="mt-1 font-medium tabular">{formatCents(account.balance)}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">{explain(account)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
