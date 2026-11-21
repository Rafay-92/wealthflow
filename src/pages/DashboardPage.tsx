import { ArrowRight, Upload } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { IncomeExpenseChart } from '../components/charts/IncomeExpenseChart'
import { BalanceCard } from '../components/dashboard/BalanceCard'
import { MonthSelect } from '../components/dashboard/MonthSelect'
import { RecentTransactions } from '../components/dashboard/RecentTransactions'
import { SpendingBreakdown } from '../components/dashboard/SpendingBreakdown'
import { StatCard } from '../components/dashboard/StatCard'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { moneyChange, pointsChange } from '../lib/analytics/change'
import { buildDashboard } from '../lib/analytics/dashboard'
import type { Period } from '../lib/analytics/periods'
import { formatDay, formatMonth } from '../lib/dates'
import { formatCents, formatPercent } from '../lib/money'
import { availableMonths } from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'

function formatPeriod({ start, end }: Period): string {
  // "Oct 1–20" when in one month, which is always the case on the dashboard.
  return `${formatDay(start)}–${Number(end.slice(8))}`
}

export function DashboardPage() {
  const { status, isSample, transactions, accounts } = useDisplayData()
  const loadError = useFinanceStore((s) => s.error)

  // The selected month lives in the URL (?month=2026-10), so it survives a
  // refresh and the browser's back button works.
  const [searchParams, setSearchParams] = useSearchParams()
  const months = useMemo(() => availableMonths(transactions), [transactions])
  const requested = searchParams.get('month')
  const month = requested && months.includes(requested) ? requested : months[0]

  // useMemo: only recompute when the inputs change, not on every render.
  const data = useMemo(
    () => (month ? buildDashboard(transactions, accounts, month) : null),
    [transactions, accounts, month],
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
  if (!month || !data) return <EmptyDashboard />

  const { comparison, current, previous } = data
  const previousMonthLabel = formatMonth(comparison.previous.start.slice(0, 7), 'short')
  const comparisonLabel = comparison.isPartial
    ? `vs ${formatPeriod(comparison.previous)}`
    : `vs ${previousMonthLabel}`
  const noPrevious = 'No earlier month to compare'
  const pct = (n: number) => formatPercent(n)
  const pts = (n: number) => `${n.toFixed(1)} pts`

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          comparison.isPartial
            ? `${formatMonth(month)} · month to date (${formatPeriod(comparison.current)})`
            : formatMonth(month)
        }
        actions={
          <MonthSelect months={months} value={month} onChange={(m) => setSearchParams({ month: m })} />
        }
      />

      {isSample && <SampleDataNotice />}

      <div className="flex flex-col gap-6">
        <BalanceCard balance={data.balance} accounts={accounts} />

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
            label="Net savings"
            value={formatCents(current.net)}
            change={previous && moneyChange(current.net, previous.net, true)}
            formatChange={pct}
            comparisonLabel={comparisonLabel}
            hint={noPrevious}
            style={{ animationDelay: '180ms' }}
          />
          <StatCard
            label="Savings rate"
            value={formatPercent(current.savingsRate)}
            change={previous && pointsChange(current.savingsRate, previous.savingsRate, true)}
            formatChange={pts}
            comparisonLabel={comparisonLabel}
            hint={current.savingsRate === null ? 'No income this period' : noPrevious}
            style={{ animationDelay: '240ms' }}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Section title="Income vs expenses" subtitle={data.trend.length === 1 ? 'This month' : `Last ${data.trend.length} months`} className="lg:col-span-3">
            <IncomeExpenseChart
              data={data.trend}
              partialThrough={comparison.isPartial ? formatDay(comparison.current.end) : undefined}
            />
          </Section>
          <Section title="Spending breakdown" subtitle="By category, this period" className="lg:col-span-2">
            <SpendingBreakdown categories={data.categories} />
          </Section>
        </div>

        <Section
          title="Recent transactions"
          subtitle={`Latest in ${formatMonth(month)}`}
          action={
            <Link
              to="/transactions"
              className="inline-flex items-center gap-1 text-sm font-medium text-ink-muted transition-colors hover:text-positive"
            >
              View all <ArrowRight aria-hidden className="size-4" />
            </Link>
          }
        >
          <RecentTransactions transactions={data.recent} />
        </Section>
      </div>
    </>
  )
}

interface SectionProps {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
  children: ReactNode
}

function Section({ title, subtitle, action, className = '', children }: SectionProps) {
  return (
    <Card className={`motion-safe:animate-rise ${className}`} style={{ animationDelay: '300ms' }}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
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
