import {
  addMonths,
  dateInMonth,
  daysInMonth,
  dayOfMonth,
  toMonthKey,
  type ISODate,
  type MonthKey,
} from '../dates'

/** An inclusive date range. */
export interface Period {
  start: ISODate
  end: ISODate
}

export function isInPeriod(date: ISODate, period: Period): boolean {
  return date >= period.start && date <= period.end
}

export function monthPeriod(month: MonthKey, throughDay = daysInMonth(month)): Period {
  return { start: dateInMonth(month, 1), end: dateInMonth(month, throughDay) }
}

export interface MonthComparison {
  month: MonthKey
  current: Period
  previous: Period
  /** True when the data stops partway through the selected month. */
  isPartial: boolean
}

/**
 * Works out which date ranges to compare for a selected month.
 *
 * The trap this avoids: if your data runs to Nov 20, comparing
 * "November so far" against "all of October" makes spending look like
 * it dropped by a third. So for a partial month we compare like with like:
 * Nov 1–20 vs Oct 1–20.
 */
export function comparisonPeriods(month: MonthKey, latestDataDate: ISODate | null): MonthComparison {
  const previousMonth = addMonths(month, -1)
  const lastDay = daysInMonth(month)
  const throughDay =
    latestDataDate && toMonthKey(latestDataDate) === month ? dayOfMonth(latestDataDate) : lastDay
  const isPartial = throughDay < lastDay

  return {
    month,
    current: monthPeriod(month, throughDay),
    previous: isPartial
      ? monthPeriod(previousMonth, Math.min(throughDay, daysInMonth(previousMonth)))
      : monthPeriod(previousMonth),
    isPartial,
  }
}
