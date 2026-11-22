import { CheckCircle2, Pencil, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { BudgetBar } from '../components/budgets/BudgetBar'
import { CategoryLabel } from '../components/CategoryLabel'
import { MonthSelect } from '../components/dashboard/MonthSelect'
import { StatCard } from '../components/dashboard/StatCard'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { fieldClass } from '../components/ui/fieldClass'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { Section } from '../components/ui/Section'
import { BUDGET_CATEGORIES, budgetSummary, type BudgetLine } from '../lib/budgets/budgets'
import { formatMonth, todayISO, toMonthKey } from '../lib/dates'
import { formatCents, parseAmountToCents, type Cents } from '../lib/money'
import { availableMonths, latestDate } from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'
import type { Category } from '../types/transaction'

/** Reads a budget amount: a positive number of dollars. */
function readBudget(text: string): Cents | string {
  const cents = parseAmountToCents(text)
  if (cents === null) return 'Enter an amount, e.g. 600'
  if (cents <= 0) return 'A budget must be more than $0.'
  return cents
}

export function BudgetsPage() {
  const { status, isSample, transactions } = useDisplayData()
  const budgets = useFinanceStore((s) => s.budgets)
  const setBudget = useFinanceStore((s) => s.setBudget)
  const [searchParams, setSearchParams] = useSearchParams()
  const [notice, setNotice] = useState<string | null>(null)

  const months = useMemo(() => {
    const list = availableMonths(transactions)
    return list.length > 0 ? list : [toMonthKey(todayISO())]
  }, [transactions])
  const requested = searchParams.get('month')
  const month = requested && months.includes(requested) ? requested : months[0]!
  const summary = useMemo(() => budgetSummary(transactions, budgets, month, latestDate(transactions)), [transactions, budgets, month])
  const unbudgeted = BUDGET_CATEGORIES.filter((c) => !budgets.some((b) => b.category === c))

  async function save(category: Category, amount: Cents | null) {
    await setBudget(category, amount)
    setNotice(amount === null ? `${category} budget removed.` : `${category} budget set to ${formatCents(amount)} a month.`)
  }

  if (status === 'loading') return null
  const budgeted = summary.lines.filter((l) => l.budget !== null)
  const other = summary.lines.filter((l) => l.budget === null)

  return (
    <>
      <PageHeader
        title="Budgets"
        description={`Monthly limits by category, compared with what you actually spent in ${formatMonth(month)}${summary.isPartial ? ' so far' : ''}.`}
        actions={<MonthSelect months={months} value={month} onChange={(m) => setSearchParams({ month: m })} />}
      />
      {isSample && <SampleDataNotice />}

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Budgeted" value={formatCents(summary.totalBudget)} hint={`${budgeted.length} ${budgeted.length === 1 ? 'category' : 'categories'}`} />
          <StatCard label="Spent" value={formatCents(summary.totalSpent)} hint="In budgeted categories, refunds subtracted" />
          <StatCard
            label={summary.totalRemaining >= 0 ? 'Remaining' : 'Over budget'}
            value={formatCents(Math.abs(summary.totalRemaining))}
            hint={summary.totalBudget > 0 ? `${Math.round((summary.totalSpent / summary.totalBudget) * 100)}% of your budgets used` : 'Set a budget below'}
          />
          <StatCard label="Spending without a budget" value={formatCents(summary.unbudgetedSpent)} hint={`${other.length} ${other.length === 1 ? 'category' : 'categories'}`} />
        </div>

        {notice && (
          <p role="status" className="flex items-center gap-2 rounded-lg bg-positive-soft px-4 py-2.5 text-sm text-positive">
            <CheckCircle2 aria-hidden className="size-4" /> {notice}
          </p>
        )}

        <Section
          title="Your budgets"
          subtitle={
            summary.isPartial
              ? `${Math.round(summary.monthElapsed * 100)}% of the month has gone: the thin line on each bar shows where you’d be at an even pace`
              : 'The same amount applies every month'
          }
        >
          {budgeted.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">No budgets yet. Add one below, or set one for a category you already spend in.</p>
          ) : (
            <ul className="flex flex-col gap-5">
              {budgeted.map((line) => (
                <BudgetRow key={line.category} line={line} pace={summary.isPartial ? summary.monthElapsed : undefined} onSave={(amount) => save(line.category, amount)} />
              ))}
            </ul>
          )}
          {unbudgeted.length > 0 && <AddBudget categories={unbudgeted} onAdd={save} />}
        </Section>

        {other.length > 0 && (
          <Section title="Spending without a budget" subtitle={`In ${formatMonth(month)}${summary.isPartial ? ' so far' : ''}`}>
            <ul className="divide-y divide-navy-600/40">
              {other.map((line) => (
                <li key={line.category} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <CategoryLabel category={line.category} />
                  <span className="tabular">{formatCents(line.spent)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  )
}

function BudgetRow({ line, pace, onSave }: { line: BudgetLine; pace?: number; onSave: (amount: Cents | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(amount: Cents | null) {
    setBusy(true)
    try {
      await onSave(amount)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault()
    const result = readBudget(text)
    if (typeof result === 'string') return setError(result)
    void run(result)
  }

  return (
    <li data-testid={`budget-${line.category}`}>
      {editing ? (
        <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-xs text-ink-muted">{line.category} budget per month</span>
            <input className={`${fieldClass} w-full`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </label>
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
          <Button variant="ghost" className="text-negative" onClick={() => void run(null)} disabled={busy}>
            Remove
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
          {error && (
            <p role="alert" className="w-full text-xs text-negative">
              {error}
            </p>
          )}
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <BudgetBar line={line} pace={pace} />
          </div>
          <button
            type="button"
            onClick={() => {
              setText((line.budget! / 100).toFixed(2))
              setError(null)
              setEditing(true)
            }}
            aria-label={`Edit ${line.category} budget`}
            className="rounded-md p-1.5 text-ink-faint hover:bg-navy-700 hover:text-ink"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      )}
    </li>
  )
}

function AddBudget({ categories, onAdd }: { categories: readonly Category[]; onAdd: (category: Category, amount: Cents) => Promise<void> }) {
  const [category, setCategory] = useState<Category>(categories[0]!)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const chosen = categories.includes(category) ? category : categories[0]!

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = readBudget(text)
    if (typeof result === 'string') return setError(result)
    setError(null)
    setBusy(true)
    try {
      await onAdd(chosen, result)
      setText('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mt-6 bg-navy-900/60 p-4">
      <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3" aria-label="Add a budget">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Category
          <select className={fieldClass} value={chosen} onChange={(e) => setCategory(e.target.value as Category)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-muted">
          Monthly budget (CAD)
          <input className={fieldClass} inputMode="decimal" placeholder="e.g. 600" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <Button type="submit" variant="primary" disabled={busy}>
          <Plus aria-hidden className="size-4" /> Add budget
        </Button>
        {error && (
          <p role="alert" className="w-full text-xs text-negative">
            {error}
          </p>
        )}
      </form>
    </Card>
  )
}
