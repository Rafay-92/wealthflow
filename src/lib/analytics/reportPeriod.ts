import { addDays, daysBetween, formatDay, formatMonth, isISODate, toMonthKey, type ISODate, type MonthKey } from '../dates'
import { comparisonPeriods, monthPeriod, type Period } from './periods'

/**
 * What the Dashboard and Reports show:
 *   month  - a calendar month (Oct 1–31), compared with the month before;
 *   custom - any start and end date you choose, possibly spanning months,
 *            compared with the same number of days just before it.
 */
export type PeriodSelection = { kind: 'month'; month: MonthKey } | { kind: 'custom'; start: ISODate; end: ISODate }

export interface ResolvedPeriod {
  kind: PeriodSelection['kind']
  /** The dates you asked for. */
  requested: Period
  /** The dates actually covered: cut short where your data stops. */
  current: Period
  /** The period it's compared with. */
  previous: Period
  /** True when your data stops before the end of the requested period. */
  isPartial: boolean
  /** "October 2026", "Nov 1–20" or "Nov 22 – Dec 22, 2026". */
  label: string
  /** "October", "Oct 1–20" or "Oct 22 – Nov 21". */
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

const shortRange = ({ start, end }: Period) =>
  toMonthKey(start) === toMonthKey(end) ? `${formatDay(start)}–${Number(end.slice(8))}` : `${formatDay(start)} – ${formatDay(end)}`

export function resolvePeriod(selection: PeriodSelection, latestDataDate: ISODate | null): ResolvedPeriod {
  if (selection.kind === 'month') {
    const c = comparisonPeriods(selection.month, latestDataDate)
    return {
      kind: 'month',
      requested: monthPeriod(selection.month),
      current: c.current,
      previous: c.previous,
      isPartial: c.isPartial,
      label: c.isPartial ? shortRange(c.current) : formatMonth(selection.month),
      previousLabel: c.isPartial ? shortRange(c.previous) : formatMonth(toMonthKey(c.previous.start), 'short'),
      month: selection.month,
      days: daysBetween(c.current.start, c.current.end) + 1,
    }
  }
  const [start, end] = selection.start <= selection.end ? [selection.start, selection.end] : [selection.end, selection.start]
  // Cut short where the data stops, so "Nov 22 – Dec 31" with data to Dec 22 is
  // compared like for like rather than looking like spending dropped.
  const coveredEnd = latestDataDate && latestDataDate >= start && latestDataDate < end ? latestDataDate : end
  const days = daysBetween(start, coveredEnd) + 1
  const previous = { start: addDays(start, -days), end: addDays(start, -1) }
  return {
    kind: 'custom',
    requested: { start, end },
    current: { start, end: coveredEnd },
    previous,
    isPartial: coveredEnd < end,
    label: formatRange({ start, end: coveredEnd }),
    previousLabel: shortRange(previous),
    month: null,
    days,
  }
}

/** Reads a selection from the web address: ?month=2026-10, or ?from=2026-11-22&to=2026-12-22. */
export function selectionFromParams(params: URLSearchParams, months: readonly MonthKey[]): PeriodSelection | null {
  const from = params.get('from')
  const to = params.get('to')
  if (from && to && isISODate(from) && isISODate(to)) return { kind: 'custom', start: from, end: to }
  const month = params.get('month')
  const chosen = month && months.includes(month) ? month : months[0]
  return chosen ? { kind: 'month', month: chosen } : null
}

/** The web-address form of a selection. */
export function selectionToParams(selection: PeriodSelection): Record<string, string> {
  return selection.kind === 'month' ? { month: selection.month } : { from: selection.start, to: selection.end }
}
