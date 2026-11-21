import type { CategoryTotal } from '../../lib/analytics/byCategory'
import { formatCents } from '../../lib/money'
import type { Category } from '../../types/transaction'
import { CATEGORY_ICONS } from '../categories'

interface CategoryRankingProps {
  categories: readonly CategoryTotal[]
  monthCount: number
  selected: Category | null
  onSelect: (category: Category) => void
}

/**
 * Every spending category, ranked. Each row is a button: selecting one
 * shows its monthly trend and biggest purchases beside the list.
 */
export function CategoryRanking({ categories, monthCount, selected, onSelect }: CategoryRankingProps) {
  if (categories.length === 0) return <p className="py-8 text-center text-sm text-ink-faint">No spending in this period.</p>
  const largest = categories[0]!.amount

  return (
    <ul className="-mx-2 flex flex-col gap-1">
      {categories.map((c, i) => {
        const Icon = CATEGORY_ICONS[c.category]
        const active = c.category === selected
        return (
          <li key={c.category}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(c.category)}
              className={`w-full rounded-lg px-2 py-2 text-left transition-colors ${active ? 'bg-navy-700' : 'hover:bg-navy-700/40'}`}
            >
              <span className="mb-1.5 flex items-center gap-2.5 text-sm">
                <span className="w-4 text-right text-xs text-ink-faint tabular">{i + 1}</span>
                <Icon aria-hidden className={`size-4 shrink-0 ${active ? 'text-ink' : 'text-ink-faint'}`} />
                <span className="flex-1 truncate">{c.category}</span>
                <span className="font-medium tabular">{formatCents(c.amount)}</span>
                <span className="w-10 text-right text-xs text-ink-faint tabular">{Math.round(c.share * 100)}%</span>
              </span>
              <span className="flex items-center gap-2.5 pl-[3.25rem]">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-700">
                  <span
                    className="block h-full rounded-full bg-series-expense transition-[width] duration-500"
                    style={{ width: `${(c.amount / largest) * 100}%` }}
                  />
                </span>
                {monthCount > 1 && (
                  <span className="w-[5.5rem] text-right text-[11px] text-ink-faint tabular">{formatCents(Math.round(c.amount / monthCount), { whole: true })}/mo</span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
