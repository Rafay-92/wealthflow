import { addDays, daysBetween, dayOfWeek, formatDay, formatMonth, type ISODate } from '../dates'
import type { MonthComparison, Period } from './periods'

/** How time is grouped: by day, week (Monday–Sunday), month, quarter (Jan–Mar = Q1) or calendar year. */
export type Granularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export const GRANULARITIES: { value: Granularity; label: string; noun: string }[] = [
  { value: 'month', label: 'Monthly', noun: 'month' },
  { value: 'quarter', label: 'Quarterly', noun: 'quarter' },
  { value: 'year', label: 'Yearly', noun: 'year' },
]

/** All groupings, including the short ones used for custom periods. */
export const ALL_GRANULARITIES: { value: Granularity; label: string; noun: string }[] = [
  { value: 'day', label: 'Daily', noun: 'day' },
  { value: 'week', label: 'Weekly', noun: 'week' },
  ...GRANULARITIES,
]

/** The Monday on or before a date. */
function weekStart(date: ISODate): ISODate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7))
}

/** A period's key: '2026-10-05' (day), '2026-10-05' (week, its Monday), '2026-10' (month), '2026-Q4', '2026'. */
export function bucketKey(date: ISODate, g: Granularity): string {
  const year = date.slice(0, 4)
  const month = Number(date.slice(5, 7))
  if (g === 'day') return date
  if (g === 'week') return weekStart(date)
  if (g === 'month') return date.slice(0, 7)
  if (g === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`
  return year
}

const pad = (n: number) => String(n).padStart(2, '0')
const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The first and last day of a period. */
export function bucketPeriod(key: string, g: Granularity): Period {
  if (g === 'day') return { start: key, end: key }
  if (g === 'week') return { start: key, end: addDays(key, 6) }
  const year = Number(key.slice(0, 4))
  if (g === 'year') return { start: `${year}-01-01`, end: `${year}-12-31` }
  const [firstMonth, lastMonth] = g === 'month' ? [Number(key.slice(5, 7)), Number(key.slice(5, 7))] : [(Number(key.slice(6)) - 1) * 3 + 1, (Number(key.slice(6)) - 1) * 3 + 3]
  return { start: `${year}-${pad(firstMonth)}-01`, end: `${year}-${pad(lastMonth)}-${pad(lastDayOf(year, lastMonth))}` }
}

/** The period before: '2026-Q1' → '2025-Q4'. */
export function previousBucket(key: string, g: Granularity): string {
  return bucketKey(addDays(bucketPeriod(key, g).start, -1), g)
}

/** Every period from `first` to `last`, oldest first. */
export function bucketsBetween(first: string, last: string, g: Granularity): string[] {
  const out: string[] = []
  for (let key = last; key >= first; key = previousBucket(key, g)) out.unshift(key)
  return out
}

/**
 * Every period a date range touches, each cut to the range: Dec 23 – Jan 22
 * by month is Dec 23–31 then Jan 1–22. Only days inside the range count.
 */
export function bucketsWithin(range: Period, g: Granularity): { key: string; period: Period }[] {
  return bucketsBetween(bucketKey(range.start, g), bucketKey(range.end, g), g).map((key) => {
    const full = bucketPeriod(key, g)
    return { key, period: { start: full.start > range.start ? full.start : range.start, end: full.end < range.end ? full.end : range.end } }
  })
}

/** A sensible grouping for a range's length: daily up to a month, weekly up to a quarter, then monthly. */
export function autoGranularity(range: Period): Granularity {
  const days = daysBetween(range.start, range.end) + 1
  if (days <= 31) return 'day'
  if (days <= 92) return 'week'
  if (days <= 731) return 'month'
  return 'year'
}

/** "Oct 2026" / "October 2026", "Q4 2026", "2026", "Dec 23", "Wk of Dec 21". */
export function formatBucket(key: string, g: Granularity, style: 'short' | 'long' = 'short'): string {
  if (g === 'day') return style === 'short' ? formatDay(key) : `${formatDay(key)}, ${key.slice(0, 4)}`
  if (g === 'week') return style === 'short' ? `Wk ${formatDay(key)}` : `Week of ${formatDay(key)}, ${key.slice(0, 4)}`
  if (g === 'month') return formatMonth(key, style)
  if (g === 'quarter') return `${key.slice(5)} ${key.slice(0, 4)}`
  return key
}

/**
 * The latest period compared with the one before it, like for like.
 * If your data stops partway through the latest period (Oct 1 – Nov 20 of Q4),
 * it's compared with the same number of days of the previous one (Jul 1 – Aug 20),
 * so an unfinished quarter doesn't look like a drop in spending.
 */
export function compareWithPrevious(key: string, g: Granularity, latestDataDate: ISODate): MonthComparison {
  const full = bucketPeriod(key, g)
  const end = latestDataDate < full.end && latestDataDate >= full.start ? latestDataDate : full.end
  const prev = bucketPeriod(previousBucket(key, g), g)
  const elapsed = daysBetween(full.start, end)
  const prevEnd = addDays(prev.start, elapsed)
  return {
    month: key,
    current: { start: full.start, end },
    previous: { start: prev.start, end: prevEnd < prev.end ? prevEnd : prev.end },
    isPartial: end < full.end,
  }
}
