import { CheckCircle2, Download, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/ui/Button'
import { buttonClasses } from '../components/ui/buttonClasses'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { ColumnMapper } from '../components/upload/ColumnMapper'
import { DropZone } from '../components/upload/DropZone'
import { ImportHistory } from '../components/upload/ImportHistory'
import { ImportReview } from '../components/upload/ImportReview'
import type { AccountChoice } from '../components/upload/types'
import { suggestMapping } from '../lib/csv/detectColumns'
import { checkFile, detectHeaderRow, headerSignature, ImportError, parseCsvText } from '../lib/csv/parseCsv'
import { isSelectedByDefault, prepareImport, toTransactions, type PreparedImport } from '../lib/csv/prepareImport'
import { useFinanceStore } from '../store/financeStore'
import type { Account } from '../types/account'
import type { ColumnMapping, ImportRecord } from '../types/import'
import type { Category } from '../types/transaction'
import { previewCategories } from '../lib/categorize/categorize'

/**
 * The import flow is a small state machine. `step` says which screen we're on;
 * each screen moves to the next by calling setStep. Using a "discriminated
 * union" type means TypeScript knows that, e.g., `prepared` only exists
 * on the review step.
 */
type Step =
  | { kind: 'select' }
  | { kind: 'map' }
  | { kind: 'review'; prepared: PreparedImport; categories: Category[]; selected: Set<number> }
  | { kind: 'done'; count: number; accountName: string }

interface LoadedFile {
  name: string
  rows: string[][]
}

/** Placeholder id for a not-yet-created account. It has no transactions, so nothing is a duplicate. */
const NEW_ACCOUNT_ID = '__new-account'

const SAMPLE_FILES = [
  { file: 'everyday-chequing-oct.csv', label: 'Chequing, October', note: 'One amount column, with balance' },
  { file: 'everyday-chequing-oct15-nov20.csv', label: 'Chequing, Oct 15 – Nov 20', note: 'Overlaps the first file: try duplicates' },
  { file: 'rewards-card-nov.csv', label: 'Credit card, November', note: 'Info lines on top, debit/credit columns' },
  { file: 'compte-cheques-nov.csv', label: 'Compte chèques (French)', note: 'Quebec-style: semicolons, 1 234,56 amounts' },
  { file: 'messy-export.csv', label: 'Messy export', note: 'Contains rows that can’t be read' },
]

export function UploadPage() {
  const transactions = useFinanceStore((s) => s.transactions)
  const accounts = useFinanceStore((s) => s.accounts)
  const imports = useFinanceStore((s) => s.imports)
  const mappings = useFinanceStore((s) => s.mappings)
  const rules = useFinanceStore((s) => s.rules)
  const commitImport = useFinanceStore((s) => s.commitImport)
  const removeImport = useFinanceStore((s) => s.removeImport)
  const deleteAllData = useFinanceStore((s) => s.deleteAllData)

  const [step, setStep] = useState<Step>({ kind: 'select' })
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [usedSavedMapping, setUsedSavedMapping] = useState(false)
  const [account, setAccount] = useState<AccountChoice>({ mode: 'new', name: '', type: 'checking' })
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingUndo, setPendingUndo] = useState<ImportRecord | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  /** Sets up the mapping screen for a header row, using saved settings when the layout is known. */
  function setupMapping(rows: string[][], header: number) {
    const signature = headerSignature(rows[header] ?? [])
    const saved = mappings.find((m) => m.signature === signature)
    setHeaderRow(header)
    setMapping(saved ? saved.mapping : suggestMapping(rows[header] ?? [], rows.slice(header + 1)))
    setUsedSavedMapping(Boolean(saved))
    if (saved?.accountId && accounts.some((a) => a.id === saved.accountId)) {
      setAccount({ mode: 'existing', accountId: saved.accountId })
    }
  }

  async function openFile(picked: File) {
    setError(null)
    const problem = checkFile(picked)
    if (problem) return setError(problem)

    setBusy(true)
    try {
      // file.text() reads the file inside the browser. Nothing is uploaded anywhere.
      const rows = parseCsvText(await picked.text())
      setFile({ name: picked.name, rows })
      // Never guess the account: guessing wrong would mix two accounts' statements.
      // Saved settings (applied in setupMapping) can pre-select it; otherwise the user chooses.
      setAccount({ mode: 'new', name: '', type: 'checking' })
      setupMapping(rows, detectHeaderRow(rows))
      setStep({ kind: 'map' })
    } catch (e) {
      if (!(e instanceof ImportError)) console.error('[WealthFlow] CSV read failed', e)
      setError(e instanceof ImportError ? e.message : 'This file couldn’t be read. Make sure it’s a CSV export from your bank.')
    } finally {
      setBusy(false)
    }
  }

  function accountIdFor(choice: AccountChoice) {
    return choice.mode === 'existing' ? choice.accountId : NEW_ACCOUNT_ID
  }

  function accountNameFor(choice: AccountChoice) {
    return choice.mode === 'existing' ? (accounts.find((a) => a.id === choice.accountId)?.name ?? 'Account') : choice.name.trim()
  }

  function goToReview() {
    if (!file || !mapping) return
    const accountId = accountIdFor(account)
    const prepared = prepareImport(file.rows, headerRow, mapping, transactions, accountId)
    const categories = previewCategories(prepared.rows.map((r) => r.draft), accountId, transactions, rules, accounts)
    const selected = new Set(prepared.rows.flatMap((r, i) => (isSelectedByDefault(r.status) ? [i] : [])))
    setError(null)
    setStep({ kind: 'review', prepared, categories, selected })
  }

  async function runImport() {
    if (step.kind !== 'review' || !file || !mapping) return
    setBusy(true)
    setError(null)
    try {
      const importId = crypto.randomUUID()
      const base: Account =
        account.mode === 'existing'
          ? accounts.find((a) => a.id === account.accountId)!
          : { id: crypto.randomUUID(), name: account.name.trim(), type: account.type }

      // Only move the balance forward in time: an old statement mustn't overwrite a newer balance.
      const closing = step.prepared.closing
      const updatedAccount =
        closing && (!base.balanceAsOf || closing.asOf >= base.balanceAsOf)
          ? { ...base, balance: closing.balance, balanceAsOf: closing.asOf }
          : base

      const keep = step.prepared.rows.flatMap((_, i) => (step.selected.has(i) ? [i] : []))
      const newTransactions = toTransactions(
        keep.map((i) => step.prepared.rows[i]!.draft),
        keep.map((i) => step.categories[i]!),
        updatedAccount.id,
        importId,
      )

      await commitImport({
        account: updatedAccount,
        transactions: newTransactions,
        record: {
          id: importId,
          fileName: file.name,
          importedAt: new Date().toISOString(),
          accountId: updatedAccount.id,
          transactionCount: newTransactions.length,
        },
        mapping: remember
          ? {
              signature: headerSignature(file.rows[headerRow] ?? []),
              headerRow,
              mapping,
              accountId: updatedAccount.id,
              updatedAt: new Date().toISOString(),
            }
          : null,
      })
      setStep({ kind: 'done', count: newTransactions.length, accountName: updatedAccount.name })
      setFile(null)
    } catch (e) {
      console.error('[WealthFlow] Import failed', e)
      setError('Saving failed, so nothing was imported. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setStep({ kind: 'select' })
    setFile(null)
    setError(null)
  }

  async function confirmUndo() {
    if (!pendingUndo) return
    setBusy(true)
    try {
      await removeImport(pendingUndo.id)
    } finally {
      setBusy(false)
      setPendingUndo(null)
    }
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      await deleteAllData()
    } finally {
      setBusy(false)
      setConfirmDeleteAll(false)
      startOver()
    }
  }

  return (
    <>
      <PageHeader
        title="Import transactions"
        description="Add transactions from a CSV bank statement. The file is read on this device and never uploaded."
      />

      {step.kind === 'select' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-6">
            <DropZone onFile={openFile} onReject={setError} error={error} busy={busy} />

            {imports.length > 0 && (
              <Card>
                <h2 className="mb-1 font-semibold">Your imports</h2>
                <p className="mb-3 text-xs text-ink-faint">Undo removes every transaction from that file.</p>
                <ImportHistory imports={imports} accounts={accounts} onUndo={setPendingUndo} />
              </Card>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <Card className="p-5">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <ShieldCheck aria-hidden className="size-4 text-positive" /> Private by design
              </div>
              <p className="text-sm text-ink-muted">
                Your file is processed entirely in this browser and saved only on this device. WealthFlow never asks for bank
                logins.
              </p>
            </Card>

            <Card className="p-5">
              <h2 className="font-medium">Try a sample file</h2>
              <p className="mb-3 text-xs text-ink-faint">Fictional statements in different formats. Download one, then drop it above.</p>
              <ul className="flex flex-col gap-1">
                {SAMPLE_FILES.map((s) => (
                  <li key={s.file}>
                    <a href={`/sample-data/${s.file}`} download className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-navy-700/50">
                      <Download aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
                      <span className="text-sm">
                        {s.label}
                        <span className="block text-xs text-ink-faint">{s.note}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>

            {(transactions.length > 0 || accounts.length > 0) && (
              <Card className="border-negative/30 p-5">
                <h2 className="font-medium">Delete all data</h2>
                <p className="mt-1 mb-4 text-sm text-ink-muted">Erase every transaction, account and saved setting from this device.</p>
                <Button variant="danger" onClick={() => setConfirmDeleteAll(true)}>
                  <Trash2 aria-hidden className="size-4" /> Delete all data
                </Button>
              </Card>
            )}
          </div>
        </div>
      )}

      {step.kind === 'map' && file && mapping && (
        <ColumnMapper
          fileName={file.name}
          rows={file.rows}
          headerRow={headerRow}
          onHeaderRowChange={(row) => setupMapping(file.rows, row)}
          mapping={mapping}
          onMappingChange={setMapping}
          accounts={accounts}
          account={account}
          onAccountChange={setAccount}
          remember={remember}
          onRememberChange={setRemember}
          usedSavedMapping={usedSavedMapping}
          onBack={startOver}
          onContinue={goToReview}
        />
      )}

      {step.kind === 'review' && (
        <ImportReview
          prepared={step.prepared}
          categories={step.categories}
          selected={step.selected}
          onToggle={(i) => {
            const selected = new Set(step.selected)
            if (selected.has(i)) selected.delete(i)
            else selected.add(i)
            setStep({ ...step, selected })
          }}
          onSelect={(indexes) => setStep({ ...step, selected: new Set(indexes) })}
          accountName={accountNameFor(account)}
          busy={busy}
          error={error}
          onBack={() => setStep({ kind: 'map' })}
          onImport={runImport}
        />
      )}

      {step.kind === 'done' && (
        <Card className="mx-auto flex max-w-lg flex-col items-center gap-4 py-12 text-center motion-safe:animate-rise">
          <CheckCircle2 aria-hidden className="size-12 text-positive" />
          <div>
            <h2 className="text-lg font-semibold">
              Imported {step.count.toLocaleString()} {step.count === 1 ? 'transaction' : 'transactions'}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">Added to {step.accountName}. Your dashboard now shows your data.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/" className={buttonClasses('primary')}>
              View dashboard
            </Link>
            <Button onClick={startOver}>Import another file</Button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={pendingUndo !== null}
        title="Undo this import?"
        confirmLabel="Remove transactions"
        danger
        busy={busy}
        onConfirm={confirmUndo}
        onCancel={() => setPendingUndo(null)}
      >
        This removes the {pendingUndo?.transactionCount.toLocaleString()} transactions imported from “{pendingUndo?.fileName}”. You can
        import the file again afterwards.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDeleteAll}
        title="Delete all data?"
        confirmLabel="Delete everything"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteAll(false)}
      >
        This permanently erases all {transactions.length.toLocaleString()} transactions, {accounts.length}{' '}
        {accounts.length === 1 ? 'account' : 'accounts'} and saved import settings from this device. It can't be undone.
      </ConfirmDialog>
    </>
  )
}
