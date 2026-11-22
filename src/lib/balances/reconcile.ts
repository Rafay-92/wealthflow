import type { Account } from '../../types/account'
import { balancePointId, closingPointDate, type BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import { isInPeriod, type Period } from '../analytics/periods'
import { isTransfer } from '../analytics/summary'
import { addDays, daysBetween, formatDay, type ISODate } from '../dates'
import { formatCents, sumCents, type Cents } from '../money'

/** Only bank accounts are reconciled (not credit cards). */
export function isBankAccount(account: Account): boolean {
  return account.type === 'checking' || account.type === 'savings'
}

/**
 * Where an opening balance came from. Only 'user' is a verified figure:
 *   user      - you typed it for this exact date
 *   inferred  - worked out from a closing balance your bank reported, by
 *               adding or removing the transactions in between
 *   estimated - carried from a balance you typed for ANOTHER date, through
 *               the transactions in between
 * The last two are only as right as your imported transactions are complete,
 * so they're never presented as actual balances.
 */
export type OpeningSource = 'user' | 'inferred' | 'estimated'

export interface ResolvedBalance {
  amount: Cents
  source: OpeningSource
  /** The date of the figure it was worked out from (inferred/estimated). */
  basedOn: ISODate | null
}

export const OPENING_SOURCE_LABEL: Record<OpeningSource, string> = {
  user: 'User-provided',
  inferred: 'Inferred from a reported closing balance',
  estimated: 'Estimated',
}

/** One line explaining where an opening balance came from. Null = unknown. */
export function describeOpening(opening: ResolvedBalance | null): string {
  if (!opening) return 'Unknown: enter your actual opening balance'
  if (opening.source === 'user') return 'User-provided: you entered it'
  if (opening.source === 'inferred') return `Inferred from the closing balance your bank reported on ${formatDay(opening.basedOn!)}, not verified`
  return `Estimated from the balance you entered for ${formatDay(opening.basedOn!)}, not verified`
}

/**
 * What an account held at the START of `date`, or null if nothing to go on.
 *
 * Every figure is either one you typed or a known balance plus/minus the
 * transactions in between; nothing is guessed. When several are possible,
 * the one bridging the fewest days wins (fewer transactions to rely on).
 */
export function balanceAt(transactions: readonly Transaction[], account: Account, date: ISODate, points: readonly BalancePoint[]): ResolvedBalance | null {
  const exact = points.find((p) => p.id === balancePointId(account.id, date))
  if (exact) return { amount: exact.amount, source: 'user', basedOn: null }

  // Known balances, each "at the start of" a day.
  const anchors: { start: ISODate; amount: Cents; source: OpeningSource; basedOn: ISODate }[] = []
  if (account.balance !== undefined && account.balanceAsOf) {
    anchors.push({ start: closingPointDate(account.balanceAsOf), amount: account.balance, source: 'inferred', basedOn: account.balanceAsOf })
  }
  for (const p of points) if (p.accountId === account.id) anchors.push({ start: p.date, amount: p.amount, source: 'estimated', basedOn: p.date })
  const best = anchors.sort((a, b) => daysBetween(a.start, date) - daysBetween(b.start, date) || (a.source === 'inferred' ? -1 : 1))[0]
  if (!best) return null

  const mine = transactions.filter((t) => t.accountId === account.id)
  // Moving back in time removes transactions; moving forward adds them.
  const amount =
    best.start >= date
      ? best.amount - sumCents(mine.filter((t) => t.date >= date && t.date < best.start).map((t) => t.amount))
      : best.amount + sumCents(mine.filter((t) => t.date >= best.start && t.date < date).map((t) => t.amount))
  return { amount, source: best.source, basedOn: best.source === 'inferred' ? best.basedOn : best.start }
}

export interface AccountReconciliation {
  accountId: string
  accountName: string
  /** First day of the period. */
  start: ISODate
  /** Last date covered: the period's end, or the last date with data if it stops earlier. */
  throughDate: ISODate
  isPartial: boolean
  transactionCount: number
  opening: Cents | null
  openingSource: OpeningSource | null
  /** The full story of the opening balance (null = unknown). */
  openingDetail: ResolvedBalance | null
  /** Same rule as the Dashboard: the Income category, transfers excluded. */
  income: Cents
  /** Same rule as the Dashboard: spending net of refunds, transfers excluded. */
  expenses: Cents
  /** Money moved in from / out to your own other accounts. Never income or spending. */
  transfersIn: Cents
  transfersOut: Cents
  /** opening + income. Null without an opening balance. */
  totalAvailable: Cents | null
  /** opening + income − expenses + transfersIn − transfersOut. */
  expectedClosing: Cents | null
  /** Only ever a balance you typed. */
  actualClosing: Cents | null
  /** actualClosing − expectedClosing. Positive = the bank shows MORE than expected. */
  difference: Cents | null
  /**
   * True only when BOTH ends are figures you provided. With an inferred or
   * estimated opening, a zero difference proves nothing (it can be zero by
   * construction), so it's never shown as "Balanced".
   */
  verified: boolean
}

/**
 * Checks one bank account over a period (a calendar month or any custom range).
 *
 * The parts always add up EXACTLY to the account's real cash flow:
 *   income − expenses + transfersIn − transfersOut  ===  sum of every transaction
 * (income and expenses use the same category rules as the Dashboard; refunds
 * already reduce expenses; transfers are kept separate). So an opening balance
 * plus these parts lands on what the bank should show, and nothing is ever
 * counted twice or added to income to "make it balance".
 */
export function reconcileAccount(
  transactions: readonly Transaction[],
  account: Account,
  period: { current: Period; isPartial: boolean },
  points: readonly BalancePoint[],
): AccountReconciliation {
  const { current, isPartial } = period
  const inPeriod = transactions.filter((t) => t.accountId === account.id && isInPeriod(t.date, current))
  const income = sumCents(inPeriod.filter((t) => !isTransfer(t) && t.category === 'Income').map((t) => t.amount))
  const expenses = -sumCents(inPeriod.filter((t) => !isTransfer(t) && t.category !== 'Income').map((t) => t.amount)) || 0
  const transfers = inPeriod.filter(isTransfer).map((t) => t.amount)
  const transfersIn = sumCents(transfers.filter((a) => a > 0))
  const transfersOut = -sumCents(transfers.filter((a) => a < 0)) || 0

  const openingDetail = balanceAt(transactions, account, current.start, points)
  const opening = openingDetail?.amount ?? null
  const actualClosing = points.find((p) => p.id === balancePointId(account.id, closingPointDate(current.end)))?.amount ?? null
  const expectedClosing = opening === null ? null : opening + income - expenses + transfersIn - transfersOut

  return {
    accountId: account.id,
    accountName: account.name,
    start: current.start,
    throughDate: current.end,
    isPartial,
    transactionCount: inPeriod.length,
    opening,
    openingSource: openingDetail?.source ?? null,
    openingDetail,
    income,
    expenses,
    transfersIn,
    transfersOut,
    totalAvailable: opening === null ? null : opening + income,
    expectedClosing,
    actualClosing,
    difference: actualClosing !== null && expectedClosing !== null ? actualClosing - expectedClosing : null,
    verified: openingDetail?.source === 'user' && actualClosing !== null,
  }
}

export interface CombinedReconciliation {
  accountCount: number
  /** Accounts still missing an opening balance (they're left out of the totals). */
  missingOpening: string[]
  /** True only if every included opening balance is user-provided. */
  allOpeningsProvided: boolean
  opening: Cents
  income: Cents
  expenses: Cents
  /** Net transfers; moves between two of your bank accounts cancel out here. */
  transfersNet: Cents
  totalAvailable: Cents
  expectedClosing: Cents
  /** Only when every included account has an actual closing balance. */
  actualClosing: Cents | null
  difference: Cents | null
  verified: boolean
}

/** Adds up the accounts that have an opening balance. */
export function combineReconciliations(items: readonly AccountReconciliation[]): CombinedReconciliation {
  const ready = items.filter((r) => r.opening !== null)
  const allActual = ready.length > 0 && ready.every((r) => r.actualClosing !== null)
  const sum = (pick: (r: AccountReconciliation) => number) => sumCents(ready.map(pick))
  const expectedClosing = sum((r) => r.expectedClosing!)
  const actualClosing = allActual ? sum((r) => r.actualClosing!) : null
  return {
    accountCount: ready.length,
    missingOpening: items.filter((r) => r.opening === null).map((r) => r.accountName),
    allOpeningsProvided: ready.length > 0 && ready.every((r) => r.openingSource === 'user'),
    opening: sum((r) => r.opening!),
    income: sum((r) => r.income),
    expenses: sum((r) => r.expenses),
    transfersNet: sum((r) => r.transfersIn - r.transfersOut),
    totalAvailable: sum((r) => r.totalAvailable!),
    expectedClosing,
    actualClosing,
    difference: actualClosing === null ? null : actualClosing - expectedClosing,
    verified: allActual && ready.every((r) => r.verified),
  }
}

/** Plain-English reading of a difference, to help find what's wrong. */
export function explainDifference(difference: Cents, throughDate: ISODate, isPartial: boolean, verified = true): string {
  const asOf = isPartial ? ` Your data only runs to ${formatDay(throughDate)}, so compare with your balance on that date.` : ''
  if (!verified) {
    return `Can’t be verified: the opening balance isn’t one you provided, so a match here proves nothing. Enter your actual opening balance from your statement to check these transactions.${asOf}`
  }
  if (difference === 0) return `Balanced: your transactions add up exactly to your bank’s balance.${asOf}`
  const amount = formatCents(Math.abs(difference))
  return difference > 0
    ? `Your bank shows ${amount} MORE than your imported transactions explain. Usually: a deposit or refund that wasn’t imported, a purchase imported twice, or a purchase read with the wrong sign.${asOf}`
    : `Your bank shows ${amount} LESS than your imported transactions explain. Usually: a purchase, fee or withdrawal that wasn’t imported, a deposit imported twice, or a deposit read with the wrong sign.${asOf}`
}

/** The day before a period starts, for "closing balance on…" wording. */
export const dayBefore = (date: ISODate) => addDays(date, -1)
