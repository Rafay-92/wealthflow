import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Change } from '../../lib/analytics/change'
import { Card } from '../ui/Card'

interface StatCardProps {
  label: string
  value: string
  /** The change vs the comparison period; omit when there's nothing to compare. */
  change?: Change | null
  /** How to print the change amount, e.g. "12.5%" or "3.1 pts". */
  formatChange?: (amount: number) => string
  /** e.g. "vs Oct 1–20" */
  comparisonLabel?: string
  /** Shown instead of the change when there is none. */
  hint?: string
  style?: CSSProperties
}

const TONE_CLASSES = {
  good: 'bg-positive-soft text-positive',
  bad: 'bg-negative-soft text-negative',
  neutral: 'bg-navy-700 text-ink-muted',
} as const

const DIRECTION_ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus } as const

/**
 * A single headline metric. The change badge carries meaning in three ways
 * (arrow, sign of the number, colour), so it never relies on colour alone.
 */
export function StatCard({ label, value, change, formatChange, comparisonLabel, hint, style }: StatCardProps) {
  const Icon = change ? DIRECTION_ICONS[change.direction] : null

  return (
    <Card className="flex flex-col gap-3 p-5 motion-safe:animate-rise" style={style}>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="text-[26px] leading-none font-semibold tracking-tight">{value}</p>

      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {change && Icon ? (
          <>
            <span
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular ${TONE_CLASSES[change.tone]}`}
            >
              <Icon aria-hidden className="size-3.5" />
              {change.amount === null ? 'New' : formatChange?.(Math.abs(change.amount))}
              <span className="sr-only">
                {change.direction === 'flat' ? 'unchanged' : change.direction === 'up' ? 'increase' : 'decrease'}
              </span>
            </span>
            {comparisonLabel && <span className="text-ink-faint">{comparisonLabel}</span>}
          </>
        ) : (
          hint && <span className="text-ink-faint">{hint}</span>
        )}
      </div>
    </Card>
  )
}
