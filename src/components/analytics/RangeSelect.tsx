import type { RangePreset } from '../../lib/analytics/analytics'

const OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 3, label: '3M' },
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
  { value: 'all', label: 'All' },
]

/** A segmented control for the analysis period. */
export function RangeSelect({ value, onChange }: { value: RangePreset; onChange: (v: RangePreset) => void }) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-navy-600 bg-navy-800 p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-navy-600 text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
