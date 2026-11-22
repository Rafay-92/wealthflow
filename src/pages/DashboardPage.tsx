import { ArrowDownLeft, ArrowRight, CalendarDays, CalendarRange, Hash, PiggyBank, Receipt, Scale, TrendingDown, TrendingUp, Upload, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CategoryComparison } from '../components/analytics/CategoryComparison'
import { BudgetBar } from '../components/budgets/BudgetBar'
import { BalanceHistoryChart } from '../components/charts/BalanceHistoryChart'
import { IncomeExpenseChart } from '../components/charts/IncomeExpenseChart'
import { SavingsRateChart } from '../components/charts/SavingsRateChart'
import { BalanceCard } from '../components/dashboard/BalanceCard'
import { BalanceCheck } from '../components/dashboard/BalanceCheck'
import { DateRangePicker } from '../components/dashboard/DateRangePicker'
import { RecentTransactions } from '../components/dashboard/RecentTransactions'
import { SpendingBreakdown } from '../components/dashboard/SpendingBreakdown'
import { StatCard } from '../components/dashboard/StatCard'
import { InsightCard } from '../components/insights/InsightCard'
import { Card } from '../components/ui/Card'
import { fieldClass } from '../components/ui/fieldClass'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { Section } from '../components/ui/Section'
import { useInsights } from '../hooks/useInsights'
import { usePeriod } from '../hooks/usePeriod'
import { moneyChange, pointsChange } from '../lib/analytics/change'
import { buildDashboard } from '../lib/analytics/dashboard'
import { ALL_GRANULARITIES, type Granularity } from '../lib/analytics/granularity'
import { COMPARISON_MODES, presetAnchor, type ComparisonMode } from '../lib/analytics/reportPeriod'
import { budgetSummary } from '../lib/budgets/budgets'
import { formatDay, formatMonth, todayISO } from '../lib/dates'
import { formatCents, formatPercent } from '../lib/money'
import { availableMonths, latestDate } from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'
import { balancePointId, closingPointDate, type BalancePoint } from '../types/balance'

const SECTION_DELAY = { animationDelay: '300ms' }
const NO_CHECKPOINTS: never[] = []

export function DashboardPage() {
  const { status, isSample, transactions, accounts } = useDisplayData()
  const savedPoints = useFinanceStore((s) => s.balancePoints)
  const savedCheckpoints = useFinanceStore((s) => s.statementBalances)
  const setBalancePoint = useFinanceStore((s) => s.setBalancePoint)
  const imports = useFinanceStore((s) => s.imports)
  // Sample data is never saved, so balances typed against it stay in memory only.
  const [samplePoints, setSamplePoints] = useState<BalancePoint[]>([])
  const points = isSample ? samplePoints : savedPoints
  const checkpoints = isSample ? NO_CHECKPOINTS : savedCheckpoints
  const loadError = useFinanceStore((s) => s.error)
  const budgets = useFinanceStore((s) => s.budgets)
  const [flowGranularity, setFlowGranularity] = useState<Granularity | null>(null)

  // The period lives in the URL (?month=… or ?from=…&to=…, plus ?compare= and
  // ?account=), so it survives a refresh, and is remembered across pages.
  const months = useMemo(() => availableMonths(transactions), [transactions])
  const { selection, comparison, accountId: requestedAccount, update, reset } = usePeriod(months)
  const accountId = requestedAccount && accounts.some((a) => a.id === requestedAccount) ? requestedAccount : undefined
  const month = selection?.kind === 'month' ? selection.month : undefined
  const { insights } = useInsights(month)
  const latest = useMemo(() => latestDate(transactions), [transactions])
  const anchor = presetAnchor(todayISO(), latest)

  // useMemo: only recompute when the inputs change, not on every render.
  const data = useMemo(
    () => (selection ? buildDashboard(transactions, accounts, selection, points, { comparison, accountId, checkpoints, granularity: flowGranularity ?? undefined }) : null),
    [transactions, accounts, selection, points, comparison, accountId, checkpoints, flowGranularity],
  )
  const budgetData = useMemo(
    () => (month && !accountId && budgets.length > 0 ? budgetSummary(transactions, budgets, month, latest) : null),
    [transactions, budgets, month, accountId, latest],
  )

  if (status === 'loading') return null // IndexedDB loads in a few milliseconds
  if (status === 'error') {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card className="border-negative/40 text-sm text-negative">{loadError}</Card>
      </>
    )
  }
  if (!selection || !data) return <EmptyDashboard />

  const { period, current, previous } = data
  const isCustom = period.kind === 'custom'
  const comparing = period.previous !== null
  const comparisonLabel = !comparing ? '' : comparison === 'previous-period' && isCustom ? `vs previous ${period.days} days` : `vs ${period.previousLabel}`
  const noPrevious = !comparing ? 'No comparison selected' : 'No data in the comparison period'
  const pct = (n: number) => formatPercent(n)
  const pts = (n: number) => `${n.toFixed(1)} pts`
  const accountName = accountId ? accounts.find((a) => a.id === accountId)?.name : null
  const count = `${data.transactionCount} ${data.transactionCount === 1 ? 'transaction' : 'transactions'}${data.transferCount > 0 ? ` (${data.transferCount} transfers)` : ''}`
  const description = isCustom
    ? `Custom period · ${period.label} · ${period.days} days · ${count}${period.isPartial ? ' · your data stops here' : ''}`
    : `Calendar month · ${period.isPartial ? `${formatMonth(month!)}, month to date (${period.label})` : period.label} · ${count}`
  const transactionsLink = `/transactions?from=${period.current.start}&to=${period.current.end}${accountId ? `&account=${accountId}` : ''}`
  const lastImport = imports[0]?.importedAt
  const flowNoun = ALL_GRANULARITIES.find((g) => g.value === data.cashFlow.granularity)!.noun
  const largest = data.largestExpense

  async function saveBalances(account: string, values: { opening?: number | null; actualClosing: number | null }) {
    const writes: [string, number | null][] = [[closingPointDate(period.current.end), values.actualClosing]]
    if (values.opening !== undefined) writes.unshift([period.current.start, values.opening])
    if (!isSample) {
      for (const [date, amount] of writes) await setBalancePoint(account, date, amount)
      return
    }
    setSamplePoints((list) => {
      let next = list
      for (const [date, amount] of writes) {
        const id = balancePointId(account, date)
        next = next.filter((p) => p.id !== id)
        if (amount !== null) next = [...next, { id, accountId: account, date, amount, updatedAt: new Date().toISOString() }]
      }
      return next
    })
  }

  return (
    <>
      <PageHeader title="Dashboard" description={`${description}${accountName ? ` · ${accountName} only` : ''}`} />

      <div className="-mt-4 mb-6 flex flex-col gap-3 rounded-2xl border border-navy-600/60 bg-navy-900/40 p-3 sm:flex-row sm:flex-wrap sm:items-center" role="group" aria-label="Dashboard filters">
        <DateRangePicker
          key={`${period.requested.start}/${period.requested.end}`}
          selection={selection}
          period={period}
          months={months}
          anchor={anchor}
          onApply={(s) => update({ selection: s })}
          onReset={() => {
            setFlowGranularity(null)
            reset()
          }}
        />
        <label className="flex items-center gap-2 text-xs text-ink-faint">
          Compare with
          <select aria-label="Compare with" className={`${fieldClass} min-w-0 flex-1 py-1.5 sm:flex-none`} value={comparison} onChange={(e) => update({ comparison: e.target.value as ComparisonMode })}>
            {COMPARISON_MODES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {accounts.length > 1 && (
          <label className="flex items-center gap-2 text-xs text-ink-faint">
            Account
            <select aria-label="Account" className={`${fieldClass} min-w-0 flex-1 py-1.5 sm:flex-none`} value={accountId ?? ''} onChange={(e) => update({ accountId: e.target.value || null })}>
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-[11px] text-ink-faint sm:ml-auto sm:text-right">
          {latest && <>Latest transaction {formatDay(latest)}, {latest.slice(0, 4)}</>}
          {lastImport && <span className="block">Last import {new Date(lastImport).toLocaleDateString('en-CA', { dateStyle: 'medium' })}</span>}
        </p>
      </div>

      {isSample && <SampleDataNotice />}

      {isCustom && (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-navy-600 bg-navy-800/60 px-4 py-2.5 text-sm text-ink-muted" data-testid="custom-period-note">
          <CalendarRange aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
          <span>
            <span className="font-medium text-ink">Custom period: {period.label}.</span> Every total and chart covers exactly these dates, both ends included
            {comparing ? `, and is compared with ${COMPARISON_MODES.find((c) => c.value === comparison)!.label.toLowerCase()} (${period.previousLabel})` : ''}. Budgets and insights work per
            calendar month, so they’re shown in Calendar month view.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-6">
        <BalanceCard balance={data.balance} accounts={data.accountBalances} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Income"
            icon={TrendingUp}
            value={formatCents(current.income)}
            change={previous && moneyChange(current.income, previous.income, true)}
            formatChange={pct}
            comparisonLabel={comparisonLabel}
            hint={noPrevious}
            note="Money earned; transfers and refunds excluded"
            style={{ animationDelay: '60ms' }}
          />
          <StatCard
            label="Expenses"
            icon={TrendingDown}
            value={formatCents(current.expenses)}
            change={previous && moneyChange(current.expenses, previous.expenses, false)}
            formatChange={pct}
            comparisonLabel={comparisonLabel}
            hint={noPrevious}
            note="Spending with refunds subtracted"
            style={{ animationDelay: '120ms' }}
          />
          <StatCard
            label="Net cash flow"
            icon={Scale}
            value={formatCents(current.net)}
            negative={current.net < 0}
            change={previous && moneyChange(current.net, previous.net, true)}
            formatChange={pct}
            comparisonLabel={comparisonLabel}
            hint={noPrevious}
            note="Income − expenses"
            style={{ animationDelay: '180ms' }}
          />
          <StatCard
            label="Savings rate"
            icon={PiggyBank}
            value={formatPercent(current.savingsRate, 2)}
            negative={current.savingsRate !== null && current.savingsRate < 0}
            change={previous && pointsChange(current.savingsRate, previous.savingsRate, true)}
            formatChange={pts}
            comparisonLabel={comparisonLabel}
            hint={current.savingsRate === null ? 'No income in this period' : noPrevious}
            note="Net cash flow ÷ income; change in percentage points"
            style={{ animationDelay: '240ms' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <MiniStat icon={CalendarDays} label="Average daily spending" value={formatCents(data.averageDailySpending)} note={`Expenses ÷ ${period.days} days`} />
          <MiniStat icon={ArrowDownLeft} label="Average daily income" value={formatCents(data.averageDailyIncome)} note={`Income ÷ ${period.days} days`} />
          <MiniStat
            icon={Receipt}
            label="Largest expense"
            value={largest ? formatCents(-largest.amount) : '—'}
            note={largest ? `${largest.description} · ${formatDay(largest.date)}` : 'No spending in this period'}
          />
          <MiniStat icon={Hash} label="Transactions" value={data.transactionCount.toLocaleString()} note={data.largestIncome ? `Largest deposit ${formatCents(data.largestIncome.amount)}` : 'Including transfers'} />
        </div>

        <Section
          title="Balance check"
          subtitle={`Opening balance + income − expenses ± transfers = where each bank account should be at the end of ${formatDay(period.current.end)}. Your current balance above doesn’t change with the period.`}
          style={SECTION_DELAY}
        >
          <BalanceCheck transactions={transactions} accounts={accountId ? accounts.filter((a) => a.id === accountId) : accounts} period={period} points={points} checkpoints={checkpoints} onSave={saveBalances} />
        </Section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Section
            style={SECTION_DELAY}
            title="Cash flow"
            subtitle={`Income and expenses per ${flowNoun}, only days inside the period`}
            className="lg:col-span-3"
            action={
              <div role="group" aria-label="Group cash flow by" className="inline-flex rounded-lg border border-navy-600 bg-navy-800 p-0.5">
                {ALL_GRANULARITIES.filter((g) => g.value !== 'quarter').map((g) => {
                  const tooMany = (g.value === 'day' && period.days > 120) || (g.value === 'week' && period.days > 730)
                  return (
                    <button
                      key={g.value}
                      type="button"
                      disabled={tooMany}
                      title={tooMany ? 'Too many bars for this period' : undefined}
                      aria-pressed={data.cashFlow.granularity === g.value}
                      onClick={() => setFlowGranularity(g.value)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${data.cashFlow.granularity === g.value ? 'bg-navy-600 text-ink' : 'text-ink-muted hover:text-ink'}`}
                    >
                      {g.label}
                    </button>
                  )
                })}
              </div>
            }
          >
            <IncomeExpenseChart data={data.cashFlow.rows} granularity={data.cashFlow.granularity} partialThrough={period.isPartial ? formatDay(period.current.end) : undefined} />
          </Section>
          <Section
            title="Spending breakdown"
            subtitle={`By category, ${period.label}`}
            className="lg:col-span-2"
            style={SECTION_DELAY}
            action={
              <Link to="/analytics" className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-positive">
                Details <ArrowRight aria-hidden className="size-4" />
              </Link>
            }
          >
            <SpendingBreakdown categories={data.categories} />
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Account balance history" subtitle="End-of-day balance, built only from real balances" style={SECTION_DELAY}>
            <BalanceHistoryChart history={data.balanceHistory} />
          </Section>
          <Section
            title="Savings rate trend"
            subtitle={isCustom ? 'Each month in your period, counting only days inside it' : `Last ${data.trend.length} ${data.trend.length === 1 ? 'month' : 'months'}`}
            style={SECTION_DELAY}
          >
            {data.trend.length < 2 ? (
              <p className="py-10 text-center text-sm text-ink-faint">A trend needs at least two months. This period has {data.trend.length}.</p>
            ) : (
              <SavingsRateChart data={data.trend} partialThrough={period.isPartial ? formatDay(period.current.end) : undefined} />
            )}
          </Section>
        </div>

        {comparing && (
          <Section title="Category changes" subtitle={`${period.label} vs ${period.previousLabel}`} style={SECTION_DELAY}>
            {previous ? (
              <CategoryComparison changes={data.categoryChanges} currentLabel="This period" previousLabel="Compared with" />
            ) : (
              <p className="py-6 text-center text-sm text-ink-faint">No transactions in the comparison period ({period.previousLabel}).</p>
            )}
          </Section>
        )}

        {!isCustom && !accountId && (
          <Section
            title="Budgets"
            subtitle={budgetData ? `${formatCents(budgetData.totalSpent)} of ${formatCents(budgetData.totalBudget)} spent${period.isPartial ? ' so far' : ''}` : 'Set a monthly limit for any category'}
            style={SECTION_DELAY}
            action={
              <Link to={`/budgets?month=${month}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-positive">
                {budgetData ? 'All budgets' : 'Set budgets'} <ArrowRight aria-hidden className="size-4" />
              </Link>
            }
          >
            {budgetData ? (
              <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {budgetData.lines
                  .filter((l) => l.budget !== null)
                  .slice(0, 4)
                  .map((line) => (
                    <li key={line.category}>
                      <BudgetBar line={line} pace={budgetData.isPartial ? budgetData.monthElapsed : undefined} />
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-faint">No budgets yet. Budgets update by themselves as you import, add or edit transactions.</p>
            )}
          </Section>
        )}

        {!isCustom && !accountId && insights && insights.length > 0 && (
          <Section
            title="Insights"
            subtitle="Calculated from your numbers"
            style={SECTION_DELAY}
            action={
              <Link to={`/insights?month=${month}`} className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-positive">
                All insights <ArrowRight aria-hidden className="size-4" />
              </Link>
            }
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {insights.slice(0, 3).map((insight) => (
                <InsightCard key={insight.id} insight={insight} compact />
              ))}
            </div>
          </Section>
        )}

        <Section
          title="Recent transactions"
          style={SECTION_DELAY}
          subtitle={`Latest in ${period.label}`}
          action={
            <Link to={transactionsLink} className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-positive">
              View all {data.transactionCount} <ArrowRight aria-hidden className="size-4" />
            </Link>
          }
        >
          <RecentTransactions transactions={data.recent} />
        </Section>
      </div>
    </>
  )
}

function MiniStat({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return (
    <Card className="flex min-w-0 items-start gap-3 p-4">
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-lg bg-navy-700/70 text-ink-faint">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="mt-0.5 text-lg font-semibold tabular">{value}</p>
        <p className="truncate text-[11px] text-ink-faint" title={note}>
          {note}
        </p>
      </div>
    </Card>
  )
}

function EmptyDashboard() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <Card className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-medium">No transactions yet</p>
        <p className="max-w-sm text-sm text-ink-faint">Import a CSV bank statement to see your income, spending and savings.</p>
        <Link
          to="/upload"
          className="inline-flex items-center gap-2 rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-navy-950 hover:brightness-110"
        >
          <Upload aria-hidden className="size-4" /> Import transactions
        </Link>
      </Card>
    </>
  )
}

