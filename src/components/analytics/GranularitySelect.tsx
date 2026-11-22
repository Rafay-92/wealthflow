import { GRANULARITIES, type Granularity } from '../../lib/analytics/granularity'

type Option = { value: Granularity; label: string }

/** A segmented control: group analytics by month, quarter or year. */
export function GranularitySelect({ value, onChange, options = GRANULARITIES }: { value: Granularity; onChange: (v: Granularity) => void; options?: readonly Option[] }) {
  return (
    <div role="group" aria-label="Group by" className="inline-flex rounded-lg border border-navy-600 bg-navy-800 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${value === o.value ? 'bg-navy-600 text-ink' : 'text-ink-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
