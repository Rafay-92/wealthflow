import { addDays, addMonths, daysBetween, daysInMonth, dateInMonth, formatDay, formatMonth, isISODate, shiftMonths, toMonthKey, type ISODate, type MonthKey } from '../dates'
import { comparisonPeriods, monthPeriod, type Period } from './periods'

/**
 * What the Dashboard, Analytics and Reports show:
 *   month  - a calendar month (Oct 1–31);
 *   custom - any start and end date you choose, across months or years.
 * Dates are 'YYYY-MM-DD' text and both ends are included, so a transaction
 * on the start or end date always counts, whatever your timezone.
 */
export type PeriodSelection = { kind: 'month'; month: MonthKey } | { kind: 'custom'; start: ISODate; end: ISODate }

/**
 * What the period is compared with:
 *   previous-period - the same number of days immediately before (for a calendar month: the month before)
 *   previous-month  - the same dates one month earlier
 *   previous-year   - the same dates one year earlier
 *   none            - no comparison
 */
export type ComparisonMode = 'previous-period' | 'previous-month' | 'previous-year' | 'none'

export const COMPARISON_MODES: { value: ComparisonMode; label: string }[] = [
  { value: 'previous-period', label: 'Previous equivalent period' },
  { value: 'previous-month', label: 'Previous calendar month' },
  { value: 'previous-year', label: 'Previous year' },
  { value: 'none', label: 'No comparison' },
]

export interface ResolvedPeriod {
  kind: PeriodSelection['kind']
  /** The dates you asked for. */
  requested: Period
  /** The dates actually covered: cut short where your data stops. */
  current: Period
  /** The period it's compared with; null with "No comparison". */
  previous: Period | null
  comparison: ComparisonMode
  /** True when your data stops before the end of the requested period. */
  isPartial: boolean
  /** "October 2026", "Nov 1–20" or "Nov 22 – Dec 22, 2026". */
  label: string
  /** "Sep", "Oct 1–20", "Oct 22 – Nov 21"; '' without a comparison. */
  previousLabel: string
  /** Set for calendar months only. */
  month: MonthKey | null
  /** Days in `current`, counting both ends. */
  days: number
}

/** "Nov 22 – Dec 22, 2026"; the year is repeated only when the range crosses one. */
export function formatRange({ start, end }: Period): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  if (start === end) return `${formatDay(start)}, ${start.slice(0, 4)}`
  return `${formatDay(start)}${sameYear ? '' : `, ${start.slice(0, 4)}`} – ${formatDay(end)}, ${end.slice(0, 4)}`
}

const shortRange = ({ start, end }: Period) => {
  if (start === end) return formatDay(start)
  if (start.slice(0, 4) !== end.slice(0, 4)) return formatRange({ start, end })
  return toMonthKey(start) === toMonthKey(end) ? `${formatDay(start)}–${Number(end.slice(8))}` : `${formatDay(start)} – ${formatDay(end)}`
}

/** Inclusive day count: Jan 23 – Feb 22 is 31 days. */
export const daysIn = (p: Period) => daysBetween(p.start, p.end) + 1

/** The comparison dates for a covered period. */
function comparisonFor(current: Period, mode: ComparisonMode): Period | null {
  if (mode === 'none') return null
  if (mode === 'previous-period') {
    const days = daysIn(current)
    return { start: addDays(current.start, -days), end: addDays(current.start, -1) }
  }
  const months = mode === 'previous-month' ? -1 : -12
  return { start: shiftMonths(current.start, months), end: shiftMonths(current.end, months) }
}

export function resolvePeriod(selection: PeriodSelection, latestDataDate: ISODate | null, comparison: ComparisonMode = 'previous-period'): ResolvedPeriod {
  if (selection.kind === 'month') {
    const c = comparisonPeriods(selection.month, latestDataDate)
    // For a calendar month, "previous period" and "previous month" are the same: the month before,
    // cut to the same days when this month is unfinished.
    const previous = comparison === 'previous-period' || comparison === 'previous-month' ? c.previous : comparisonFor(c.current, comparison)
    return {
      kind: 'month',
      requested: monthPeriod(selection.month),
      current: c.current,
      previous,
      comparison,
      isPartial: c.isPartial,
      label: c.isPartial ? shortRange(c.current) : formatMonth(selection.month),
      previousLabel: !previous ? '' : comparison === 'previous-year' ? shortRange(previous) : c.isPartial ? shortRange(previous) : formatMonth(toMonthKey(previous.start), 'short'),
      month: selection.month,
      days: daysIn(c.current),
    }
  }
  const [start, end] = selection.start <= selection.end ? [selection.start, selection.end] : [selection.end, selection.start]
  // Cut short where the data stops, so "Nov 22 – Dec 31" with data to Dec 22 is
  // compared like for like rather than looking like spending dropped.
  const coveredEnd = latestDataDate && latestDataDate >= start && latestDataDate < end ? latestDataDate : end
  const current = { start, end: coveredEnd }
  const previous = comparisonFor(current, comparison)
  return {
    kind: 'custom',
    requested: { start, end },
    current,
    previous,
    comparison,
    isPartial: coveredEnd < end,
    label: formatRange(current),
    previousLabel: previous ? shortRange(previous) : '',
    month: null,
    days: daysIn(current),
  }
}

// ---- Presets ------------------------------------------------------------------

export type PresetId = 'today' | 'last-7' | 'last-30' | 'last-90' | 'this-month' | 'last-month' | 'month-to-date' | 'year-to-date'

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'last-7', label: 'Last 7 days' },
  { id: 'last-30', label: 'Last 30 days' },
  { id: 'last-90', label: 'Last 90 days' },
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'month-to-date', label: 'Month to date' },
  { id: 'year-to-date', label: 'Year to date' },
]

/**
 * The day presets count back from: today, unless your data runs past today
 * (e.g. a test file dated next year), in which case your latest transaction.
 */
export function presetAnchor(today: ISODate, latestDataDate: ISODate | null): ISODate {
  return latestDataDate && latestDataDate > today ? latestDataDate : today
}

/** A preset's dates. "This month" and "Last month" are whole calendar months. */
export function presetRange(id: PresetId, anchor: ISODate): Period {
  const month = toMonthKey(anchor)
  switch (id) {
    case 'today':
      return { start: anchor, end: anchor }
    case 'last-7':
      return { start: addDays(anchor, -6), end: anchor }
    case 'last-30':
      return { start: addDays(anchor, -29), end: anchor }
    case 'last-90':
      return { start: addDays(anchor, -89), end: anchor }
    case 'this-month':
      return monthPeriod(month)
    case 'last-month':
      return monthPeriod(addMonths(month, -1))
    case 'month-to-date':
      return { start: dateInMonth(month, 1), end: anchor }
    case 'year-to-date':
      return { start: `${anchor.slice(0, 4)}-01-01`, end: anchor }
  }
}

/** The selection a preset makes: a whole month you have data for is a calendar month; anything else a custom range. */
export function presetSelection(id: PresetId, anchor: ISODate, months: readonly MonthKey[]): PeriodSelection {
  const range = presetRange(id, anchor)
  const month = toMonthKey(range.start)
  const wholeMonth = range.start === dateInMonth(month, 1) && range.end === dateInMonth(month, daysInMonth(month))
  return wholeMonth && months.includes(month) ? { kind: 'month', month } : { kind: 'custom', ...range }
}

/** Which preset (if any) gives exactly this selection, so the picker can highlight it. */
export function matchingPreset(selection: PeriodSelection, anchor: ISODate, months: readonly MonthKey[]): PresetId | null {
  const key = (s: PeriodSelection) => (s.kind === 'month' ? s.month : `${s.start}/${s.end}`)
  return PRESETS.find((p) => key(presetSelection(p.id, anchor, months)) === key(selection))?.id ?? null
}

// ---- The web address --------------------------------------------------------------

const COMPARISONS = new Set<string>(COMPARISON_MODES.map((c) => c.value))

/** Reads a selection from the web address: ?month=2026-10, or ?from=2026-11-22&to=2026-12-22. */
export function selectionFromParams(params: URLSearchParams, months: readonly MonthKey[]): PeriodSelection | null {
  const from = params.get('from')
  const to = params.get('to')
  if (from && to && isISODate(from) && isISODate(to)) return { kind: 'custom', start: from, end: to }
  const month = params.get('month')
  const chosen = month && months.includes(month) ? month : months[0]
  return chosen ? { kind: 'month', month: chosen } : null
}

/** ?compare=previous-year etc.; anything else is the default. */
export function comparisonFromParams(params: URLSearchParams): ComparisonMode {
  const value = params.get('compare')
  return value && COMPARISONS.has(value) ? (value as ComparisonMode) : 'previous-period'
}

/** The web-address form of a selection (and comparison, when not the default). */
export function selectionToParams(selection: PeriodSelection, comparison: ComparisonMode = 'previous-period', extra: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = selection.kind === 'month' ? { month: selection.month } : { from: selection.start, to: selection.end }
  if (comparison !== 'previous-period') base.compare = comparison
  return { ...base, ...extra }
}
