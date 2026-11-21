import { isTransfer } from '../../lib/analytics/summary'
import { formatDay } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import type { Transaction } from '../../types/transaction'
import { CATEGORY_ICONS } from '../categories'

export function RecentTransactions({ transactions }: { transactions: readonly Transaction[] }) {
  if (transactions.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-faint">No transactions in this period.</p>
  }

  return (
    <ul className="-mx-2 divide-y divide-navy-600/40">
      {transactions.map((tx) => {
        const Icon = CATEGORY_ICONS[tx.category]
        const transfer = isTransfer(tx)
        const amountClass = transfer ? 'text-ink-faint' : tx.amount > 0 ? 'text-positive' : 'text-ink'

        return (
          <li key={tx.id} className="flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-navy-700/40">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-700">
              <Icon aria-hidden className="size-4 text-ink-muted" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{tx.description}</p>
              <p className="text-xs text-ink-faint">
                {formatDay(tx.date)} · {tx.category}
                {transfer && ' · not counted as spending'}
              </p>
            </div>
            <p className={`shrink-0 text-sm font-medium tabular ${amountClass}`}>
              {formatCents(tx.amount, { signed: true })}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
