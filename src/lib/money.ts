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

/** An integer amount of US cents. Negative = money out, positive = money in. */
export type Cents = number

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function assertCents(value: number, context: string): void {
  if (!isCents(value)) {
    throw new TypeError(`${context}: expected integer cents, got ${value}`)
  }
}

/**
 * Converts a money string from a bank statement into cents.
 * Returns null when the text isn't an unambiguous amount, so callers
 * can report the problem instead of importing a wrong number.
 *
 * Accepts:  "12.34"  "-12.34"  "+12.34"  "$1,234.56"  "(12.34)"  "12.34-"  ".5"
 * Rejects:  ""  "abc"  "12.345"  "12,34" (European decimal — ambiguous)  "1,23,456"
 *
 * Parses the digits as text rather than doing `parseFloat(x) * 100`,
 * because e.g. 1.005 * 100 === 100.49999999999999.
 */
export function parseAmountToCents(input: string): Cents | null {
  let text = input.trim().replace(/−/g, '-') // normalise the Unicode minus sign
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
  // A leading sign may come before or after the dollar sign: -$5 or $-5
  const takeSign = () => {
    if (text.startsWith('-') || text.startsWith('+')) {
      if (text.startsWith('-')) negative = !negative
      text = text.slice(1).trim()
    }
  }
  takeSign()
  if (text.startsWith('$')) {
    text = text.slice(1).trim()
    takeSign()
  }

  // Thousands separators are only allowed in correct groups of three.
  if (text.includes(',')) {
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

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const usdWholeFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
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
  const formatter = options.whole ? usdWholeFormatter : usdFormatter
  const formatted = formatter.format(Math.abs(cents) / 100)
  if (cents < 0) return `-${formatted}`
  if (options.signed && cents > 0) return `+${formatted}`
  return formatted
}

const usdCompactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Short form for chart axes: 523400 -> "$5.2K". */
export function formatCentsCompact(cents: Cents): string {
  assertCents(cents, 'formatCentsCompact')
  const formatted = usdCompactFormatter.format(Math.abs(cents) / 100)
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
