import { AlertTriangle, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { DATE_FORMAT_LABELS, detectDateFormat } from '../../lib/csv/dateFormats'
import { mappingProblems } from '../../lib/csv/detectColumns'
import { normalizeRows } from '../../lib/csv/normalize'
import { columnHeaders, isBlankRow, NO_HEADER } from '../../lib/csv/parseCsv'
import { formatDay } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import type { Account, AccountType } from '../../types/account'
import { DATE_FORMATS, type ColumnMapping, type DateFormat } from '../../types/import'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import type { AccountChoice } from './types'

interface ColumnMapperProps {
  fileName: string
  rows: readonly string[][]
  headerRow: number
  onHeaderRowChange: (row: number) => void
  mapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
  accounts: readonly Account[]
  account: AccountChoice
  onAccountChange: (choice: AccountChoice) => void
  remember: boolean
  onRememberChange: (remember: boolean) => void
  usedSavedMapping: boolean
  /** True when "Flip signs" was ticked by detection rather than by the user. */
  autoFlipped: boolean
  manualBalance: string
  onManualBalanceChange: (value: string) => void
  manualBalanceError: string | null
  onBack: () => void
  onContinue: () => void
}

const PREVIEW_ROWS = 5
const fieldClass =
  'w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-ink transition-colors hover:border-ink-faint focus:border-positive focus:outline-none'

export function ColumnMapper(props: ColumnMapperProps) {
  const { rows, headerRow, mapping, onMappingChange, account } = props
  const headers = useMemo(() => columnHeaders(rows, headerRow), [rows, headerRow])
  const dataRows = useMemo(() => rows.slice(headerRow + 1), [rows, headerRow])
  const contentRows = useMemo(() => dataRows.filter((r) => !isBlankRow(r)), [dataRows])
  const set = (patch: Partial<ColumnMapping>) => onMappingChange({ ...mapping, ...patch })

  const problems = mappingProblems(mapping)
  const accountProblem = account.mode === 'new' && account.name.trim() === '' ? 'Name the new account.' : null

  const dateAmbiguous = useMemo(() => {
    if (mapping.dateColumn === null) return false
    const values = dataRows.map((r) => r[mapping.dateColumn!] ?? '')
    return detectDateFormat(values).ambiguous && (mapping.dateFormat.startsWith('MM') || mapping.dateFormat.startsWith('DD'))
  }, [dataRows, mapping.dateColumn, mapping.dateFormat])

  // Run the real conversion on the first few rows so you can check the result.
  // (Reads a few extra rows in case some are blank, then keeps the first few results.)
  const preview = useMemo(() => {
    if (problems.length > 0) return null
    const { drafts, errors } = normalizeRows(dataRows.slice(0, PREVIEW_ROWS * 4), mapping, headerRow + 2)
    return { drafts: drafts.slice(0, PREVIEW_ROWS), errors: errors.slice(0, 3) }
  }, [dataRows, mapping, headerRow, problems.length])

  // Count money in vs out across the WHOLE file, so a sign problem can't hide below the preview.
  const signCheck = useMemo(() => {
    if (problems.length > 0) return null
    const { drafts } = normalizeRows(dataRows, mapping, headerRow + 2)
    return { moneyIn: drafts.filter((d) => d.amount > 0).length, moneyOut: drafts.filter((d) => d.amount < 0).length }
  }, [dataRows, mapping, headerRow, problems.length])

  const columnOptions = headers.map((h, i) => ({ value: i, label: h || `Column ${i + 1}` }))
  const roleOf = (i: number): string | null =>
    i === mapping.dateColumn ? 'Date'
    : i === mapping.descriptionColumn ? 'Description'
    : i === mapping.typeColumn ? 'Debit/Credit'
    : i === mapping.amountColumn ? 'Amount'
    : i === mapping.debitColumn ? 'Money out'
    : i === mapping.creditColumn ? 'Money in'
    : i === mapping.balanceColumn ? 'Balance'
    : null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Match the columns</h2>
          <p className="text-sm text-ink-muted">
            {props.fileName} · {contentRows.length.toLocaleString()} rows
          </p>
        </div>
        {props.usedSavedMapping && (
          <p className="flex items-center gap-1.5 rounded-lg bg-positive-soft px-3 py-1.5 text-xs font-medium text-positive">
            <Sparkles aria-hidden className="size-3.5" /> Using your saved settings for this file layout
          </p>
        )}
      </div>

      {/* Raw preview of the file, with the role of each column above it. */}
      <Card className="overflow-hidden p-0">
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-navy-600/60">
                {headers.map((h, i) => {
                  const role = roleOf(i)
                  return (
                    <th key={i} className="px-4 pt-3 pb-2.5 align-bottom font-medium whitespace-nowrap">
                      <span className={`mb-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] ${role ? 'bg-positive-soft text-positive' : 'text-ink-faint'}`}>
                        {role ?? 'Not used'}
                      </span>
                      <span className="block text-ink">{h || `Column ${i + 1}`}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="text-ink-muted">
              {contentRows.slice(0, PREVIEW_ROWS).map((row, r) => (
                <tr key={r} className="border-b border-navy-600/30 last:border-0">
                  {headers.map((_, i) => (
                    <td key={i} className={`max-w-64 truncate px-4 py-2 whitespace-nowrap ${roleOf(i) ? '' : 'opacity-50'}`}>
                      {row[i]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-5">
          <Field label="Header row" hint="The row with the column names. Change it if your bank adds lines above the table.">
            <select className={fieldClass} value={headerRow} onChange={(e) => props.onHeaderRowChange(Number(e.target.value))}>
              <option value={NO_HEADER}>No header row (transactions start on row 1)</option>
              {rows.slice(0, 10).map((row, i) => (
                <option key={i} value={i}>
                  Row {i + 1}: {row.slice(0, 3).join(', ').slice(0, 50)}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Date">
              <ColumnSelect value={mapping.dateColumn} options={columnOptions} onChange={(v) => set({ dateColumn: v })} />
            </Field>
            <Field label="Date format">
              <select className={fieldClass} value={mapping.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as DateFormat })}>
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {DATE_FORMAT_LABELS[f]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {dateAmbiguous && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              Every day in this file is 12 or lower, so 03/11 could be March 11 or 3 November. Check the dates in the
              preview and change the format if they're wrong.
            </p>
          )}

          <Field label="Description">
            <ColumnSelect value={mapping.descriptionColumn} options={columnOptions} onChange={(v) => set({ descriptionColumn: v })} />
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Amounts</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Radio checked={mapping.amountMode === 'single'} onChange={() => set({ amountMode: 'single' })} label="One amount column" hint="e.g. -12.50 and 2,450.00" />
              <Radio checked={mapping.amountMode === 'split'} onChange={() => set({ amountMode: 'split' })} label="Separate in & out columns" hint="e.g. Debit and Credit" />
            </div>
          </fieldset>

          {mapping.amountMode === 'single' ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Amount">
                <ColumnSelect value={mapping.amountColumn} options={columnOptions} onChange={(v) => set({ amountColumn: v })} />
              </Field>
              <Field label="Debit / Credit column" hint="If your bank writes “Debit” or “Credit” next to every amount (e.g. Scotiabank).">
                <ColumnSelect value={mapping.typeColumn ?? null} options={columnOptions} onChange={(v) => set({ typeColumn: v, invertAmounts: v === null ? mapping.invertAmounts : false })} optional />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Money out (debit)">
                <ColumnSelect value={mapping.debitColumn} options={columnOptions} onChange={(v) => set({ debitColumn: v })} />
              </Field>
              <Field label="Money in (credit)">
                <ColumnSelect value={mapping.creditColumn} options={columnOptions} onChange={(v) => set({ creditColumn: v })} />
              </Field>
            </div>
          )}

          <Field label="Balance column" hint="Optional. If present, we'll show the account's latest balance.">
            <ColumnSelect value={mapping.balanceColumn} options={columnOptions} onChange={(v) => set({ balanceColumn: v })} optional />
          </Field>

          {mapping.balanceColumn === null && (
            <Field
              label="Balance today (optional)"
              hint="This file has no balance column. Type your account balance as of the last transaction to show it on the Dashboard."
            >
              <input
                className={fieldClass}
                inputMode="decimal"
                placeholder="e.g. 4,218.36"
                value={props.manualBalance}
                onChange={(e) => props.onManualBalanceChange(e.target.value)}
                aria-invalid={Boolean(props.manualBalanceError)}
              />
              {props.manualBalanceError && <span className="mt-1 block text-xs text-negative">{props.manualBalanceError}</span>}
            </Field>
          )}

          <Field label="Number format" hint="French-language exports (e.g. from Quebec banks) use a comma for cents.">
            <select
              className={fieldClass}
              value={mapping.decimalComma ? 'comma' : 'point'}
              onChange={(e) => set({ decimalComma: e.target.value === 'comma' })}
            >
              <option value="point">1,234.56 (English)</option>
              <option value="comma">1 234,56 (French)</option>
            </select>
          </Field>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-positive" checked={mapping.invertAmounts} onChange={(e) => set({ invertAmounts: e.target.checked })} />
            <span>
              Flip signs
              <span className="block text-xs text-ink-faint">Tick this if purchases show as positive numbers (common in credit card exports).</span>
            </span>
          </label>
          {mapping.invertAmounts && props.autoFlipped && (
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5 text-xs text-warning">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              Ticked automatically: almost every amount in this file is positive, which usually means purchases are listed as
              positive. Check the preview: spending should show with a minus sign.
            </p>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <AccountPicker accounts={props.accounts} value={account} onChange={props.onAccountChange} />
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-positive" checked={props.remember} onChange={(e) => props.onRememberChange(e.target.checked)} />
              <span>
                Remember these settings
                <span className="block text-xs text-ink-faint">Next time you import a file with the same columns, this is filled in for you.</span>
              </span>
            </label>
          </Card>

          <Card>
            <h3 className="font-medium">How it will be read</h3>
            <p className="mb-3 text-xs text-ink-faint">Check the dates and that spending shows as negative.</p>
            {signCheck && (
              <p className="mb-3 text-xs text-ink-muted tabular">
                Whole file: <span className="text-ink">{signCheck.moneyOut}</span> money out (−) · <span className="text-positive">{signCheck.moneyIn}</span> money in (+)
              </p>
            )}
            {signCheck && signCheck.moneyOut === 0 && signCheck.moneyIn > 1 && (
              <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-negative/40 bg-negative-soft px-3 py-2.5 text-xs text-negative">
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                Every transaction is being read as money IN, so your spending would count as income. If your bank writes “Debit” /
                “Credit” in a column, choose it under “Debit / Credit column”. Otherwise tick “Flip signs”.
              </p>
            )}
            {preview ? (
              <ul className="divide-y divide-navy-600/40 text-sm">
                {preview.drafts.map((d) => (
                  <li key={d.rowNumber} className="flex items-center gap-3 py-2">
                    <span className="w-14 shrink-0 text-ink-faint tabular">{formatDay(d.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{d.description}</span>
                    <span className={`shrink-0 tabular ${d.amount > 0 ? 'text-positive' : ''}`}>{formatCents(d.amount, { signed: true })}</span>
                  </li>
                ))}
                {preview.errors.map((e) => (
                  <li key={e.rowNumber} className="py-2 text-xs text-negative">
                    Row {e.rowNumber}: {e.message}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="list-inside list-disc text-sm text-ink-muted">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={props.onBack}>
          <ArrowLeft aria-hidden className="size-4" /> Choose a different file
        </Button>
        <div className="flex items-center gap-3">
          {accountProblem && problems.length === 0 && <span className="text-sm text-ink-faint">{accountProblem}</span>}
          <Button variant="primary" onClick={props.onContinue} disabled={problems.length > 0 || accountProblem !== null || props.manualBalanceError !== null}>
            Review transactions <ArrowRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-faint">{hint}</span>}
    </label>
  )
}

function ColumnSelect({
  value,
  options,
  onChange,
  optional,
}: {
  value: number | null
  options: { value: number; label: string }[]
  onChange: (value: number | null) => void
  optional?: boolean
}) {
  return (
    <select className={fieldClass} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}>
      <option value="">{optional ? 'None' : 'Choose a column…'}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Radio({ checked, onChange, label, hint }: { checked: boolean; onChange: () => void; label: string; hint: string }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors ${checked ? 'border-positive/60 bg-positive-soft' : 'border-navy-600 hover:border-ink-faint'}`}>
      <input type="radio" className="mt-0.5 accent-positive" checked={checked} onChange={onChange} />
      <span>
        {label}
        <span className="block text-xs text-ink-faint">{hint}</span>
      </span>
    </label>
  )
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Chequing' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit card' },
]

function AccountPicker({ accounts, value, onChange }: { accounts: readonly Account[]; value: AccountChoice; onChange: (c: AccountChoice) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Field label="Which account is this statement for?" hint="Used to spot duplicates and, later, transfers between your accounts.">
        <select
          className={fieldClass}
          value={value.mode === 'existing' ? value.accountId : '__new'}
          onChange={(e) =>
            onChange(e.target.value === '__new' ? { mode: 'new', name: '', type: 'checking' } : { mode: 'existing', accountId: e.target.value })
          }
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          <option value="__new">+ New account…</option>
        </select>
      </Field>
      {value.mode === 'new' && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className={fieldClass}
            placeholder="Account name, e.g. Everyday Chequing"
            value={value.name}
            maxLength={60}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            aria-label="New account name"
          />
          <select className={fieldClass} value={value.type} onChange={(e) => onChange({ ...value, type: e.target.value as AccountType })} aria-label="Account type">
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
