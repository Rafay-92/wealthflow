import { AlertTriangle, CheckCircle2, HelpCircle, Pencil } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { ResolvedPeriod } from '../../lib/analytics/reportPeriod'
import {
  combineReconciliations,
  describeOpening,
  explainDifference,
  isBankAccount,
  OPENING_SOURCE_LABEL,
  reconcileAccount,
  type AccountReconciliation,
  type OpeningSource,
} from '../../lib/balances/reconcile'
import { addDays, formatDay, type ISODate } from '../../lib/dates'
import { formatCents, parseAmountToCents, type Cents } from '../../lib/money'
import type { Account } from '../../types/account'
import type { BalancePoint } from '../../types/balance'
import type { Transaction } from '../../types/transaction'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/fieldClass'

/** undefined = leave as it is; null = remove. */
export interface BalanceValues {
  opening?: Cents | null
  actualClosing: Cents | null
}

interface BalanceCheckProps {
  transactions: readonly Transaction[]
  accounts: readonly Account[]
  period: ResolvedPeriod
  points: readonly BalancePoint[]
  onSave: (accountId: string, values: BalanceValues) => Promise<void>
}

const SOURCE_BADGE: Record<OpeningSource | 'unknown', string> = {
  user: 'bg-positive-soft text-positive',
  inferred: 'bg-warning-soft text-warning',
  estimated: 'bg-warning-soft text-warning',
  unknown: 'bg-navy-700 text-ink-muted',
}

function SourceBadge({ source }: { source: OpeningSource | null }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${SOURCE_BADGE[source ?? 'unknown']}`} data-testid="opening-source">
      {source ? OPENING_SOURCE_LABEL[source] : 'Unknown'}
    </span>
  )
}

/**
 * Opening balance → expected closing balance → compared with the bank,
 * for the period on screen (a calendar month or a custom range).
 * One card per bank account (chequing/savings), plus a combined total.
 */
export function BalanceCheck({ transactions, accounts, period, points, onSave }: BalanceCheckProps) {
  const bankAccounts = accounts.filter(isBankAccount)
  if (bankAccounts.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-faint">Import a chequing or savings statement to check its balance.</p>
  }
  const items = bankAccounts.map((a) => reconcileAccount(transactions, a, period, points))
  const combined = combineReconciliations(items)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <AccountCard key={item.accountId} item={item} period={period} onSave={(values) => onSave(item.accountId, values)} />
      ))}
      {items.length > 1 && (
        <div className="rounded-xl border border-navy-600/60 bg-navy-900/60 p-4">
          <h3 className="font-medium">All bank accounts</h3>
          <p className="mb-3 text-xs text-ink-faint">
            {combined.accountCount} of {items.length} accounts included
            {combined.missingOpening.length > 0 && ` · add an opening balance for ${combined.missingOpening.join(', ')} to include it`}
            {combined.accountCount > 0 && !combined.allOpeningsProvided && ' · some opening balances are inferred or estimated, not verified'}
          </p>
          {combined.accountCount > 0 && (
            <dl className="text-sm">
              <Line label="Opening balances" value={combined.opening} />
              <Line label="+ Income" value={combined.income} />
              <Line label="= Total available funds" value={combined.totalAvailable} strong />
              <Line label="− Expenses" value={combined.expenses} />
              <Line label="± Transfers (net)" value={combined.transfersNet} hint="Moves between your own bank accounts cancel out" />
              <Line label="= Expected closing" value={combined.expectedClosing} strong />
              {combined.actualClosing !== null && <Line label="Actual closing" value={combined.actualClosing} />}
            </dl>
          )}
          {combined.difference !== null && (
            <DifferenceNote difference={combined.difference} throughDate={items[0]!.throughDate} isPartial={items[0]!.isPartial} verified={combined.verified} />
          )}
        </div>
      )}
    </div>
  )
}

function AccountCard({ item, period, onSave }: { item: AccountReconciliation; period: ResolvedPeriod; onSave: (v: BalanceValues) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const start = formatDay(item.start)
  const asOf = formatDay(item.throughDate)
  const reviewLink = `/transactions?from=${item.start}&to=${item.throughDate}&account=${item.accountId}`

  return (
    <div className="rounded-xl border border-navy-600/60 bg-navy-900/60 p-4" data-testid={`balance-check-${item.accountId}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-medium">{item.accountName}</h3>
          <p className="text-xs text-ink-faint">
            {item.transactionCount} transactions · {start}–{asOf}
            {item.isPartial && (period.kind === 'month' ? ' (month to date)' : ' (your data stops here)')}
          </p>
        </div>
        {!editing && (
          <Button variant="ghost" className="shrink-0 px-2.5 py-1.5" onClick={() => setEditing(true)} aria-label={`Edit balances for ${item.accountName}`}>
            <Pencil aria-hidden className="size-3.5" /> Edit
          </Button>
        )}
      </div>

      {editing ? (
        <BalanceForm item={item} start={start} asOf={asOf} onCancel={() => setEditing(false)} onSave={async (v) => { await onSave(v); setEditing(false) }} />
      ) : item.opening === null ? (
        <div className="text-sm text-ink-muted">
          <p className="mb-1">
            Opening balance on {start}: <SourceBadge source={null} />
          </p>
          <p>Enter what this account held at the start of {start} to see where it should end the period.</p>
          <Button className="mt-3" onClick={() => setEditing(true)}>
            Add opening balance
          </Button>
        </div>
      ) : (
        <>
          <dl className="text-sm">
            <Line
              label={`Opening balance (${start})`}
              value={item.opening}
              badge={<SourceBadge source={item.openingSource} />}
              hint={describeOpening(item.openingDetail)}
            />
            <Line label="+ Income" value={item.income} />
            <Line label="= Total available funds" value={item.totalAvailable!} strong />
            <Line label="− Expenses" value={item.expenses} hint="Refunds already subtracted" />
            {(item.transfersIn !== 0 || item.transfersOut !== 0) && (
              <Line
                label="± Transfers"
                value={item.transfersIn - item.transfersOut}
                hint={`${formatCents(item.transfersIn)} in, ${formatCents(item.transfersOut)} out · between your own accounts, not income or spending`}
              />
            )}
            <Line label={`= Expected closing (${asOf})`} value={item.expectedClosing!} strong />
            <Line label="Actual closing (bank statement)" value={item.actualClosing} placeholder="Not entered" />
          </dl>
          {item.openingSource !== 'user' && item.actualClosing === null && (
            <p className="mt-3 flex items-start gap-2 text-xs text-ink-faint">
              <HelpCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              This expected closing is built on a balance that isn’t verified. Enter your actual opening balance to rely on it.
            </p>
          )}
          {item.difference !== null && (
            <DifferenceNote difference={item.difference} throughDate={item.throughDate} isPartial={item.isPartial} verified={item.verified} reviewLink={reviewLink} />
          )}
        </>
      )}
    </div>
  )
}

function BalanceForm({ item, start, asOf, onSave, onCancel }: { item: AccountReconciliation; start: string; asOf: string; onSave: (v: BalanceValues) => Promise<void>; onCancel: () => void }) {
  const toText = (c: Cents | null) => (c === null ? '' : (c / 100).toFixed(2))
  const [opening, setOpening] = useState(toText(item.opening))
  /** Whether you typed in the opening field. Retyping the same figure from your statement confirms it. */
  const [openingTyped, setOpeningTyped] = useState(false)
  const [closing, setClosing] = useState(toText(item.actualClosing))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nextDay = formatDay(addDays(item.throughDate as ISODate, 1))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const read = (text: string) => (text.trim() === '' ? null : parseAmountToCents(text))
    const typedOpening = read(opening)
    const c = read(closing)
    if (opening.trim() && typedOpening === null) return setError('The opening balance isn’t a valid amount, e.g. 5,000.00')
    if (closing.trim() && c === null) return setError('The closing balance isn’t a valid amount, e.g. 7,860.60')
    // An inferred or estimated figure you didn't touch stays what it is. Saving
    // it would turn an unverified number into "User-provided".
    const untouchedSuggestion = item.openingSource !== 'user' && !openingTyped
    setBusy(true)
    try {
      await onSave({ opening: untouchedSuggestion ? undefined : typedOpening, actualClosing: c })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 text-sm" noValidate>
      <label className="block">
        <span className="mb-1 block font-medium">Actual opening balance on {start}</span>
        <input className={`${fieldClass} w-full`} inputMode="decimal" placeholder="e.g. 5,000.00" value={opening} onChange={(e) => { setOpening(e.target.value); setOpeningTyped(true) }} />
        <span className="mt-1 block text-xs text-ink-faint">
          From your statement: the balance before {start}’s first transaction. Use a minus sign if overdrawn.
          {item.openingSource && item.openingSource !== 'user' && ` The figure shown is ${OPENING_SOURCE_LABEL[item.openingSource].toLowerCase()}; leave it to keep it unverified, or type your real balance.`}
        </span>
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Actual closing balance on {asOf} (optional)</span>
        <input className={`${fieldClass} w-full`} inputMode="decimal" placeholder="From your bank statement" value={closing} onChange={(e) => setClosing(e.target.value)} />
        <span className="mt-1 block text-xs text-ink-faint">This is also the opening balance for {nextDay}.</span>
      </label>
      {error && (
        <p role="alert" className="text-xs text-negative">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-faint">These balances are only used for this check. They’re never counted as income.</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          Save balances
        </Button>
      </div>
    </form>
  )
}

function Line({ label, value, hint, strong, placeholder, badge }: { label: string; value: Cents | null; hint?: string; strong?: boolean; placeholder?: string; badge?: ReactNode }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'border-t border-navy-600/40 font-medium' : ''}`}>
      <dt className="min-w-0">
        <span className={strong ? 'text-ink' : 'text-ink-muted'}>{label}</span>
        {badge && <span className="ml-2">{badge}</span>}
        {hint && <span className="block text-[11px] text-ink-faint">{hint}</span>}
      </dt>
      <dd className={`shrink-0 tabular ${value === null ? 'text-ink-faint' : ''}`}>{value === null ? placeholder : formatCents(value)}</dd>
    </div>
  )
}

function DifferenceNote({ difference, throughDate, isPartial, verified, reviewLink }: { difference: Cents; throughDate: ISODate; isPartial: boolean; verified: boolean; reviewLink?: string }): ReactNode {
  const balanced = verified && difference === 0
  const tone = balanced ? 'bg-positive-soft text-positive' : verified ? 'border border-warning/40 bg-warning-soft text-warning' : 'border border-navy-600 bg-navy-800 text-ink-muted'
  return (
    <div role="status" className={`mt-3 rounded-lg px-3 py-2.5 text-xs ${tone}`}>
      <p className="flex items-start gap-2">
        {balanced ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : verified ? <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> : <HelpCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
        <span>
          {!balanced && <span className="font-semibold">Difference: {formatCents(difference, { signed: true })}. </span>}
          {explainDifference(difference, throughDate, isPartial, verified)}
        </span>
      </p>
      {verified && !balanced && reviewLink && (
        <Link to={reviewLink} className="mt-2 inline-block font-medium underline underline-offset-2">
          Review this account’s transactions for the period
        </Link>
      )}
    </div>
  )
}
