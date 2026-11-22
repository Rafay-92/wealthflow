import { GRANULARITIES, type Granularity } from '../../lib/analytics/granularity'

/** A segmented control: group analytics by month, quarter or year. */
export function GranularitySelect({ value, onChange }: { value: Granularity; onChange: (v: Granularity) => void }) {
  return (
    <div role="group" aria-label="Group by" className="inline-flex rounded-lg border border-navy-600 bg-navy-800 p-0.5">
      {GRANULARITIES.map((o) => (
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
