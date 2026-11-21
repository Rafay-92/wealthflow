import type { DateFormat } from '../../types/import'
import { isISODate, type ISODate } from '../dates'

const SEP = '[-/.]'
const PATTERNS: Record<Exclude<DateFormat, 'MONTH_NAME'>, { regex: RegExp; order: ['y' | 'm' | 'd', 'y' | 'm' | 'd', 'y' | 'm' | 'd'] }> = {
  'YYYY-MM-DD': { regex: new RegExp(`^(\\d{4})${SEP}(\\d{1,2})${SEP}(\\d{1,2})$`), order: ['y', 'm', 'd'] },
  'MM/DD/YYYY': { regex: new RegExp(`^(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{4})$`), order: ['m', 'd', 'y'] },
  'DD/MM/YYYY': { regex: new RegExp(`^(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{4})$`), order: ['d', 'm', 'y'] },
  'MM/DD/YY': { regex: new RegExp(`^(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{2})$`), order: ['m', 'd', 'y'] },
  'DD/MM/YY': { regex: new RegExp(`^(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{2})$`), order: ['d', 'm', 'y'] },
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  'YYYY-MM-DD': 'YYYY-MM-DD (2026-11-03)',
  'MM/DD/YYYY': 'MM/DD/YYYY (11/03/2026)',
  'DD/MM/YYYY': 'DD/MM/YYYY (03/11/2026)',
  'MM/DD/YY': 'MM/DD/YY (11/03/26)',
  'DD/MM/YY': 'DD/MM/YY (03/11/26)',
  MONTH_NAME: 'Month name (Nov 3, 2026)',
}

function build(y: number, m: number, d: number): ISODate | null {
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return isISODate(iso) ? iso : null
}

function parseMonthName(text: string): ISODate | null {
  // "Nov 3, 2026" / "November 3 2026"
  let match = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text)
  if (match) {
    const month = MONTHS.indexOf(match[1]!.toLowerCase()) + 1
    return month > 0 ? build(Number(match[3]), month, Number(match[2])) : null
  }
  // "3 Nov 2026" / "03-Nov-2026"
  match = /^(\d{1,2})[\s-]+([a-z]{3})[a-z]*\.?[\s-]+(\d{4})$/i.exec(text)
  if (match) {
    const month = MONTHS.indexOf(match[2]!.toLowerCase()) + 1
    return month > 0 ? build(Number(match[3]), month, Number(match[1])) : null
  }
  return null
}

/** Reads a date in the given format. Returns null if it doesn't match or isn't a real date. */
export function parseDate(input: string, format: DateFormat): ISODate | null {
  const text = input.trim()
  if (format === 'MONTH_NAME') return parseMonthName(text)

  const { regex, order } = PATTERNS[format]
  // Ignore a time part if present: "2026-11-03 14:22" or "2026-11-03T14:22:00".
  const datePart = regex.test(text) ? text : text.split(/[\sT]/)[0]!
  const match = regex.exec(datePart)
  if (!match) return null

  const parts = { y: 0, m: 0, d: 0 }
  order.forEach((key, i) => (parts[key] = Number(match[i + 1])))
  if (format.endsWith('/YY')) parts.y += 2000
  return build(parts.y, parts.m, parts.d)
}

export interface DateFormatGuess {
  format: DateFormat
  /**
   * True when both MM/DD and DD/MM read every date successfully (all days ≤ 12),
   * so we can't tell which the bank meant. The user must confirm.
   */
  ambiguous: boolean
}

/**
 * Picks the format that reads the most dates in the column.
 * Ties between US and day-first formats are resolved in favour of US (MM/DD),
 * but flagged as ambiguous so the UI can ask.
 */
export function detectDateFormat(values: readonly string[]): DateFormatGuess {
  const sample = values.filter((v) => v.trim() !== '').slice(0, 200)
  const order: DateFormat[] = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'MM/DD/YY', 'DD/MM/YY', 'MONTH_NAME']
  const scores = order.map((format) => ({
    format,
    hits: sample.filter((v) => parseDate(v, format) !== null).length,
  }))
  const best = Math.max(...scores.map((s) => s.hits))
  const winners = scores.filter((s) => s.hits === best && best > 0).map((s) => s.format)
  const format = winners[0] ?? 'MM/DD/YYYY'

  const ambiguous =
    (winners.includes('MM/DD/YYYY') && winners.includes('DD/MM/YYYY')) ||
    (winners.includes('MM/DD/YY') && winners.includes('DD/MM/YY'))

  return { format, ambiguous }
}
