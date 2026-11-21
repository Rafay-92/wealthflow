import type { Category, Transaction } from '../../types/transaction'
import { isTransfer } from '../analytics/summary'
import { normalizeMerchantText } from '../categorize/text'
import { addMonths, dateInMonth, dayOfMonth, daysBetween, daysInMonth, toMonthKey, type ISODate } from '../dates'
import { sumCents, type Cents } from '../money'
import { AMOUNT_TOLERANCE } from './detectRecurring'

export interface SubscriptionCandidate {
  /** Normalised merchant text; also the key decisions are saved under. */
  key: string
  name: string
  category: Category
  /** Typical monthly charge: the median of the last three. */
  monthlyCost: Cents
  /** monthlyCost × 12. An estimate: prices can change. */
  annualCost: Cents
  firstDate: ISODate
  lastDate: ISODate
  lastAmount: Cents
  /** For fixed-price items: set when the latest charge differs from the one before (a price change). */
  previousAmount: Cents | null
  charges: number
  /** When the next charge would land if the pattern continues. */
  nextExpected: ISODate
  /** False when there's been no charge for well over a month: possibly cancelled. */
  active: boolean
  /** Already in the Subscriptions category, so very likely a subscription. */
  likely: boolean
}

export type SubscriptionStatus = 'confirmed' | 'dismissed'

export interface SubscriptionDecision {
  key: string
  status: SubscriptionStatus
  decidedAt: string
}

export const MIN_CHARGES = 3
/** A monthly charge lands 25–35 days after the previous one… */
const MONTH_GAP: [number, number] = [25, 35]
/** …or 55–65 days if one month was skipped (allowed once). */
const SKIPPED_GAP: [number, number] = [55, 65]
/** No charge for this long after the last one = probably ended. */
export const INACTIVE_AFTER_DAYS = 45

const within = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

/**
 * Finds payments that behave like monthly subscriptions across your whole history:
 *   - at least 3 charges from the same merchant,
 *   - each 25–35 days after the last (one skipped month allowed),
 *   - every amount within 35% of the typical amount.
 * Rent and utility bills qualify too; you decide which are "subscriptions".
 */
export function findSubscriptions(transactions: readonly Transaction[], latestDate: ISODate): SubscriptionCandidate[] {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.amount >= 0 || isTransfer(tx) || tx.category === 'Income') continue
    const key = normalizeMerchantText(tx.description)
    if (key) groups.set(key, [...(groups.get(key) ?? []), tx])
  }

  const result: SubscriptionCandidate[] = []
  for (const [key, list] of groups) {
    if (list.length < MIN_CHARGES) continue
    const charges = [...list].sort((a, b) => a.date.localeCompare(b.date))

    const gaps = charges.slice(1).map((t, i) => daysBetween(charges[i]!.date, t.date))
    const skipped = gaps.filter((g) => within(g, SKIPPED_GAP)).length
    if (!gaps.every((g) => within(g, MONTH_GAP) || within(g, SKIPPED_GAP)) || skipped > 1) continue

    const amounts = charges.map((t) => -t.amount)
    const typical = median(amounts)
    if (amounts.some((a) => Math.abs(a - typical) > typical * AMOUNT_TOLERANCE)) continue

    const last = charges.at(-1)!
    const before = charges.at(-2)!
    // Fixed-price subscriptions (one price, perhaps changed once) cost their LATEST price
    // going forward. Bills that vary every month (electricity) use a typical recent amount.
    const fixedPrice = new Set(amounts).size <= 2
    const monthlyCost = fixedPrice ? -last.amount : Math.round(median(amounts.slice(-3)))
    // Subscriptions bill on the same calendar day each month (clamped for short months),
    // so predict "the 5th of next month", not "last date + 30.4 days".
    const nextMonth = addMonths(toMonthKey(last.date), 1)
    const nextExpected = dateInMonth(nextMonth, Math.min(dayOfMonth(last.date), daysInMonth(nextMonth)))

    result.push({
      key,
      name: last.description,
      category: last.category,
      monthlyCost,
      annualCost: monthlyCost * 12,
      firstDate: charges[0]!.date,
      lastDate: last.date,
      lastAmount: -last.amount,
      // Only a fixed price can "change"; a utility bill differing month to month is normal.
      previousAmount: fixedPrice && before.amount !== last.amount ? -before.amount : null,
      charges: charges.length,
      nextExpected,
      active: daysBetween(last.date, latestDate) <= INACTIVE_AFTER_DAYS,
      likely: last.category === 'Subscriptions',
    })
  }
  return result.sort((a, b) => b.monthlyCost - a.monthlyCost || a.name.localeCompare(b.name))
}

export interface SubscriptionOverview {
  confirmed: SubscriptionCandidate[]
  toReview: SubscriptionCandidate[]
  dismissed: SubscriptionCandidate[]
  /** Totals of confirmed subscriptions that are still active. */
  monthlyTotal: Cents
  annualTotal: Cents
}

/** Sorts candidates by your decisions and totals the confirmed, active ones. */
export function groupSubscriptions(
  candidates: readonly SubscriptionCandidate[],
  decisions: readonly SubscriptionDecision[],
): SubscriptionOverview {
  const status = new Map(decisions.map((d) => [d.key, d.status]))
  const confirmed = candidates.filter((c) => status.get(c.key) === 'confirmed')
  const counted = confirmed.filter((c) => c.active)
  return {
    confirmed,
    // Likely subscriptions first, so the obvious ones are quickest to confirm.
    toReview: candidates.filter((c) => !status.has(c.key)).sort((a, b) => Number(b.likely) - Number(a.likely) || b.monthlyCost - a.monthlyCost),
    dismissed: candidates.filter((c) => status.get(c.key) === 'dismissed'),
    monthlyTotal: sumCents(counted.map((c) => c.monthlyCost)),
    annualTotal: sumCents(counted.map((c) => c.annualCost)),
  }
}
