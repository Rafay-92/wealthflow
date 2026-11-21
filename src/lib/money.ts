/**
 * Money utilities.
 *
 * RULE: all money in WealthFlow is stored as an integer number of cents.
 *   $12.34  -> 1234
 *   -$5.00  -> -500
 *
 * Why? JavaScript numbers are binary floating point, so decimal fractions
 * are approximations:  0.1 + 0.2 === 0.30000000000000004.
 * Integers (up to 2^53) are exact, so summing cents never drifts.
 * We convert to dollars only at the last moment, for display.
 */

/** The app's currency. Every amount is in Canadian dollars. */
export const CURRENCY = 'CAD'
/** English (Canada) number formatting: "$1,234.56". */
const LOCALE = 'en-CA'

/** An integer amount of cents (CAD). Negative = money out, positive = money in. */
export type Cents = number

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function assertCents(value: number, context: string): void {
  if (!isCents(value)) {
    throw new TypeError(`${context}: expected integer cents, got ${value}`)
  }
}

export interface AmountFormat {
  /**
   * French-Canadian style, common in Quebec bank exports (e.g. Desjardins):
   * comma for decimals, space or period for thousands: "1 234,56 $".
   */
  decimalComma?: boolean
}

/**
 * Converts a money string from a bank statement into cents.
 * Returns null when the text isn't an unambiguous amount, so callers
 * can report the problem instead of importing a wrong number.
 *
 * Accepts:  "12.34"  "-12.34"  "+12.34"  "$1,234.56"  "CA$1,234.56"  "1,234.56 CAD"
 *           "(12.34)"  "12.34-"  ".5"
 * With { decimalComma: true }:  "1 234,56 $"  "1.234,56"  "-12,50"
 * Rejects:  ""  "abc"  "12.345"  "1,23,456", and "12,34" unless decimalComma is set
 *           (it could mean 12.34 or 1,234 — we never guess).
 *
 * Parses the digits as text rather than doing `parseFloat(x) * 100`,
 * because e.g. 1.005 * 100 === 100.49999999999999.
 */
export function parseAmountToCents(input: string, { decimalComma = false }: AmountFormat = {}): Cents | null {
  let text = input
    .trim()
    .replace(/−/g, '-') // Unicode minus sign
    .replace(/[  ]/g, ' ') // non-breaking spaces, used as thousands separators in French
  if (text === '') return null

  let negative = false

  // Accounting style: (12.34) means -12.34
  if (text.startsWith('(') && text.endsWith(')')) {
    negative = true
    text = text.slice(1, -1).trim()
  }
  // Some banks put the minus at the end: 12.34-
  if (text.endsWith('-')) {
    negative = !negative
    text = text.slice(0, -1).trim()
  }
  // Signs and currency markers can come in either order, before or after the
  // number: -$5, $-5, CA$ -5, 5 $, 5.00 CAD. Peel them off until none are left.
  const takeSign = () => {
    if (text.startsWith('-') || text.startsWith('+')) {
      if (text.startsWith('-')) negative = !negative
      text = text.slice(1).trim()
    }
  }
  for (let i = 0; i < 3; i++) {
    takeSign()
    text = text
      .replace(/^(CAD|CA\$|C\$|\$)\s*/i, '')
      .replace(/\s*(CAD|CA\$|C\$|\$)$/i, '')
      .trim()
  }

  if (decimalComma) {
    // "1 234,56" or "1.234,56": thousands in groups of three, comma for decimals.
    if (/[ .]/.test(text) && !/^\d{1,3}([ .]\d{3})+(,\d*)?$/.test(text)) return null
    text = text.replace(/[ .]/g, '').replace(',', '.')
  } else if (text.includes(',')) {
    // Thousands separators are only allowed in correct groups of three.
    if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(text)) return null
    text = text.replace(/,/g, '')
  }

  const match = /^(\d*)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) return null
  const [, wholePart = '', fractionPart = ''] = match
  if (wholePart === '' && fractionPart === '') return null

  const cents = Number(wholePart || '0') * 100 + Number(fractionPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) return null

  if (cents === 0) return 0 // avoid returning -0
  return negative ? -cents : cents
}

const moneyFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY })
const wholeFormatter = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 })
const compactFormatter = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  notation: 'compact',
  maximumFractionDigits: 1,
})

export interface FormatOptions {
  /** Drop the cents, e.g. "$1,235". Useful for chart axes. */
  whole?: boolean
  /** Always show the sign, e.g. "+$12.00" / "-$12.00". */
  signed?: boolean
}

/** Formats cents for display: 123456 -> "$1,234.56". */
export function formatCents(cents: Cents, options: FormatOptions = {}): string {
  assertCents(cents, 'formatCents')
  const formatter = options.whole ? wholeFormatter : moneyFormatter
  const formatted = formatter.format(Math.abs(cents) / 100)
  if (cents < 0) return `-${formatted}`
  if (options.signed && cents > 0) return `+${formatted}`
  return formatted
}

/** Short form for chart axes: 523400 -> "$5.2K". */
export function formatCentsCompact(cents: Cents): string {
  assertCents(cents, 'formatCentsCompact')
  const formatted = compactFormatter.format(Math.abs(cents) / 100)
  return cents < 0 ? `-${formatted}` : formatted
}

/** Exact sum of a list of cent amounts. Throws if any value isn't integer cents. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0
  for (const value of values) {
    assertCents(value, 'sumCents')
    total += value
  }
  assertCents(total, 'sumCents (total overflowed)')
  return total
}

/**
 * `part` as a percentage of `whole`, e.g. savings rate = percentOf(saved, income).
 * Returns null when `whole` is 0, because "0% of nothing" is undefined, not zero.
 * The result is not rounded; round only when displaying.
 */
export function percentOf(part: Cents, whole: Cents): number | null {
  assertCents(part, 'percentOf')
  assertCents(whole, 'percentOf')
  if (whole === 0) return null
  return (part / whole) * 100
}

/** Formats a percentage for display: 18.456 -> "18.5%". Null shows as an em dash. */
export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(fractionDigits)}%`
}
