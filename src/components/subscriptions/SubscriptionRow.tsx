import { TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDay } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import type { SubscriptionCandidate } from '../../lib/recurring/subscriptions'
import { CATEGORY_ICONS } from '../categories'

interface SubscriptionRowProps {
  item: SubscriptionCandidate
  actions: ReactNode
}

/** One recurring payment: what it is, what it costs, when it's next due. */
export function SubscriptionRow({ item, actions }: SubscriptionRowProps) {
  const Icon = CATEGORY_ICONS[item.category]
  const raised = item.previousAmount !== null && item.lastAmount > item.previousAmount

  return (
    <li className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 py-4 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto]">
      <div className="grid size-9 place-items-center rounded-lg bg-navy-700">
        <Icon aria-hidden className="size-4 text-ink-muted" />
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-xs text-ink-faint">
          {item.category} · {item.charges} charges since {formatDay(item.firstDate)} · last {formatDay(item.lastDate)}
          {item.active && <> · next ~{formatDay(item.nextExpected)}</>}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5 empty:hidden">
          {item.likely && <Badge className="bg-positive-soft text-positive">Likely subscription</Badge>}
          {!item.active && <Badge className="bg-navy-700 text-ink-muted">No charge since {formatDay(item.lastDate)}. Cancelled?</Badge>}
          {item.previousAmount !== null && (
            <Badge className={raised ? 'bg-warning-soft text-warning' : 'bg-navy-700 text-ink-muted'}>
              {raised && <TrendingUp aria-hidden className="size-3" />}
              Price {raised ? 'went up' : 'changed'} from {formatCents(item.previousAmount)}
            </Badge>
          )}
        </div>
      </div>

      <div className="text-right">
        <p className="text-sm font-medium tabular">
          {formatCents(item.monthlyCost)}
          <span className="text-xs font-normal text-ink-faint">/mo</span>
        </p>
        <p className="text-xs text-ink-faint tabular">{formatCents(item.annualCost, { whole: true })}/yr</p>
      </div>

      <div className="col-span-3 flex justify-end gap-2 sm:col-span-1">{actions}</div>
    </li>
  )
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
}
