import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CategoryComparison } from '../components/analytics/CategoryComparison'
import { CategoryRanking } from '../components/analytics/CategoryRanking'
import { GranularitySelect } from '../components/analytics/GranularitySelect'
import { RangeSelect } from '../components/analytics/RangeSelect'
import { DateRangePicker } from '../components/dashboard/DateRangePicker'
import { usePeriod } from '../hooks/usePeriod'
import { autoGranularity, ALL_GRANULARITIES } from '../lib/analytics/granularity'
import { formatRange, presetAnchor, resolvePeriod } from '../lib/analytics/reportPeriod'
import { availableMonths, latestDate } from '../lib/transactions'
import { CategoryLabel } from '../components/CategoryLabel'
import { CategoryTrendChart } from '../components/charts/CategoryTrendChart'
import { IncomeExpenseChart } from '../components/charts/IncomeExpenseChart'
import { SavingsRateChart } from '../components/charts/SavingsRateChart'
import { StatCard } from '../components/dashboard/StatCard'
import { buttonClasses } from '../components/ui/buttonClasses'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { Section } from '../components/ui/Section'
import { buildAnalytics, categoryByBucket, daysInPeriod, largestExpenses, MAX_QUARTERS, type RangePreset } from '../lib/analytics/analytics'
import { formatBucket, GRANULARITIES, previousBucket, type Granularity } from '../lib/analytics/granularity'
import type { Period } from '../lib/analytics/periods'
import { formatDay, formatMonth, todayISO } from '../lib/dates'
import { formatCents, formatPercent } from '../lib/money'
import { useDisplayData } from '../store/financeStore'
import type { Category } from '../types/transaction'

function describePeriod({ start, end }: Period): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4)
  return `${formatDay(start)}${sameYear ? '' : `, ${start.slice(0, 4)}`} – ${formatDay(end)}, ${end.slice(0, 4)}`
}

export function AnalyticsPage() {
  const { status, isSample, transactions, accounts } = useDisplayData()
  const [range, setRange] = useState<RangePreset>(6)
  const [picked, setPicked] = useState<Category | null>(null)
  // A custom range is shared with the Dashboard and Reports (remembered for this session).
  const months = useMemo(() => availableMonths(transactions), [transactions])
  const latest = useMemo(() => latestDate(transactions), [transactions])
  const { selection, update, reset } = usePeriod(months)
  const [custom, setCustom] = useState(() => selection?.kind === 'custom')
  // A custom range starts with a grouping that suits its length (daily for a month).
  const [granularity, setGranularity] = useState<Granularity>(() =>
    selection?.kind === 'custom' ? autoGranularity(resolvePeriod(selection, latest).current) : 'month',
  )
  const customPeriod = useMemo(() => (custom && selection ? resolvePeriod(selection, latest) : null), [custom, selection, latest])
  const data = useMemo(() => buildAnalytics(transactions, range, granularity, customPeriod?.requested), [transactions, range, granularity, customPeriod])

  // The selected category: your pick if it still has spending in this range, else the top one.
  const selected = data && (data.categories.find((c) => c.category === picked)?.category ?? data.categories[0]?.category ?? null)

  const categoryTrend = useMemo(
    () => (data && selected ? categoryByBucket(transactions, selected, data.buckets) : []),
    [transactions, data, selected],
  )
  const categoryLargest = useMemo(
    () =>
      data && selected
        ? largestExpenses(
            transactions.filter((t) => t.category === selected),
            data.period,
            5,
          )
        : [],
    [transactions, data, selected],
  )

  if (status === 'loading') return null
  if (!data) {
    return (
      <>
        <PageHeader title="Analytics" />
        <Card className="py-16 text-center">
          <p className="font-medium">Nothing to analyse yet</p>
          <Link to="/upload" className={buttonClasses('primary', 'mt-4')}>
            Import transactions
          </Link>
        </Card>
      </>
    )
  }

  const { summary, comparison } = data
  const partialThrough = comparison.isPartial ? formatDay(comparison.current.end) : undefined
  const days = daysInPeriod(data.period)
  const monthCount = data.months.length
  const noun = ALL_GRANULARITIES.find((g) => g.value === granularity)!.noun
  const nouns = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`
  const bucketCount = data.monthly.length
  const partialRange = (p: Period) => `${formatDay(p.start)} – ${formatDay(p.end)}`
  const currentLabel = customPeriod
    ? formatRange(comparison.current)
    : granularity === 'month'
      ? comparison.isPartial
        ? `${formatMonth(data.months.at(-1)!, 'short')} 1–${Number(comparison.current.end.slice(8))}`
        : formatMonth(data.months.at(-1)!, 'short')
      : comparison.isPartial
        ? `${formatBucket(comparison.month, granularity)} (${partialRange(comparison.current)})`
        : formatBucket(comparison.month, granularity)
  const previousLabel = customPeriod
    ? formatRange(comparison.previous)
    : granularity === 'month'
      ? comparison.isPartial
        ? `${formatMonth(comparison.previous.start.slice(0, 7), 'short')} 1–${Number(comparison.previous.end.slice(8))}`
        : formatMonth(comparison.previous.start.slice(0, 7), 'short')
      : comparison.isPartial
        ? `${formatBucket(previousBucket(comparison.month, granularity), granularity)} (${partialRange(comparison.previous)})`
        : formatBucket(previousBucket(comparison.month, granularity), granularity)
  const overTitle = customPeriod ? 'Period over period' : `${noun[0]!.toUpperCase()}${noun.slice(1)} over ${noun}`
  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`${customPeriod ? 'Custom period' : 'Recent months'} · ${describePeriod(data.period)} · ${days} days of data`}
        actions={
          <>
            <GranularitySelect
              value={granularity}
              onChange={setGranularity}
              options={customPeriod ? ALL_GRANULARITIES.filter((g) => (g.value !== 'day' || days <= 120) && (g.value !== 'week' || days <= 730)) : GRANULARITIES}
            />
            {!customPeriod && granularity === 'month' && <RangeSelect value={range} onChange={setRange} />}
            <button
              type="button"
              aria-pressed={custom}
              onClick={() => {
                const next = !custom
                setCustom(next)
                if (next && selection) {
                  setGranularity(autoGranularity(resolvePeriod(selection, latest).current))
                  if (selection.kind === 'month') update({ selection: { kind: 'custom', ...resolvePeriod(selection, latest).current } })
                } else setGranularity('month')
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${custom ? 'border-positive/60 bg-positive-soft text-positive' : 'border-navy-600 text-ink-muted hover:text-ink'}`}
            >
              Custom range
            </button>
            {customPeriod && selection && (
              <DateRangePicker
                key={`${customPeriod.requested.start}/${customPeriod.requested.end}`}
                selection={selection}
                period={customPeriod}
                months={months}
                anchor={presetAnchor(todayISO(), latest)}
                onApply={(s) => {
                  update({ selection: s })
                  setGranularity(autoGranularity(resolvePeriod(s, latest).current))
                }}
                onReset={() => {
                  reset()
                  setCustom(false)
                  setGranularity('month')
                }}
              />
            )}
          </>
        }
      />

      {isSample && <SampleDataNotice />}

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total spending" value={formatCents(summary.expenses)} hint={`${formatCents(Math.round(summary.expenses / monthCount))} per month on average`} />
          <StatCard label="Average daily spending" value={formatCents(data.averageDaily)} hint={`Across ${days} days, transfers excluded`} />
          <StatCard label="Total income" value={formatCents(summary.income)} hint={`${formatCents(summary.net)} saved`} />
          <StatCard label="Savings rate" value={formatPercent(summary.savingsRate)} hint={summary.savingsRate === null ? 'No income in this period' : 'Share of income you kept'} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Section title="Spending by category" subtitle="Select a category to explore it" className="lg:col-span-2">
            <CategoryRanking categories={data.categories} monthCount={monthCount} selected={selected} onSelect={setPicked} />
          </Section>

          {selected && (
            <Section title={`${selected} over time`} subtitle={`Spending per ${noun}`} className="lg:col-span-3">
              <CategoryTrendChart category={selected} data={categoryTrend} partialThrough={partialThrough} granularity={granularity} />
              <h3 className="mt-6 mb-2 text-sm font-medium">Biggest {selected.toLowerCase()} purchases</h3>
              <ul className="divide-y divide-navy-600/40">
                {categoryLargest.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-14 shrink-0 text-ink-faint tabular">{formatDay(t.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{t.description}</span>
                    <span className="shrink-0 tabular">{formatCents(-t.amount)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section
            title="Income vs expenses"
            subtitle={`Per ${noun} · ${nouns(bucketCount)}${granularity === 'quarter' && bucketCount === MAX_QUARTERS ? ' (latest)' : ''}`}
          >
            <IncomeExpenseChart data={data.monthly} partialThrough={partialThrough} granularity={granularity} />
          </Section>
          <Section title="Savings rate" subtitle={`Share of income kept each ${noun}`}>
            <SavingsRateChart data={data.monthly} partialThrough={partialThrough} granularity={granularity} />
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Section
            title={overTitle}
            subtitle={comparison.isPartial ? `Same days compared: ${currentLabel} vs ${previousLabel}` : `${currentLabel} vs ${previousLabel}`}
            className="lg:col-span-3"
          >
            <CategoryComparison changes={data.categoryChanges} currentLabel={currentLabel} previousLabel={previousLabel} />
          </Section>

          <Section title="Largest purchases" subtitle="Biggest single payments in this period" className="lg:col-span-2">
            <ol className="divide-y divide-navy-600/40">
              {data.largest.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-4 shrink-0 text-right text-xs text-ink-faint tabular">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.description}</p>
                    {/* Each piece carries its own leading dot, so a wrapped line never starts or ends with a stray "·". */}
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-ink-faint">
                      <span>{formatDay(t.date)}</span>
                      {accountName(t.accountId) && <span className="whitespace-nowrap">· {accountName(t.accountId)}</span>}
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        · <CategoryLabel category={t.category} />
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 font-medium tabular">{formatCents(-t.amount)}</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {comparison.isPartial && (
          <p className="text-xs text-ink-faint">
            * {formatBucket(comparison.month, granularity, 'long')} is {noun} to date: your data runs through {partialThrough}.
          </p>
        )}
      </div>
    </>
  )
}
