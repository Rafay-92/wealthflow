import type { ISODate } from '../lib/dates'
import type { Cents } from '../lib/money'

export type WealthKind = 'asset' | 'liability'

/** The kinds of things you can track, each either an asset or a liability. */
export const WEALTH_TYPES = [
  { value: 'cash', label: 'Cash & bank accounts', kind: 'asset' },
  { value: 'investment', label: 'Investments & retirement', kind: 'asset' },
  { value: 'property', label: 'Property', kind: 'asset' },
  { value: 'vehicle', label: 'Vehicle', kind: 'asset' },
  { value: 'other-asset', label: 'Other asset', kind: 'asset' },
  { value: 'credit-card', label: 'Credit card', kind: 'liability' },
  { value: 'loan', label: 'Loan', kind: 'liability' },
  { value: 'mortgage', label: 'Mortgage', kind: 'liability' },
  { value: 'other-liability', label: 'Other debt', kind: 'liability' },
] as const satisfies readonly { value: string; label: string; kind: WealthKind }[]

export type WealthType = (typeof WEALTH_TYPES)[number]['value']

export function kindOf(type: WealthType): WealthKind {
  return WEALTH_TYPES.find((t) => t.value === type)!.kind
}

export function labelOf(type: WealthType): string {
  return WEALTH_TYPES.find((t) => t.value === type)!.label
}

/** Something you own or owe. */
export interface WealthItem {
  id: string
  name: string
  type: WealthType
  /** Set when the item was created from an imported bank account. */
  sourceAccountId?: string
  createdAt: string
}

/**
 * The value of one item on one date. Always a positive amount: what you own
 * for an asset, what you owe for a liability. The id is "itemId:date", so
 * updating the same item twice on one day replaces the earlier value.
 */
export interface WealthEntry {
  id: string
  itemId: string
  date: ISODate
  value: Cents
}
