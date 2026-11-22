import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { initialFormValues, MAX_DESCRIPTION_LENGTH, readTransactionForm, type TransactionFormValues } from '../../lib/transactionForm'
import type { Account, AccountType } from '../../types/account'
import { CATEGORIES, type Transaction, type TransactionInput } from '../../types/transaction'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/fieldClass'

interface TransactionFormProps {
  /** null = adding a new transaction. */
  transaction: Transaction | null
  accounts: readonly Account[]
  defaults: { date: string; accountId: string }
  onSave: (input: TransactionInput) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Chequing' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit card' },
]

/**
 * Add or edit one transaction, in a native <dialog> (focus trap, Escape, backdrop).
 * Mount it only while open: each opening starts from fresh values.
 */
export function TransactionForm({ transaction, accounts, defaults, onSave, onDelete, onClose }: TransactionFormProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [values, setValues] = useState<TransactionFormValues>(() =>
    initialFormValues(transaction, { ...defaults, accountId: defaults.accountId || (accounts.length === 0 ? 'new' : (accounts[0]?.id ?? 'new')) }),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editing = transaction !== null
  const set = (patch: Partial<TransactionFormValues>) => setValues((v) => ({ ...v, ...patch }))

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch (e) {
      console.error('[WealthFlow] Saving a transaction failed', e)
      setError('Saving failed, so nothing changed. Please try again.')
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const result = readTransactionForm(values)
    if ('error' in result) return setError(result.error)
    setError(null)
    void run(() => onSave(result.input))
  }

  const labelClass = 'mb-1 block text-xs font-medium text-ink-muted'

  return (
    <dialog
      ref={ref}
      aria-labelledby="tx-form-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-navy-600 bg-navy-800 p-6 text-ink shadow-2xl backdrop:bg-navy-950/75 backdrop:backdrop-blur-sm"
    >
      <h2 id="tx-form-title" className="text-lg font-semibold">
        {editing ? 'Edit transaction' : 'Add transaction'}
      </h2>
      {editing && transaction.importId && (
        <p className="mt-1 text-xs text-ink-faint">Imported from your bank. If you import the same statement again, it’s still recognised, so it won’t be duplicated.</p>
      )}

      {confirmDelete ? (
        <div className="mt-4 text-sm">
          <p className="text-ink-muted">
            Delete “{transaction?.description}”? Every total, chart, budget and balance will update.
            {transaction?.importId && ' Re-importing the same statement won’t bring it back.'}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Keep it
            </Button>
            <Button variant="danger" onClick={() => onDelete && void run(onDelete)} disabled={busy} autoFocus>
              {busy ? 'Deleting…' : 'Delete transaction'}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4 text-sm">
          <fieldset>
            <legend className={labelClass}>Type</legend>
            <div className="inline-flex rounded-lg border border-navy-600 bg-navy-900 p-0.5">
              {(['out', 'in'] as const).map((d) => (
                <label key={d} className={`cursor-pointer rounded-md px-3 py-1.5 font-medium has-focus-visible:ring-2 has-focus-visible:ring-positive ${values.direction === d ? 'bg-navy-600 text-ink' : 'text-ink-muted'}`}>
                  <input type="radio" name="direction" value={d} checked={values.direction === d} onChange={() => set({ direction: d })} className="sr-only" />
                  {d === 'out' ? 'Money out' : 'Money in'}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Amount (CAD)</span>
              <input className={`${fieldClass} w-full`} inputMode="decimal" placeholder="45.99" value={values.amount} onChange={(e) => set({ amount: e.target.value })} autoFocus />
            </label>
            <label>
              <span className={labelClass}>Date</span>
              <input type="date" className={`${fieldClass} w-full`} value={values.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
          </div>

          <label>
            <span className={labelClass}>Description</span>
            <input className={`${fieldClass} w-full`} maxLength={MAX_DESCRIPTION_LENGTH} placeholder="e.g. Farmers market" value={values.description} onChange={(e) => set({ description: e.target.value })} />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label>
              <span className={labelClass}>Account</span>
              <select className={`${fieldClass} w-full`} value={values.accountId} onChange={(e) => set({ accountId: e.target.value })}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="new">New account…</option>
              </select>
            </label>
            <label>
              <span className={labelClass}>Category</span>
              <select className={`${fieldClass} w-full`} value={values.category} onChange={(e) => set({ category: e.target.value as TransactionFormValues['category'] })}>
                <option value="auto">Automatic</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {values.accountId === 'new' && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-navy-600/60 p-3 sm:grid-cols-2">
              <label>
                <span className={labelClass}>New account name</span>
                <input className={`${fieldClass} w-full`} placeholder="e.g. Cash" value={values.newAccountName} onChange={(e) => set({ newAccountName: e.target.value })} />
              </label>
              <label>
                <span className={labelClass}>Account type</span>
                <select className={`${fieldClass} w-full`} value={values.newAccountType} onChange={(e) => set({ newAccountType: e.target.value as AccountType })}>
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {values.category === 'Transfers' && (
            <p className="text-xs text-ink-faint">Transfers move money between your own accounts, so they’re never counted as income or spending.</p>
          )}

          {error && (
            <p role="alert" className="text-xs text-negative">
              {error}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            {editing && onDelete ? (
              <Button variant="ghost" className="text-negative" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 aria-hidden className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </dialog>
  )
}
