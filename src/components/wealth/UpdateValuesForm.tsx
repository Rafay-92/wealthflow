import { useState, type FormEvent } from 'react'
import { formatDay, todayISO, type ISODate } from '../../lib/dates'
import { formatCents, type Cents } from '../../lib/money'
import { parseWealthValue, type ItemWithValue } from '../../lib/wealth/netWorth'
import { kindOf } from '../../types/wealth'
import { Button } from '../ui/Button'
import { fieldClass } from '../ui/fieldClass'

interface UpdateValuesFormProps {
  items: readonly ItemWithValue[]
  busy: boolean
  onSave: (date: ISODate, values: { itemId: string; value: Cents }[]) => Promise<void>
  onCancel: () => void
}

/**
 * Records today's (or another date's) value for every item at once: one
 * "snapshot". Fields start at the latest value, so you only change what moved.
 */
export function UpdateValuesForm({ items, busy, onSave, onCancel }: UpdateValuesFormProps) {
  const today = todayISO()
  const [date, setDate] = useState(today)
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map(({ item, latest }) => [item.id, latest ? (latest.value / 100).toFixed(2) : ''])),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dateError, setDateError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!date || date > today) return setDateError('Choose a date that isn’t in the future.')
    setDateError(null)

    const parsed: { itemId: string; value: Cents }[] = []
    const problems: Record<string, string> = {}
    for (const { item } of items) {
      const result = parseWealthValue(values[item.id] ?? '')
      if (typeof result === 'string') problems[item.id] = result
      else parsed.push({ itemId: item.id, value: result })
    }
    setErrors(problems)
    if (Object.keys(problems).length === 0) await onSave(date, parsed)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <label className="block max-w-56">
        <span className="mb-1.5 block text-sm font-medium">Values as of</span>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={`${fieldClass} w-full [color-scheme:dark]`} />
        {dateError && <span className="mt-1 block text-xs text-negative">{dateError}</span>}
      </label>

      <ul className="divide-y divide-navy-600/40">
        {items.map(({ item, latest }) => (
          <li key={item.id} className="grid items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.name}</p>
              <p className="text-xs text-ink-faint">
                {kindOf(item.type) === 'asset' ? 'Owned' : 'Owed'}
                {latest && ` · was ${formatCents(latest.value)} on ${formatDay(latest.date)}`}
              </p>
            </div>
            <label>
              <span className="sr-only">New value for {item.name}</span>
              <input
                value={values[item.id] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [item.id]: e.target.value }))}
                inputMode="decimal"
                className={`${fieldClass} w-full text-right tabular ${errors[item.id] ? 'border-negative' : ''}`}
                aria-invalid={Boolean(errors[item.id])}
              />
              {errors[item.id] && <span className="mt-1 block text-xs text-negative">{errors[item.id]}</span>}
            </label>
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          Save values
        </Button>
      </div>
    </form>
  )
}
