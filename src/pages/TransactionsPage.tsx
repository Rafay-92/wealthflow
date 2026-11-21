import { CheckCircle2, RotateCcw, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CategorySelect } from '../components/transactions/CategorySelect'
import { RuleSuggestion } from '../components/transactions/RuleSuggestion'
import { RulesPanel } from '../components/transactions/RulesPanel'
import { Card } from '../components/ui/Card'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { fieldClass } from '../components/ui/fieldClass'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { isTransfer } from '../lib/analytics/summary'
import { suggestKeyword } from '../lib/categorize/text'
import { formatDay, formatMonth } from '../lib/dates'
import { formatCents, sumCents } from '../lib/money'
import {
  availableMonths,
  filterTransactions,
  needsReview,
  NO_FILTERS,
  sortNewestFirst,
  type TransactionFilters,
} from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'
import { CATEGORIES, type Category, type CategoryRule, type Transaction } from '../types/transaction'

const PAGE_SIZE = 100

export function TransactionsPage() {
  const { status, isSample, transactions, accounts } = useDisplayData()
  const rules = useFinanceStore((s) => s.rules)
  const setCategory = useFinanceStore((s) => s.setCategory)
  const resetCategory = useFinanceStore((s) => s.resetCategory)
  const addRule = useFinanceStore((s) => s.addRule)
  const deleteRule = useFinanceStore((s) => s.deleteRule)

  const [filters, setFilters] = useState<TransactionFilters>(NO_FILTERS)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [busy, setBusy] = useState(false)
  const [suggestion, setSuggestion] = useState<{ tx: Transaction; category: Category } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [ruleToDelete, setRuleToDelete] = useState<CategoryRule | null>(null)

  const months = useMemo(() => availableMonths(transactions), [transactions])
  const sorted = useMemo(() => sortNewestFirst(transactions), [transactions])
  const filtered = useMemo(() => filterTransactions(sorted, filters), [sorted, filters])
  const reviewCount = useMemo(() => transactions.filter(needsReview).length, [transactions])

  const counted = filtered.filter((t) => !isTransfer(t)).map((t) => t.amount)
  const moneyIn = sumCents(counted.filter((a) => a > 0))
  const moneyOut = -sumCents(counted.filter((a) => a < 0))
  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS)

  const update = (patch: Partial<TransactionFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setLimit(PAGE_SIZE)
  }

  /** Runs a store action with a busy flag, so buttons can't be double-clicked. */
  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  function changeCategory(tx: Transaction, category: Category) {
    if (category === tx.category) return
    setNotice(null)
    void run(async () => {
      await setCategory(tx.id, category)
      setSuggestion({ tx, category })
    })
  }

  function createRule(keyword: string, category: Category) {
    void run(async () => {
      await addRule(keyword, category)
      setSuggestion(null)
      setNotice(`Rule created: “${keyword.trim()}” → ${category}`)
    })
  }

  if (status === 'loading') return null

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${transactions.length.toLocaleString()} transactions. Change any category, or teach WealthFlow with rules.`}
      />

      {isSample && <SampleDataNotice />}

      <Card className="mb-4 flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search descriptions or categories"
            className={`${fieldClass} w-full pl-9`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <select aria-label="Month" value={filters.month} onChange={(e) => update({ month: e.target.value })} className={fieldClass}>
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonth(m)}
              </option>
            ))}
          </select>
          <select aria-label="Category" value={filters.category} onChange={(e) => update({ category: e.target.value as Category | 'all' })} className={fieldClass}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {accounts.length > 1 && (
            <select aria-label="Account" value={filters.accountId} onChange={(e) => update({ accountId: e.target.value })} className={fieldClass}>
              <option value="all">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-pressed={filters.needsReview}
            onClick={() => update({ needsReview: !filters.needsReview })}
            className={`rounded-lg border px-3 py-2 text-sm whitespace-nowrap transition-colors ${
              filters.needsReview ? 'border-warning/60 bg-warning-soft text-warning' : 'border-navy-600 text-ink-muted hover:border-ink-faint hover:text-ink'
            }`}
          >
            Needs review · {reviewCount}
          </button>
        </div>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
        <p className="text-ink-faint">
          {filtered.length.toLocaleString()} shown · In <span className="text-positive tabular">{formatCents(moneyIn)}</span> · Out{' '}
          <span className="text-ink tabular">{formatCents(moneyOut)}</span>
          <span className="hidden sm:inline"> · transfers excluded</span>
        </p>
        {filtersActive && (
          <button type="button" onClick={() => update(NO_FILTERS)} className="inline-flex items-center gap-1 text-ink-muted hover:text-ink">
            <X aria-hidden className="size-3.5" /> Clear filters
          </button>
        )}
      </div>

      {notice && (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-lg bg-positive-soft px-4 py-2.5 text-sm text-positive">
          <CheckCircle2 aria-hidden className="size-4" /> {notice}
        </p>
      )}

      <Card className="overflow-hidden p-0">
        {filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-ink-faint">No transactions match these filters.</p>
        ) : (
          <ul className="divide-y divide-navy-600/30">
            {filtered.slice(0, limit).map((tx) => (
              <li key={tx.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[3.5rem_minmax(0,1fr)_13rem_7rem]">
                <span className="text-sm text-ink-faint tabular">{formatDay(tx.date)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tx.description}</p>
                  <p className="truncate text-xs text-ink-faint" title={tx.categoryNote}>
                    {[accountName(tx.accountId), tx.categoryNote].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <p className={`text-right text-sm font-medium tabular sm:order-last ${isTransfer(tx) ? 'text-ink-faint' : tx.amount > 0 ? 'text-positive' : ''}`}>
                  {formatCents(tx.amount, { signed: true })}
                </p>
                <div className="col-span-3 flex items-center gap-1 pl-[4.25rem] sm:col-span-1 sm:pl-0">
                  <CategorySelect value={tx.category} label={`Category for ${tx.description}`} disabled={isSample || busy} onChange={(c) => changeCategory(tx, c)} />
                  {tx.categorySource === 'manual' && !isSample ? (
                    <button
                      type="button"
                      onClick={() => void run(() => resetCategory(tx.id))}
                      disabled={busy}
                      title="Go back to automatic categorization"
                      aria-label={`Reset ${tx.description} to automatic category`}
                      className="rounded-md p-1.5 text-ink-faint hover:bg-navy-700 hover:text-ink"
                    >
                      <RotateCcw className="size-3.5" />
                    </button>
                  ) : (
                    <span className="w-[26px]" aria-hidden />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {filtered.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="w-full border-t border-navy-600/60 py-3 text-sm font-medium text-ink-muted hover:text-ink">
            Show more ({(filtered.length - limit).toLocaleString()} remaining)
          </button>
        )}
      </Card>

      {suggestion && (
        <RuleSuggestion
          key={suggestion.tx.id + suggestion.category}
          changed={suggestion.tx}
          category={suggestion.category}
          initialKeyword={suggestKeyword(suggestion.tx.description)}
          allTransactions={transactions}
          busy={busy}
          onCreate={(keyword) => createRule(keyword, suggestion.category)}
          onDismiss={() => setSuggestion(null)}
        />
      )}

      <Card className="mt-6">
        <RulesPanel
          rules={rules}
          readOnly={isSample}
          busy={busy}
          onAdd={(keyword, category) => createRule(keyword, category)}
          onDelete={setRuleToDelete}
        />
        {isSample && <p className="mt-3 text-xs text-ink-faint">Sample data is read-only. Import your own statements to edit categories and rules.</p>}
      </Card>

      <ConfirmDialog
        open={ruleToDelete !== null}
        title="Delete this rule?"
        confirmLabel="Delete rule"
        danger
        busy={busy}
        onCancel={() => setRuleToDelete(null)}
        onConfirm={() =>
          void run(async () => {
            if (ruleToDelete) await deleteRule(ruleToDelete.id)
            setRuleToDelete(null)
          })
        }
      >
        Transactions matched by “{ruleToDelete?.keyword}” go back to automatic categorization. Categories you set by hand stay as they are.
      </ConfirmDialog>
    </>
  )
}
