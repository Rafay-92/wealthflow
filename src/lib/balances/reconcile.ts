import type { Account } from '../../types/account'
import { balancePointId, closingPointDate, type BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import { isInPeriod, type Period } from '../analytics/periods'
import { isTransfer } from '../analytics/summary'
import { addDays, daysBetween, formatDay, type ISODate } from '../dates'
import type { StatementBalance } from './checkpoints'
import { formatCents, sumCents, type Cents } from '../money'

/** Only bank accounts are reconciled (not credit cards). */
export function isBankAccount(account: Account): boolean {
  return account.type === 'checking' || account.type === 'savings'
}

/**
 * Where an opening balance came from:
 *   user      - you typed it for this exact date
 *   reported  - your bank reported it for this exact date (a statement's
 *               running-balance column)
 *   inferred  - worked out from a balance your bank reported on ANOTHER date,
 *               by adding or removing the transactions in between
 *   estimated - carried from a balance you typed for ANOTHER date, through
 *               the transactions in between
 * Only the first two are actual balances. The last two are only as right as
 * your imported transactions are complete, so they're never presented as actual.
 */
export type OpeningSource = 'user' | 'reported' | 'inferred' | 'estimated'

export interface ResolvedBalance {
  amount: Cents
  source: OpeningSource
  /** The date of the figure it was worked out from (inferred/estimated). */
  basedOn: ISODate | null
}

export const OPENING_SOURCE_LABEL: Record<OpeningSource, string> = {
  user: 'User-provided',
  reported: 'Bank-reported',
  inferred: 'Inferred from a reported closing balance',
  estimated: 'Estimated',
}

/** One line explaining where an opening balance came from. Null = unknown. */
export function describeOpening(opening: ResolvedBalance | null): string {
  if (!opening) return 'Unknown: enter your actual opening balance'
  if (opening.source === 'user') return 'User-provided: you entered it'
  if (opening.source === 'reported') return 'Bank-reported: from your statement’s running balance'
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
export function balanceAt(
  transactions: readonly Transaction[],
  account: Account,
  date: ISODate,
  points: readonly BalancePoint[],
  checkpoints: readonly StatementBalance[] = [],
): ResolvedBalance | null {
  const exact = points.find((p) => p.id === balancePointId(account.id, date))
  if (exact) return { amount: exact.amount, source: 'user', basedOn: null }
  const reported = reportedAt(account, date, checkpoints)
  if (reported !== null) return { amount: reported, source: 'reported', basedOn: null }

  // Known balances, each "at the start of" a day.
  const anchors: { start: ISODate; amount: Cents; source: OpeningSource; basedOn: ISODate }[] = []
  if (account.balance !== undefined && account.balanceAsOf) {
    anchors.push({ start: closingPointDate(account.balanceAsOf), amount: account.balance, source: 'inferred', basedOn: account.balanceAsOf })
  }
  for (const c of checkpoints) if (c.accountId === account.id) anchors.push({ start: c.date, amount: c.amount, source: 'inferred', basedOn: addDays(c.date, -1) })
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

/**
 * A balance your bank reported for the start of `date`: a statement
 * checkpoint, or the account's reported balance when it's for the day before.
 * The most recent import wins if two statements cover the same day.
 */
export function reportedAt(account: Account, date: ISODate, checkpoints: readonly StatementBalance[]): Cents | null {
  const found = checkpoints.filter((c) => c.accountId === account.id && c.date === date).at(-1)
  if (found) return found.amount
  if (account.balance !== undefined && account.balanceAsOf && addDays(account.balanceAsOf, 1) === date) return account.balance
  return null
}

/** A day where the bank's balance and the calculated one disagree. */
export interface BalanceMismatch {
  /** The day whose closing balance differs. */
  date: ISODate
  reported: Cents
  calculated: Cents
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
  /** A balance you typed, or else the one your bank reported for the end of the period. */
  actualClosing: Cents | null
  closingSource: 'user' | 'reported' | null
  /** How many bank-reported daily balances inside the period were checked against the calculation. */
  checkpointsChecked: number
  /** The ones that didn't match. */
  mismatches: BalanceMismatch[]
  /** actualClosing − expectedClosing. Positive = the bank shows MORE than expected. */
  difference: Cents | null
  /**
   * True only when both ends are actual balances (typed by you or reported by
   * your bank). With an inferred or estimated opening, a zero difference proves
   * nothing (it can be zero by construction), so it's never shown as "Balanced".
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
  checkpoints: readonly StatementBalance[] = [],
): AccountReconciliation {
  const { current, isPartial } = period
  const inPeriod = transactions.filter((t) => t.accountId === account.id && isInPeriod(t.date, current))
  const income = sumCents(inPeriod.filter((t) => !isTransfer(t) && t.category === 'Income').map((t) => t.amount))
  const expenses = -sumCents(inPeriod.filter((t) => !isTransfer(t) && t.category !== 'Income').map((t) => t.amount)) || 0
  const transfers = inPeriod.filter(isTransfer).map((t) => t.amount)
  const transfersIn = sumCents(transfers.filter((a) => a > 0))
  const transfersOut = -sumCents(transfers.filter((a) => a < 0)) || 0

  const openingDetail = balanceAt(transactions, account, current.start, points, checkpoints)
  const opening = openingDetail?.amount ?? null
  const closingDate = closingPointDate(current.end)
  const typedClosing = points.find((p) => p.id === balancePointId(account.id, closingDate))?.amount ?? null
  const reportedClosing = reportedAt(account, closingDate, checkpoints)
  const actualClosing = typedClosing ?? reportedClosing
  const expectedClosing = opening === null ? null : opening + income - expenses + transfersIn - transfersOut

  // Every bank-reported balance inside the period, compared with opening + transactions so far.
  const mismatches: BalanceMismatch[] = []
  let checkpointsChecked = 0
  if (opening !== null) {
    const dates = [...new Set(checkpoints.filter((c) => c.accountId === account.id && c.date > current.start && c.date <= closingDate).map((c) => c.date))].sort()
    for (const date of dates) {
      const reported = reportedAt(account, date, checkpoints)!
      const calculated = opening + sumCents(inPeriod.filter((t) => t.date < date).map((t) => t.amount))
      checkpointsChecked++
      if (reported !== calculated) mismatches.push({ date: addDays(date, -1), reported, calculated })
    }
  }
  const actualEnds = (s: OpeningSource | undefined) => s === 'user' || s === 'reported'

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
    closingSource: typedClosing !== null ? 'user' : reportedClosing !== null ? 'reported' : null,
    checkpointsChecked,
    mismatches,
    difference: actualClosing !== null && expectedClosing !== null ? actualClosing - expectedClosing : null,
    verified: actualEnds(openingDetail?.source) && actualClosing !== null,
  }
}

export interface CombinedReconciliation {
  accountCount: number
  /** Accounts still missing an opening balance (they're left out of the totals). */
  missingOpening: string[]
  /** True only if every included opening balance is an actual one (typed or bank-reported). */
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
    allOpeningsProvided: ready.length > 0 && ready.every((r) => r.openingSource === 'user' || r.openingSource === 'reported'),
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
    return `Can’t be verified: the opening balance is inferred or estimated, not an actual balance, so a match here proves nothing. Enter your actual opening balance from your statement to check these transactions.${asOf}`
  }
  if (difference === 0) return `Balanced: your transactions add up exactly to your bank’s balance.${asOf}`
  const amount = formatCents(Math.abs(difference))
  return difference > 0
    ? `Your bank shows ${amount} MORE than your imported transactions explain. Usually: a deposit or refund that wasn’t imported, a purchase imported twice, or a purchase read with the wrong sign.${asOf}`
    : `Your bank shows ${amount} LESS than your imported transactions explain. Usually: a purchase, fee or withdrawal that wasn’t imported, a deposit imported twice, or a deposit read with the wrong sign.${asOf}`
}

/** The day before a period starts, for "closing balance on…" wording. */
export const dayBefore = (date: ISODate) => addDays(date, -1)
