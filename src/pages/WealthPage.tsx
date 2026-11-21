import { Info, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { StatCard } from '../components/dashboard/StatCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { AddItemForm } from '../components/wealth/AddItemForm'
import { NetWorthChart } from '../components/wealth/NetWorthChart'
import { UpdateValuesForm } from '../components/wealth/UpdateValuesForm'
import { moneyChange } from '../lib/analytics/change'
import { formatDay } from '../lib/dates'
import { formatCents, formatPercent } from '../lib/money'
import { itemsWithValues, netWorthHistory, type ItemWithValue } from '../lib/wealth/netWorth'
import { useFinanceStore } from '../store/financeStore'
import type { Account } from '../types/account'
import { labelOf, type WealthItem, type WealthType } from '../types/wealth'

/** How an imported bank account maps onto a wealth item. */
function suggestionFor(account: Account): { type: WealthType; value: number } | null {
  if (account.balance === undefined || !account.balanceAsOf) return null
  if (account.type === 'credit') return { type: 'credit-card', value: Math.abs(account.balance) }
  if (account.balance < 0) return null // an overdrawn account isn't a simple asset; let the user decide
  return { type: 'cash', value: account.balance }
}

export function WealthPage() {
  const status = useFinanceStore((s) => s.status)
  const items = useFinanceStore((s) => s.wealthItems)
  const entries = useFinanceStore((s) => s.wealthEntries)
  const accounts = useFinanceStore((s) => s.accounts)
  const addItem = useFinanceStore((s) => s.addWealthItem)
  const updateValues = useFinanceStore((s) => s.updateWealthValues)
  const deleteItem = useFinanceStore((s) => s.deleteWealthItem)

  const [busy, setBusy] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [toDelete, setToDelete] = useState<WealthItem | null>(null)

  const history = useMemo(() => netWorthHistory(items, entries), [items, entries])
  const grouped = useMemo(() => itemsWithValues(items, entries), [items, entries])
  const linked = new Set(items.map((i) => i.sourceAccountId).filter(Boolean))
  const suggestions = accounts.filter((a) => !linked.has(a.id) && suggestionFor(a))

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return null

  const current = history.at(-1)
  const previous = history.at(-2)

  return (
    <>
      <PageHeader
        title="Wealth"
        description="Everything you own minus everything you owe. You enter these values yourself."
        actions={
          items.length > 0 && !updating && (
            <Button variant="primary" onClick={() => setUpdating(true)}>
              <Pencil aria-hidden className="size-4" /> Update values
            </Button>
          )
        }
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-navy-600/60 bg-navy-900 px-4 py-3 text-sm text-ink-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
        <p>
          <span className="font-medium text-ink">Net worth = total assets − total liabilities.</span> Bank statements only show
          part of the picture, so WealthFlow never guesses: investments, property and debts count only once you add them here.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {current && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Net worth"
              value={formatCents(current.netWorth)}
              change={previous && moneyChange(current.netWorth, previous.netWorth, true)}
              formatChange={(n) => formatPercent(n)}
              comparisonLabel={previous && `since ${formatDay(previous.date)}`}
              hint={`As of ${formatDay(current.date)}`}
            />
            <StatCard label="Total assets" value={formatCents(current.assets)} hint={`${grouped.assets.length} ${grouped.assets.length === 1 ? 'item' : 'items'}`} />
            <StatCard label="Total liabilities" value={formatCents(current.liabilities)} hint={`${grouped.liabilities.length} ${grouped.liabilities.length === 1 ? 'item' : 'items'}`} />
          </div>
        )}

        {updating && (
          <Section title="Update values" subtitle="Change what moved; everything else keeps its last value">
            <UpdateValuesForm
              items={[...grouped.assets, ...grouped.liabilities]}
              busy={busy}
              onCancel={() => setUpdating(false)}
              onSave={(date, values) =>
                run(async () => {
                  await updateValues(date, values)
                  setUpdating(false)
                })
              }
            />
          </Section>
        )}

        {history.length > 0 && (
          <Section title="Net worth over time" subtitle={`${history.length} ${history.length === 1 ? 'update' : 'updates'}`}>
            {history.length > 1 ? (
              <NetWorthChart points={history} />
            ) : (
              <p className="py-8 text-center text-sm text-ink-faint">Update your values again later (monthly works well) to see how your net worth changes.</p>
            )}
          </Section>
        )}

        {items.length > 0 && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ItemList title="Assets" subtitle="What you own" rows={grouped.assets} onDelete={setToDelete} />
            <ItemList title="Liabilities" subtitle="What you owe" rows={grouped.liabilities} onDelete={setToDelete} />
          </div>
        )}

        {suggestions.length > 0 && (
          <Section title="From your imported statements" subtitle="Balances your bank reported; add them in one click">
            <ul className="divide-y divide-navy-600/40">
              {suggestions.map((account) => {
                const s = suggestionFor(account)!
                return (
                  <li key={account.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <Landmark aria-hidden className="size-4 text-ink-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{account.name}</p>
                      <p className="text-xs text-ink-faint">
                        {formatCents(s.value)} on {formatDay(account.balanceAsOf!)} · as {labelOf(s.type).toLowerCase()}
                      </p>
                    </div>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(() => addItem({ name: account.name, type: s.type, value: s.value, date: account.balanceAsOf!, sourceAccountId: account.id }))
                      }
                    >
                      <Plus aria-hidden className="size-4" /> Add
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Section>
        )}

        {items.length === 0 || showAdd ? (
          <Section title={items.length === 0 ? 'Start tracking your net worth' : 'Add an asset or debt'} subtitle="Savings, investments, property, cards, loans…">
            <AddItemForm
              busy={busy}
              onAdd={(input) =>
                run(async () => {
                  await addItem(input)
                  setShowAdd(false)
                })
              }
            />
          </Section>
        ) : (
          <div>
            <Button onClick={() => setShowAdd(true)}>
              <Plus aria-hidden className="size-4" /> Add an asset or debt
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete ? `Delete “${toDelete.name}”?` : 'Delete item?'}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={() =>
          void run(async () => {
            if (toDelete) await deleteItem(toDelete.id)
            setToDelete(null)
          })
        }
      >
        Its whole value history is removed too, so past net worth figures will change.
      </ConfirmDialog>
    </>
  )
}

function ItemList({ title, subtitle, rows, onDelete }: { title: string; subtitle: string; rows: ItemWithValue[]; onDelete: (item: WealthItem) => void }) {
  const total = rows.reduce((s, r) => s + (r.latest?.value ?? 0), 0)
  return (
    <Section title={title} subtitle={subtitle} action={<span className="text-sm font-medium tabular">{formatCents(total)}</span>}>
      {rows.length === 0 ? (
        <Card className="border-dashed p-4 text-center text-sm text-ink-faint">None added yet.</Card>
      ) : (
        <ul className="-my-3 divide-y divide-navy-600/40">
          {rows.map(({ item, latest }) => (
            <li key={item.id} className="flex items-center gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-xs text-ink-faint">
                  {labelOf(item.type)}
                  {latest && ` · updated ${formatDay(latest.date)}`}
                </p>
              </div>
              <span className="font-medium tabular">{latest ? formatCents(latest.value) : '—'}</span>
              <button
                type="button"
                onClick={() => onDelete(item)}
                aria-label={`Delete ${item.name}`}
                className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-negative-soft hover:text-negative"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
