import type { Category } from '../types/transaction'
import { CATEGORY_ICONS } from './categories'

/** A category's icon and name, used wherever a category is displayed read-only. */
export function CategoryLabel({ category, className = '' }: { category: Category; className?: string }) {
  const Icon = CATEGORY_ICONS[category]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-muted ${className}`}>
      <Icon aria-hidden className="size-3.5 text-ink-faint" />
      {category}
    </span>
  )
}
