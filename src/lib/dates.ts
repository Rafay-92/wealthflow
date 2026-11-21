/**
 * Date utilities.
 *
 * Transaction dates are calendar dates ("2026-11-03"), not moments in time.
 * If we turned them into JavaScript Date objects in local time, a user west of
 * UTC could see "Nov 3" displayed as "Nov 2". So we keep dates as
 * 'YYYY-MM-DD' strings and do month maths on the numbers directly.
 *
 * A nice property of this format: comparing the strings alphabetically
 * ("2026-10-31" < "2026-11-01") is the same as comparing the dates.
 */

/** A calendar date, 'YYYY-MM-DD'. */
export type ISODate = string
/** A calendar month, 'YYYY-MM'. */
export type MonthKey = string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTH_KEY = /^(\d{4})-(\d{2})$/

/** True only for real calendar dates — rejects "2026-02-30". */
export function isISODate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const match = MONTH_KEY.exec(key)
  if (!match) throw new RangeError(`Invalid month key: ${key}`)
  return { year: Number(match[1]), month: Number(match[2]) }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toMonthKey(date: ISODate): MonthKey {
  return date.slice(0, 7)
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

/** addMonths('2026-01', -1) -> '2025-12' */
export function addMonths(key: MonthKey, count: number): MonthKey {
  const { year, month } = parseMonthKey(key)
  const zeroBased = year * 12 + (month - 1) + count
  return `${Math.floor(zeroBased / 12)}-${pad((zeroBased % 12) + 1)}`
}

export function daysInMonth(key: MonthKey): number {
  const { year, month } = parseMonthKey(key)
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function dateInMonth(key: MonthKey, day: number): ISODate {
  return `${key}-${pad(day)}`
}

/**
 * Today's date on the user's calendar. Uses LOCAL time on purpose:
 * new Date().toISOString() is UTC, which in the evening in the Americas is
 * already tomorrow.
 */
export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** addDays('2026-11-28', 5) -> '2026-12-03' */
export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days between two dates, ignoring order: daysBetween('2026-11-01', '2026-11-04') -> 3 */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))
  return Math.round(ms / 86_400_000)
}

/** Number of months from `from` to `to`, counting both: monthsBetween('2026-10', '2026-12') -> 3 */
export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const a = parseMonthKey(from)
  const b = parseMonthKey(to)
  return (b.year - a.year) * 12 + (b.month - a.month) + 1
}

/** The `count` months ending at `endKey`, oldest first. */
export function monthsEndingAt(endKey: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => addMonths(endKey, i - count + 1))
}

/** Turns a calendar date into a Date at UTC midnight — for formatting only. */
function toUTCDate(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`)
}

const monthLong = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const dayShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** '2026-11' -> 'November 2026' (long) or 'Nov' (short) */
export function formatMonth(key: MonthKey, style: 'long' | 'short' = 'long'): string {
  const date = toUTCDate(dateInMonth(key, 1))
  return (style === 'long' ? monthLong : monthShort).format(date)
}

/** '2026-11-03' -> 'Nov 3' */
export function formatDay(date: ISODate): string {
  return dayShort.format(toUTCDate(date))
}
