import type { Category, Transaction } from '../../types/transaction'
import { isTransfer } from '../analytics/summary'
import { normalizeMerchantText } from '../categorize/text'
import { addMonths, toMonthKey, type ISODate, type MonthKey } from '../dates'
import type { Cents } from '../money'

export interface RecurringPayment {
  /** Normalised merchant text, used to group charges. */
  key: string
  /** The most recent description, for display. */
  name: string
  category: Category
  /** This month's charge, as a positive amount. */
  amount: Cents
  date: ISODate
  /** In how many of the months checked (including this one) it was charged. */
  monthsSeen: number
}

export const LOOKBACK_MONTHS = 3
/** How far a charge may drift from the usual amount: utility bills vary, Netflix doesn't. */
export const AMOUNT_TOLERANCE = 0.35

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * Payments that recur monthly and were charged in `month`.
 *
 * A merchant counts as recurring when:
 *   - it was charged exactly once in `month`, and
 *   - exactly once in at least 2 of the previous 3 months, and
 *   - every one of those charges is within 35% of their median amount.
 *
 * "Exactly once a month" is what separates a bill (rent, Netflix, the power
 * company) from a shop you visit often (groceries several times a month).
 */
export function detectRecurring(transactions: readonly Transaction[], month: MonthKey): RecurringPayment[] {
  const window = new Set(Array.from({ length: LOOKBACK_MONTHS + 1 }, (_, i) => addMonths(month, -i)))

  // merchant -> month -> charges
  const byMerchant = new Map<string, Map<MonthKey, Transaction[]>>()
  for (const tx of transactions) {
    if (tx.amount >= 0 || isTransfer(tx) || tx.category === 'Income') continue
    const m = toMonthKey(tx.date)
    if (!window.has(m)) continue
    const key = normalizeMerchantText(tx.description)
    if (!key) continue
    const months = byMerchant.get(key) ?? new Map<MonthKey, Transaction[]>()
    months.set(m, [...(months.get(m) ?? []), tx])
    byMerchant.set(key, months)
  }

  const result: RecurringPayment[] = []
  for (const [key, months] of byMerchant) {
    const current = months.get(month)
    if (current?.length !== 1) continue

    const earlierSingles = [...months]
      .filter(([m, charges]) => m !== month && charges.length === 1)
      .map(([, charges]) => charges[0]!)
    if (earlierSingles.length < 2) continue

    const charge = current[0]!
    const amounts = [charge, ...earlierSingles].map((t) => -t.amount)
    const typical = median(amounts)
    if (amounts.some((a) => Math.abs(a - typical) > typical * AMOUNT_TOLERANCE)) continue

    result.push({
      key,
      name: charge.description,
      category: charge.category,
      amount: -charge.amount,
      date: charge.date,
      monthsSeen: earlierSingles.length + 1,
    })
  }
  return result.sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}
