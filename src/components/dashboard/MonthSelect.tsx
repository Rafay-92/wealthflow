import { ChevronDown } from 'lucide-react'
import { formatMonth, type MonthKey } from '../../lib/dates'

interface MonthSelectProps {
  months: readonly MonthKey[]
  value: MonthKey
  onChange: (month: MonthKey) => void
}

/** A native <select>, styled. Native controls get keyboard and screen-reader support for free. */
export function MonthSelect({ months, value, onChange }: MonthSelectProps) {
  return (
    <label className="relative">
      <span className="sr-only">Month</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer appearance-none rounded-lg border border-navy-600 bg-navy-800 py-2 pr-9 pl-3 text-sm font-medium text-ink transition-colors hover:border-ink-faint focus:border-positive focus:outline-none"
      >
        {months.map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-faint" />
    </label>
  )
}
