import { AlertCircle, Database, Download, Lock, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { backupData, backupFileName, createBackup, MAX_BACKUP_BYTES, parseBackup, summarizeData, type Backup } from '../lib/backup'
import { useFinanceStore } from '../store/financeStore'

const PRIVACY_FACTS = [
  'Bank statements are read inside your browser. The file is never uploaded.',
  'Everything is stored in this browser’s private storage (IndexedDB) on this device only.',
  'WealthFlow never asks for, or stores, bank logins or passwords.',
  'No AI service, analytics or tracking is used. Insights are calculated on this device.',
  'All amounts are in Canadian dollars (CAD).',
  'The production build includes a Content Security Policy that blocks connections to any other server.',
]

export function SettingsPage() {
  // No selector: this page shows a summary of everything, so it re-renders on
  // any change. Fine here; busier pages select only what they need.
  const state = useFinanceStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [pendingRestore, setPendingRestore] = useState<Backup | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const data = {
    transactions: state.transactions,
    accounts: state.accounts,
    imports: state.imports,
    mappings: state.mappings,
    rules: state.rules,
    subscriptionDecisions: state.subscriptionDecisions,
    wealthItems: state.wealthItems,
    wealthEntries: state.wealthEntries,
  }
  const counts = summarizeData(data)

  function downloadBackup() {
    // Build the file in memory and hand it to the browser's download. No network involved.
    const blob = new Blob([JSON.stringify(createBackup(data), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = backupFileName()
    a.click()
    // Free the memory once the browser has started the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Backup downloaded. It contains your financial data in plain text, so keep it somewhere safe.')
  }

  /** Reads and checks the chosen file. Nothing changes until the user confirms. */
  async function chooseBackup(file: File) {
    setRestoreError(null)
    setNotice(null)
    if (file.size > MAX_BACKUP_BYTES) return setRestoreError('This file is too large to be a WealthFlow backup.')
    const result = parseBackup(await file.text())
    if (typeof result === 'string') return setRestoreError(result)
    setPendingRestore(result)
  }

  async function confirmRestore() {
    if (!pendingRestore) return
    setBusy(true)
    try {
      await state.restoreBackup(backupData(pendingRestore))
      setNotice(`Restored ${pendingRestore.transactions.length.toLocaleString()} transactions from the backup.`)
    } catch (error) {
      console.error('[WealthFlow] Restore failed', error)
      setRestoreError('Restoring failed, and your existing data was left unchanged.')
    } finally {
      setBusy(false)
      setPendingRestore(null)
    }
  }

  async function deleteEverything() {
    setBusy(true)
    try {
      await state.deleteAllData()
      setNotice('All data was deleted from this device.')
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  if (state.status === 'loading') return null

  const rows: [string, number][] = [
    ['Transactions', counts.transactions],
    ['Accounts', counts.accounts],
    ['Imported files', counts.imports],
    ['Categorization rules', counts.rules],
    ['Subscription decisions', counts.subscriptionDecisions],
    ['Wealth items', counts.wealthItems],
    ['Wealth value records', counts.wealthEntries],
  ]

  return (
    <>
      <PageHeader title="Settings" description="Your data, your privacy, and how to remove everything." />

      {notice && (
        <p role="status" className="mb-6 rounded-lg bg-positive-soft px-4 py-3 text-sm text-positive">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Your data" subtitle="Stored only in this browser, on this device">
          <dl className="divide-y divide-navy-600/40 text-sm">
            {rows.map(([label, n]) => (
              <div key={label} className="flex justify-between py-2">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="tabular">{n.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-ink-faint">
            Manage categorization rules on the <Link to="/transactions" className="text-positive hover:underline">Transactions</Link> page.
          </p>
        </Section>

        <Section title="Privacy & security">
          <ul className="flex flex-col gap-3 text-sm text-ink-muted">
            {PRIVACY_FACTS.map((fact) => (
              <li key={fact} className="flex gap-2.5">
                <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
                {fact}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Backup" subtitle="A copy of everything, as a JSON file">
          <div className="flex items-start gap-3 text-sm text-ink-muted">
            <Database aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
            <p>
              Browser storage can be cleared (for example by clearing site data), so a backup is a good idea. The file is not encrypted:
              anyone who opens it can read your transactions.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={downloadBackup} disabled={counts.isEmpty}>
              <Download aria-hidden className="size-4" /> Download backup
            </Button>
            <Button variant="ghost" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Upload aria-hidden className="size-4" /> Restore from backup
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void chooseBackup(file)
              e.target.value = ''
            }}
          />
          {counts.isEmpty && <p className="mt-2 text-xs text-ink-faint">Nothing to back up yet.</p>}
          {restoreError && (
            <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-negative">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" /> {restoreError}
            </p>
          )}
        </Section>

        <Section title="Delete all data" subtitle="Permanent, and only affects this device" className="border-negative/30">
          <div className="flex items-start gap-3 text-sm text-ink-muted">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
            <p>Erases every transaction, account, rule, subscription decision and wealth record WealthFlow has stored here.</p>
          </div>
          <Button variant="danger" className="mt-4" onClick={() => setConfirmDelete(true)} disabled={counts.isEmpty}>
            <Trash2 aria-hidden className="size-4" /> Delete all data
          </Button>
        </Section>
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restore this backup?"
        confirmLabel="Replace my data"
        danger
        busy={busy}
        onCancel={() => setPendingRestore(null)}
        onConfirm={confirmRestore}
      >
        The backup from {pendingRestore && new Date(pendingRestore.exportedAt).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })}{' '}
        has {pendingRestore?.transactions.length.toLocaleString()} transactions. It will <strong className="text-ink">replace</strong> everything
        currently stored ({counts.transactions.toLocaleString()} transactions). Download a backup of your current data first if you might want it.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete all data?"
        confirmLabel="Delete everything"
        danger
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteEverything}
      >
        This permanently erases {counts.transactions.toLocaleString()} transactions and everything else WealthFlow stored on this device.
        It can’t be undone. Download a backup first if you might want it later.
      </ConfirmDialog>
    </>
  )
}
