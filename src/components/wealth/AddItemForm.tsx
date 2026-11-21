import { Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { todayISO, type ISODate } from '../../lib/dates'
import type { Cents } from '../../lib/money'
import { parseWealthValue } from '../../lib/wealth/netWorth'
import { WEALTH_TYPES, type WealthType } from '../../types/wealth'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/fieldClass'

interface AddItemFormProps {
  busy: boolean
  onAdd: (input: { name: string; type: WealthType; value: Cents; date: ISODate }) => Promise<void>
}

export function AddItemForm({ busy, onAdd }: AddItemFormProps) {
  const today = todayISO()
  const [name, setName] = useState('')
  const [type, setType] = useState<WealthType>('cash')
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Give it a name, e.g. “Brokerage account”.')
    const parsed = parseWealthValue(value)
    if (typeof parsed === 'string') return setError(parsed)
    if (!date || date > today) return setError('Choose a date that isn’t in the future.')
    setError(null)
    await onAdd({ name, type, value: parsed, date })
    setName('')
    setValue('')
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Brokerage account" className={`${fieldClass} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as WealthType)} className={`${fieldClass} w-full`}>
            <optgroup label="Assets: what you own">
              {WEALTH_TYPES.filter((t) => t.kind === 'asset').map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Liabilities: what you owe">
              {WEALTH_TYPES.filter((t) => t.kind === 'liability').map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">{WEALTH_TYPES.find((t) => t.value === type)!.kind === 'asset' ? 'Current value' : 'Amount owed'}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="$0.00" className={`${fieldClass} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">As of</span>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={`${fieldClass} w-full [color-scheme:dark]`} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" disabled={busy}>
          <Plus aria-hidden className="size-4" /> Add
        </Button>
      </div>
    </form>
  )
}
