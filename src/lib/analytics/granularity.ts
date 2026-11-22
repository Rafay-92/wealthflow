import { addDays, daysBetween, formatMonth, type ISODate } from '../dates'
import type { MonthComparison, Period } from './periods'

/** How analytics groups time: by month, quarter (Jan–Mar = Q1) or calendar year. */
export type Granularity = 'month' | 'quarter' | 'year'

export const GRANULARITIES: { value: Granularity; label: string; noun: string }[] = [
  { value: 'month', label: 'Monthly', noun: 'month' },
  { value: 'quarter', label: 'Quarterly', noun: 'quarter' },
  { value: 'year', label: 'Yearly', noun: 'year' },
]

/** A period's key: '2026-10' (month), '2026-Q4' (quarter) or '2026' (year). */
export function bucketKey(date: ISODate, g: Granularity): string {
  const year = date.slice(0, 4)
  const month = Number(date.slice(5, 7))
  if (g === 'month') return date.slice(0, 7)
  if (g === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`
  return year
}

const pad = (n: number) => String(n).padStart(2, '0')
const lastDayOf = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** The first and last day of a period. */
export function bucketPeriod(key: string, g: Granularity): Period {
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

/** "Oct 2026" / "October 2026", "Q4 2026", "2026". */
export function formatBucket(key: string, g: Granularity, style: 'short' | 'long' = 'short'): string {
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
