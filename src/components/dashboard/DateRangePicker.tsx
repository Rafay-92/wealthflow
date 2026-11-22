import { CalendarRange, ChevronDown, RotateCcw } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  matchingPreset,
  presetSelection,
  PRESETS,
  type PeriodSelection,
  type ResolvedPeriod,
} from '../../lib/analytics/reportPeriod'
import { formatDay, formatMonth, isISODate, type ISODate, type MonthKey } from '../../lib/dates'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/fieldClass'

interface DateRangePickerProps {
  selection: PeriodSelection
  period: ResolvedPeriod
  months: readonly MonthKey[]
  /** The day presets count back from (today, or your latest transaction if later). */
  anchor: ISODate
  onApply: (selection: PeriodSelection) => void
  onReset: () => void
}

/**
 * One control for every period: presets, any calendar month, or any start
 * and end date (across months, years and leap days). The active range is
 * always written on the button itself, so it's never in doubt.
 *
 * Presets and months apply straight away; typed dates apply with "Apply",
 * which is disabled until the range is valid (end on or after start).
 */
export function DateRangePicker({ selection, period, months, anchor, onApply, onReset }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [start, setStart] = useState(period.requested.start)
  const [end, setEnd] = useState(period.requested.end)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const active = matchingPreset(selection, anchor, months)
  const tag = active ? PRESETS.find((p) => p.id === active)!.label : selection.kind === 'month' ? 'Calendar month' : 'Custom range'

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onClick = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  function toggle() {
    if (!open) {
      // Start from what's showing now.
      setStart(period.requested.start)
      setEnd(period.requested.end)
    }
    setOpen(!open)
  }

  function apply(next: PeriodSelection) {
    onApply(next)
    setOpen(false)
  }

  const invalid = !isISODate(start) || !isISODate(end) ? 'Choose both a start and an end date.' : end < start ? 'The end date must be on or after the start date.' : null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!invalid) apply({ kind: 'custom', start, end })
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Period: ${period.label}. Change period`}
        className="flex w-full items-center gap-2.5 rounded-lg border border-navy-600 bg-navy-800 py-2 pr-3 pl-3 text-left text-sm transition-colors hover:border-ink-faint sm:w-auto"
      >
        <CalendarRange aria-hidden className="size-4 shrink-0 text-positive" />
        <span className="min-w-0">
          <span className="block truncate font-medium" data-testid="active-range">
            {period.label}
          </span>
          <span className="block text-[11px] text-ink-faint">
            {tag} · {period.days} {period.days === 1 ? 'day' : 'days'}
          </span>
        </span>
        <ChevronDown aria-hidden className={`ml-auto size-4 shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose a period"
          className="fixed inset-x-4 top-20 z-40 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl border border-navy-600 bg-navy-800 p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:mt-2 sm:w-[34rem]"
        >
          <div className="grid gap-4 sm:grid-cols-[11rem_1fr]">
            <div>
              <p className="mb-2 text-xs font-medium text-ink-faint">Quick ranges</p>
              <ul className="grid grid-cols-2 gap-1 sm:grid-cols-1">
                {PRESETS.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={active === p.id}
                      onClick={() => apply(presetSelection(p.id, anchor, months))}
                      className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${active === p.id ? 'bg-positive-soft text-positive' : 'text-ink-muted hover:bg-navy-700 hover:text-ink'}`}
                    >
                      {p.label}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-faint">Counted back from {formatDay(anchor)}, {anchor.slice(0, 4)}.</p>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-faint">
                Calendar month
                <select
                  className={fieldClass}
                  value={selection.kind === 'month' ? selection.month : ''}
                  onChange={(e) => e.target.value && apply({ kind: 'month', month: e.target.value })}
                >
                  {selection.kind !== 'month' && <option value="">Choose a month…</option>}
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m)}
                    </option>
                  ))}
                </select>
              </label>

              <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-navy-600/60 pt-4">
                <p className="text-xs font-medium text-ink-faint">Custom range (both dates included)</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs text-ink-faint">
                    Start date
                    <input type="date" className={fieldClass} value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-ink-faint">
                    End date
                    <input type="date" className={fieldClass} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
                  </label>
                </div>
                {invalid && (
                  <p role="alert" className="text-xs text-negative">
                    {invalid}
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    className="px-2.5"
                    onClick={() => {
                      onReset()
                      setOpen(false)
                    }}
                  >
                    <RotateCcw aria-hidden className="size-3.5" /> Reset
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" variant="primary" disabled={invalid !== null}>
                      Apply
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
