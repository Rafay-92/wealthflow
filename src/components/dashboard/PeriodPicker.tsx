import { useState } from 'react'
import type { PeriodSelection, ResolvedPeriod } from '../../lib/analytics/reportPeriod'
import { isISODate, toMonthKey, type MonthKey } from '../../lib/dates'
import { fieldClass } from '../ui/fieldClass'
import { MonthSelect } from './MonthSelect'

interface PeriodPickerProps {
  selection: PeriodSelection
  /** The resolved dates, used to pre-fill the custom range when switching. */
  period: ResolvedPeriod
  months: readonly MonthKey[]
  onChange: (selection: PeriodSelection) => void
}

/**
 * Calendar month or custom period. A calendar month is Oct 1–31, compared
 * with the month before; a custom period is any start and end date (it can
 * span months), compared with the same number of days just before it.
 */
export function PeriodPicker({ selection, period, months, onChange }: PeriodPickerProps) {
  const [draft, setDraft] = useState(() => (selection.kind === 'custom' ? { start: selection.start, end: selection.end } : { start: period.requested.start, end: period.current.end }))
  const [error, setError] = useState<string | null>(null)

  function choose(kind: PeriodSelection['kind']) {
    if (kind === selection.kind) return
    setError(null)
    if (kind === 'custom') {
      const range = { start: period.requested.start, end: period.current.end }
      setDraft(range)
      onChange({ kind: 'custom', ...range })
    } else {
      const month = toMonthKey(period.current.end)
      onChange({ kind: 'month', month: months.includes(month) ? month : months[0]! })
    }
  }

  function setDate(field: 'start' | 'end', value: string) {
    const next = { ...draft, [field]: value }
    setDraft(next)
    if (!isISODate(next.start) || !isISODate(next.end)) return setError('Choose both a start and an end date.')
    if (next.start > next.end) return setError('The start date must be on or before the end date.')
    setError(null)
    onChange({ kind: 'custom', ...next })
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Reporting period" className="inline-flex rounded-lg border border-navy-600 bg-navy-800 p-0.5">
          {(['month', 'custom'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={selection.kind === kind}
              onClick={() => choose(kind)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${selection.kind === kind ? 'bg-navy-600 text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              {kind === 'month' ? 'Calendar month' : 'Custom period'}
            </button>
          ))}
        </div>
        {selection.kind === 'month' && <MonthSelect months={months} value={selection.month} onChange={(m) => onChange({ kind: 'month', month: m })} />}
      </div>
      {selection.kind === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-faint">
            From
            <input type="date" aria-label="Period start" className={fieldClass} value={draft.start} max={draft.end || undefined} onChange={(e) => setDate('start', e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-faint">
            To
            <input type="date" aria-label="Period end" className={fieldClass} value={draft.end} min={draft.start || undefined} onChange={(e) => setDate('end', e.target.value)} />
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
    </div>
  )
}
