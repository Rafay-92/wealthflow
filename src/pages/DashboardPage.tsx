import { ArrowRight, CalendarRange, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { BudgetBar } from '../components/budgets/BudgetBar'
import { IncomeExpenseChart } from '../components/charts/IncomeExpenseChart'
import { BalanceCard } from '../components/dashboard/BalanceCard'
import { BalanceCheck } from '../components/dashboard/BalanceCheck'
import { PeriodPicker } from '../components/dashboard/PeriodPicker'
import { RecentTransactions } from '../components/dashboard/RecentTransactions'
import { SpendingBreakdown } from '../components/dashboard/SpendingBreakdown'
import { StatCard } from '../components/dashboard/StatCard'
import { InsightCard } from '../components/insights/InsightCard'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { Section } from '../components/ui/Section'
import { useInsights } from '../hooks/useInsights'
import { moneyChange, pointsChange } from '../lib/analytics/change'
import { buildDashboard } from '../lib/analytics/dashboard'
import { selectionFromParams, selectionToParams } from '../lib/analytics/reportPeriod'
import { budgetSummary } from '../lib/budgets/budgets'
import { formatDay, formatMonth } from '../lib/dates'
import { formatCents, formatPercent } from '../lib/money'
import { availableMonths, latestDate } from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'
import { balancePointId, closingPointDate, type BalancePoint } from '../types/balance'

const SECTION_DELAY = { animationDelay: '300ms' }

export function DashboardPage() {
  const { status, isSample, transactions, accounts } = useDisplayData()
  const [searchParams, setSearchParams] = useSearchParams()
  const savedPoints = useFinanceStore((s) => s.balancePoints)
  const setBalancePoint = useFinanceStore((s) => s.setBalancePoint)
  // Sample data is never saved, so balances typed against it stay in memory only.
  const [samplePoints, setSamplePoints] = useState<BalancePoint[]>([])
  const points = isSample ? samplePoints : savedPoints
  const loadError = useFinanceStore((s) => s.error)
  const budgets = useFinanceStore((s) => s.budgets)

  // The period lives in the URL (?month=2026-10 or ?from=…&to=…), so it
  // survives a refresh and the browser's back button works.
  const months = useMemo(() => availableMonths(transactions), [transactions])
  const selection = useMemo(() => selectionFromParams(searchParams, months), [searchParams, months])
  const month = selection?.kind === 'month' ? selection.month : undefined
  const { insights } = useInsights(month)

  // useMemo: only recompute when the inputs change, not on every render.
  const data = useMemo(() => (selection ? buildDashboard(transactions, accounts, selection, points) : null), [transactions, accounts, selection, points])
  const budgetData = useMemo(
    () => (month && budgets.length > 0 ? budgetSummary(transactions, budgets, month, latestDate(transactions)) : null),
    [transactions, budgets, month],
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
  const comparisonLabel = isCustom ? `vs previous ${period.days} days` : `vs ${period.previousLabel}`
  const noPrevious = isCustom ? 'No data in the previous period' : 'No earlier month to compare'
  const pct = (n: number) => formatPercent(n)
  const pts = (n: number) => `${n.toFixed(1)} pts`
  const count = `${data.transactionCount} ${data.transactionCount === 1 ? 'transaction' : 'transactions'}${data.transferCount > 0 ? ` (${data.transferCount} transfers)` : ''}`
  const description = isCustom
    ? `Custom period · ${period.label} · ${period.days} days · ${count}${period.isPartial ? ' · your data stops here' : ''}`
    : `Calendar month · ${period.isPartial ? `${formatMonth(month!)}, month to date (${period.label})` : period.label} · ${count}`
  const transactionsLink = `/transactions?from=${period.current.start}&to=${period.current.end}`

  async function saveBalances(accountId: string, values: { opening?: number | null; actualClosing: number | null }) {
    const writes: [string, number | null][] = [[closingPointDate(period.current.end), values.actualClosing]]
    if (values.opening !== undefined) writes.unshift([period.current.start, values.opening])
    if (!isSample) {
      for (const [date, amount] of writes) await setBalancePoint(accountId, date, amount)
      return
    }
    setSamplePoints((list) => {
      let next = list
      for (const [date, amount] of writes) {
        const id = balancePointId(accountId, date)
        next = next.filter((p) => p.id !== id)
        if (amount !== null) next = [...next, { id, accountId, date, amount, updatedAt: new Date().toISOString() }]
      }
      return next
    })
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={description}
        actions={<PeriodPicker key={isCustom ? 'custom' : 'month'} selection={selection} period={period} months={months} onChange={(s) => setSearchParams(selectionToParams(s))} />}
      />

      {isSample && <SampleDataNotice />}

      {isCustom && (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-navy-600 bg-navy-800/60 px-4 py-2.5 text-sm text-ink-muted" data-testid="custom-period-note">
          <CalendarRange aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
          <span>
            <span className="font-medium text-ink">Custom period: {formatDay(period.current.start)} to {formatDay(period.current.end)}, {period.current.end.slice(0, 4)}.</span> Every total, chart and the balance check
            cover exactly these dates and are compared with the {period.days} days before ({period.previousLabel}). Budgets and insights work per calendar month, so they’re shown in Calendar month view.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-6">
        <BalanceCard balance={data.balance} accounts={data.accountBalances} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Income"
            value={formatCents(current.income)}
            change={previous && moneyChange(current.income, previous.income, true)}
            formatChange={pct}
            comparisonLabel={comparisonLabel}
            hint={noPrevious}
            style={{ animationDelay: '60ms' }}
          />
          <StatCard
            label="Expenses"
            value={formatCents(current.expenses)}
            change={previous && moneyChange(current.expenses, previous.expenses, false)}
            formatChange={pct}
            comparisonLabel={comparisonLabel}
            hint={noPrevious}
            style={{ animationDelay: '120ms' }}
          />
          <StatCard
            label="Net cash flow"
            value={formatCents(current.net)}
            change={previous && moneyChange(current.net, previous.net, true)}
            formatChange={pct}
            comparisonLabel={comparisonLabel}
            hint={noPrevious}
            style={{ animationDelay: '180ms' }}
          />
          <StatCard
            label="Savings rate"
            value={formatPercent(current.savingsRate, 2)}
            change={previous && pointsChange(current.savingsRate, previous.savingsRate, true)}
            formatChange={pts}
            comparisonLabel={comparisonLabel}
            hint={current.savingsRate === null ? 'No income this period' : noPrevious}
            style={{ animationDelay: '240ms' }}
          />
        </div>

        <Section
          title="Balance check"
          subtitle={`Opening balance + income − expenses ± transfers = where each bank account should end ${isCustom ? 'the period' : 'the month'}`}
          style={SECTION_DELAY}
        >
          <BalanceCheck transactions={transactions} accounts={accounts} period={period} points={points} onSave={saveBalances} />
        </Section>

        {!isCustom && (
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

        {!isCustom && insights && insights.length > 0 && (
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Section
            style={SECTION_DELAY}
            title="Income vs expenses"
            subtitle={isCustom ? 'Each month in your period, counting only days inside it' : data.trend.length === 1 ? 'This month' : `Last ${data.trend.length} months`}
            className="lg:col-span-3"
          >
            <IncomeExpenseChart data={data.trend} partialThrough={period.isPartial ? formatDay(period.current.end) : undefined} />
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
