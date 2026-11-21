import { kindOf, type WealthEntry, type WealthItem } from '../../types/wealth'
import type { ISODate } from '../dates'
import { parseAmountToCents, sumCents, type Cents } from '../money'

export interface NetWorthPoint {
  date: ISODate
  assets: Cents
  liabilities: Cents
  /** assets - liabilities */
  netWorth: Cents
}

/** An item's most recent value on or before `date`, or null if it hadn't been recorded yet. */
export function valueOn(entries: readonly WealthEntry[], itemId: string, date: ISODate): WealthEntry | null {
  let best: WealthEntry | null = null
  for (const e of entries) {
    if (e.itemId === itemId && e.date <= date && (!best || e.date > best.date)) best = e
  }
  return best
}

/**
 * Net worth on a date: every item at its latest value up to that date.
 * Net Worth = Total Assets − Total Liabilities.
 */
export function netWorthOn(items: readonly WealthItem[], entries: readonly WealthEntry[], date: ISODate): NetWorthPoint {
  const assets: Cents[] = []
  const liabilities: Cents[] = []
  for (const item of items) {
    const entry = valueOn(entries, item.id, date)
    if (!entry) continue
    ;(kindOf(item.type) === 'asset' ? assets : liabilities).push(entry.value)
  }
  const a = sumCents(assets)
  const l = sumCents(liabilities)
  return { date, assets: a, liabilities: l, netWorth: a - l }
}

/** Net worth at every date you recorded a value, oldest first: the "over time" chart. */
export function netWorthHistory(items: readonly WealthItem[], entries: readonly WealthEntry[]): NetWorthPoint[] {
  const tracked = new Set(items.map((i) => i.id))
  const dates = [...new Set(entries.filter((e) => tracked.has(e.itemId)).map((e) => e.date))].sort()
  return dates.map((date) => netWorthOn(items, entries, date))
}

export interface ItemWithValue {
  item: WealthItem
  latest: WealthEntry | null
}

/** Each item with its latest value, largest first, split into assets and liabilities. */
export function itemsWithValues(items: readonly WealthItem[], entries: readonly WealthEntry[]) {
  const withValues: ItemWithValue[] = items.map((item) => ({ item, latest: valueOn(entries, item.id, '9999-12-31') }))
  const byValue = (a: ItemWithValue, b: ItemWithValue) => (b.latest?.value ?? 0) - (a.latest?.value ?? 0) || a.item.name.localeCompare(b.item.name)
  return {
    assets: withValues.filter((w) => kindOf(w.item.type) === 'asset').sort(byValue),
    liabilities: withValues.filter((w) => kindOf(w.item.type) === 'liability').sort(byValue),
  }
}

/**
 * Reads a value typed into a form. Values are always entered as positive
 * amounts: what you own, or what you owe. Returns cents or an error message.
 */
export function parseWealthValue(text: string): Cents | string {
  if (text.trim() === '') return 'Enter an amount.'
  const cents = parseAmountToCents(text)
  if (cents === null) return `“${text.trim()}” isn’t a valid amount.`
  if (cents < 0) return 'Enter a positive amount. Debts go under liabilities.'
  return cents
}
