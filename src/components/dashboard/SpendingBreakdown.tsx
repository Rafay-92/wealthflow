import { MoreHorizontal } from 'lucide-react'
import type { CategoryTotal } from '../../lib/analytics/byCategory'
import { formatCents } from '../../lib/money'
import { CATEGORY_ICONS } from '../categories'

const MAX_ROWS = 6

/**
 * Spending by category as a ranked bar list.
 *
 * Why not a pie chart? With up to 11 spending categories, a pie needs 11
 * colours that are hard to tell apart, and people are bad at comparing
 * slice angles. Bars of one colour, each labelled with its name and
 * amount, are faster to read and accurate to compare.
 */
export function SpendingBreakdown({ categories }: { categories: readonly CategoryTotal[] }) {
  if (categories.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-faint">No spending in this period.</p>
  }

  // Fold everything past the top rows into one "more" row, so the list stays short.
  const shown = categories.slice(0, MAX_ROWS)
  const rest = categories.slice(MAX_ROWS)
  const restTotal = rest.reduce((sum, c) => sum + c.amount, 0)
  const restShare = rest.reduce((sum, c) => sum + c.share, 0)
  const largest = categories[0]!.amount

  const rows = [
    ...shown.map((c) => ({ key: c.category, label: c.category, Icon: CATEGORY_ICONS[c.category], amount: c.amount, share: c.share })),
    ...(rest.length > 0
      ? [{ key: 'rest', label: `${rest.length} more ${rest.length === 1 ? 'category' : 'categories'}`, Icon: MoreHorizontal, amount: restTotal, share: restShare }]
      : []),
  ]

  return (
    <ul className="flex flex-col gap-4">
      {rows.map(({ key, label, Icon, amount, share }) => (
        <li key={key}>
          <div className="mb-1.5 flex items-center gap-2.5 text-sm">
            <Icon aria-hidden className="size-4 shrink-0 text-ink-faint" />
            <span className="flex-1 truncate">{label}</span>
            <span className="font-medium tabular">{formatCents(amount)}</span>
            <span className="w-10 text-right text-xs text-ink-faint tabular">{Math.round(share * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-navy-700">
            <div
              className="h-full rounded-full bg-series-expense transition-[width] duration-500 ease-out"
              style={{ width: `${(amount / largest) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
