import type { BudgetLine } from '../../lib/budgets/budgets'
import { formatCents } from '../../lib/money'
import { CategoryLabel } from '../CategoryLabel'

const FILL = { ok: 'bg-positive', near: 'bg-warning', over: 'bg-negative' } as const
const TEXT = { ok: 'text-ink-muted', near: 'text-warning', over: 'text-negative' } as const

/**
 * One budget as a progress bar. Over budget, the bar is full and red; the
 * text always states the amounts too, so colour is never the only signal.
 * `pace` (0–1) marks how much of the month has gone, for an unfinished month.
 */
export function BudgetBar({ line, pace }: { line: BudgetLine; pace?: number }) {
  if (line.budget === null || line.percentUsed === null || line.status === null) return null
  const width = Math.min(100, line.percentUsed)
  const remaining = line.remaining!
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <CategoryLabel category={line.category} />
        <span className="tabular text-ink-muted">
          <span className="font-medium text-ink">{formatCents(line.spent)}</span> of {formatCents(line.budget)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${line.category} budget used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`${Math.round(line.percentUsed)}% used`}
        className="relative h-2 overflow-hidden rounded-full bg-navy-700"
      >
        <div className={`h-full rounded-full ${FILL[line.status]}`} style={{ width: `${width}%` }} />
        {pace !== undefined && pace < 1 && (
          <div aria-hidden title="How much of the month has gone" className="absolute inset-y-0 w-0.5 bg-ink/70" style={{ left: `${pace * 100}%` }} />
        )}
      </div>
      <p className={`mt-1 flex justify-between gap-3 text-xs tabular ${TEXT[line.status]}`}>
        <span>{remaining >= 0 ? `${formatCents(remaining)} left` : `${formatCents(-remaining)} over budget`}</span>
        <span>{Math.round(line.percentUsed)}% used</span>
      </p>
    </div>
  )
}
