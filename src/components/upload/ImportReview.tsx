import { AlertCircle, ArrowLeft, Check } from 'lucide-react'
import { useState } from 'react'
import type { PreparedImport } from '../../lib/csv/prepareImport'
import { formatDay } from '../../lib/dates'
import { formatCents, sumCents } from '../../lib/money'
import type { DraftStatus } from '../../types/import'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

interface ImportReviewProps {
  prepared: PreparedImport
  selected: ReadonlySet<number>
  onToggle: (index: number) => void
  onSelect: (indexes: number[]) => void
  accountName: string
  busy: boolean
  error: string | null
  onBack: () => void
  onImport: () => void
}

const STATUS_BADGES: Record<DraftStatus, { label: string; className: string; explain: string }> = {
  new: { label: 'New', className: 'bg-positive-soft text-positive', explain: '' },
  duplicate: {
    label: 'Already imported',
    className: 'bg-navy-700 text-ink-muted',
    explain: 'Matches a transaction you imported before (same account, date, amount and description).',
  },
  repeat: {
    label: 'Repeated in file',
    className: 'bg-warning-soft text-warning',
    explain: 'Identical to another row in this file. Often genuine (two coffees on the same day), so it’s kept.',
  },
}

const INITIAL_ROWS = 100

export function ImportReview(props: ImportReviewProps) {
  const { prepared, selected } = props
  const [showAll, setShowAll] = useState(false)
  const rows = prepared.rows
  const visible = showAll ? rows : rows.slice(0, INITIAL_ROWS)

  const count = (status: DraftStatus) => rows.filter((r) => r.status === status).length
  const chosen = rows.filter((_, i) => selected.has(i)).map((r) => r.draft.amount)
  const moneyIn = sumCents(chosen.filter((a) => a > 0))
  const moneyOut = -sumCents(chosen.filter((a) => a < 0))
  const allIndexes = rows.map((_, i) => i)
  const allSelected = selected.size === rows.length && rows.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Review before importing</h2>
        <p className="text-sm text-ink-muted">
          Into <span className="text-ink">{props.accountName}</span>. Untick anything you don't want.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="New" value={count('new')} />
        <Stat label="Already imported" value={count('duplicate')} hint="Skipped" />
        <Stat label="Repeated in file" value={count('repeat')} hint="Kept" />
        <Stat label="Couldn't read" value={prepared.errors.length} hint="Skipped" tone={prepared.errors.length > 0 ? 'bad' : undefined} />
      </div>

      {prepared.errors.length > 0 && (
        <details className="rounded-xl border border-negative/30 bg-negative-soft/40 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-negative">
            {prepared.errors.length} {prepared.errors.length === 1 ? 'row' : 'rows'} couldn't be read and will be skipped
          </summary>
          <ul className="mt-3 flex max-h-56 flex-col gap-1 overflow-y-auto text-ink-muted">
            {prepared.errors.map((e) => (
              <li key={e.rowNumber}>
                <span className="text-ink tabular">Row {e.rowNumber}:</span> {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-navy-600/60 px-4 py-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="size-4 accent-positive"
              checked={allSelected}
              onChange={() => props.onSelect(allSelected ? [] : allIndexes)}
            />
            Select all
          </label>
          <span className="text-ink-faint">
            {selected.size} of {rows.length} selected
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-ink-faint">No readable transactions in this file.</p>
        ) : (
          <ul className="divide-y divide-navy-600/30">
            {visible.map((row, i) => {
              const badge = STATUS_BADGES[row.status]
              return (
                <li key={row.draft.rowNumber}>
                  <label className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-navy-700/30 ${selected.has(i) ? '' : 'opacity-50'}`}>
                    <input type="checkbox" className="size-4 shrink-0 accent-positive" checked={selected.has(i)} onChange={() => props.onToggle(i)} />
                    <span className="w-14 shrink-0 text-ink-faint tabular">{formatDay(row.draft.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{row.draft.description}</span>
                    {row.status !== 'new' && (
                      <span title={badge.explain} className={`hidden shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:inline ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                    <span className={`w-24 shrink-0 text-right tabular ${row.draft.amount > 0 ? 'text-positive' : ''}`}>
                      {formatCents(row.draft.amount, { signed: true })}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {!showAll && rows.length > INITIAL_ROWS && (
          <button type="button" onClick={() => setShowAll(true)} className="w-full border-t border-navy-600/60 py-3 text-sm font-medium text-ink-muted hover:text-ink">
            Show all {rows.length.toLocaleString()} rows
          </button>
        )}
      </Card>

      {prepared.closing && (
        <p className="text-sm text-ink-muted">
          The account balance will be updated to <span className="text-ink tabular">{formatCents(prepared.closing.balance)}</span> as of{' '}
          {formatDay(prepared.closing.asOf)}, from the statement's balance column.
        </p>
      )}

      {props.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-negative-soft px-4 py-3 text-sm text-negative">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {props.error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={props.onBack} disabled={props.busy}>
          <ArrowLeft aria-hidden className="size-4" /> Back to columns
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <p className="text-sm text-ink-faint tabular">
            In <span className="text-positive">{formatCents(moneyIn)}</span> · Out <span className="text-ink">{formatCents(moneyOut)}</span>
          </p>
          <Button variant="primary" onClick={props.onImport} disabled={props.busy || selected.size === 0}>
            <Check aria-hidden className="size-4" />
            {props.busy ? 'Importing…' : `Import ${selected.size.toLocaleString()} ${selected.size === 1 ? 'transaction' : 'transactions'}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'bad' }) {
  return (
    <div className="rounded-xl border border-navy-600/50 bg-navy-800 px-4 py-3">
      <p className="text-xs text-ink-faint">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular ${tone === 'bad' ? 'text-negative' : ''}`}>
        {value.toLocaleString()}
        {hint && value > 0 && <span className="ml-1.5 text-xs font-normal text-ink-faint">{hint}</span>}
      </p>
    </div>
  )
}
