import { FileText, Undo2 } from 'lucide-react'
import type { Account } from '../../types/account'
import type { ImportRecord } from '../../types/import'
import { Button } from '../ui/Button'

const dateTime = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short' })

interface ImportHistoryProps {
  imports: readonly ImportRecord[]
  accounts: readonly Account[]
  onUndo: (record: ImportRecord) => void
}

export function ImportHistory({ imports, accounts, onUndo }: ImportHistoryProps) {
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? 'Unknown account'

  return (
    <ul className="-mx-2 divide-y divide-navy-600/40">
      {imports.map((record) => (
        <li key={record.id} className="flex items-center gap-3 px-2 py-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-navy-700">
            <FileText aria-hidden className="size-4 text-ink-muted" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{record.fileName}</p>
            <p className="text-xs text-ink-faint">
              {record.transactionCount.toLocaleString()} transactions · {accountName(record.accountId)} ·{' '}
              {dateTime.format(new Date(record.importedAt))}
            </p>
          </div>
          <Button variant="ghost" onClick={() => onUndo(record)} className="shrink-0 px-3">
            <Undo2 aria-hidden className="size-4" /> Undo
          </Button>
        </li>
      ))}
    </ul>
  )
}
