import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { CategoryChange } from '../../lib/analytics/analytics'
import { formatCents } from '../../lib/money'
import { CATEGORY_ICONS } from '../categories'

interface CategoryComparisonProps {
  changes: readonly CategoryChange[]
  currentLabel: string
  previousLabel: string
}

/**
 * Month-over-month spending by category. For spending, going UP is the bad
 * direction, so increases are red and decreases green. The arrow and the
 * sign carry the same meaning, so colour is never the only signal.
 */
export function CategoryComparison({ changes, currentLabel, previousLabel }: CategoryComparisonProps) {
  if (changes.length === 0) return <p className="py-8 text-center text-sm text-ink-faint">No spending to compare.</p>

  return (
    // `relative` matters: the screen-reader-only spans below are position:absolute,
    // and without a positioned scroll container they escape it and widen the page.
    <div className="relative -mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-[30rem] text-sm">
        <thead>
          <tr className="border-b border-navy-600/60 text-left text-xs text-ink-faint">
            <th className="py-2 pr-3 font-normal">Category</th>
            <th className="py-2 pr-3 text-right font-normal">{previousLabel}</th>
            <th className="py-2 pr-3 text-right font-normal">{currentLabel}</th>
            <th className="py-2 text-right font-normal">Change</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => {
            const Icon = CATEGORY_ICONS[c.category]
            const up = c.difference > 0
            const flat = c.difference === 0
            const Arrow = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
            const tone = flat ? 'bg-navy-700 text-ink-muted' : up ? 'bg-negative-soft text-negative' : 'bg-positive-soft text-positive'
            return (
              <tr key={c.category} className="border-b border-navy-600/30 last:border-0">
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2">
                    <Icon aria-hidden className="size-4 text-ink-faint" />
                    {c.category}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right text-ink-muted tabular">{formatCents(c.previous)}</td>
                <td className="py-2.5 pr-3 text-right tabular">{formatCents(c.current)}</td>
                <td className="py-2.5 text-right">
                  <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium tabular ${tone}`}>
                    <Arrow aria-hidden className="size-3.5" />
                    {formatCents(Math.abs(c.difference))}
                    {c.percent !== null && !flat && <span className="opacity-80">· {Math.abs(c.percent).toFixed(0)}%</span>}
                    {c.percent === null && !flat && <span className="opacity-80">· new</span>}
                    <span className="sr-only">{flat ? 'unchanged' : up ? 'more' : 'less'}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
