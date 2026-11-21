import { ChevronDown } from 'lucide-react'
import { CATEGORIES, type Category } from '../../types/transaction'
import { CATEGORY_ICONS } from '../categories'

interface CategorySelectProps {
  value: Category
  onChange: (category: Category) => void
  label: string
  disabled?: boolean
}

/** A compact category picker: the current category's icon, then a native <select>. */
export function CategorySelect({ value, onChange, label, disabled }: CategorySelectProps) {
  const Icon = CATEGORY_ICONS[value]
  return (
    <label className="relative inline-flex w-full items-center sm:w-44">
      <span className="sr-only">{label}</span>
      <Icon aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-ink-faint" />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Category)}
        className="w-full cursor-pointer appearance-none rounded-md border border-transparent bg-navy-700/50 py-1.5 pr-7 pl-8 text-xs text-ink transition-colors hover:border-navy-600 focus:border-positive focus:outline-none disabled:cursor-default disabled:hover:border-transparent"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {!disabled && <ChevronDown aria-hidden className="pointer-events-none absolute right-2 size-3.5 text-ink-faint" />}
    </label>
  )
}
