import { AlertCircle, AlertTriangle, Check, FileDown, Info, Repeat } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CategoryLabel } from '../components/CategoryLabel'
import { PeriodPicker } from '../components/dashboard/PeriodPicker'
import { SpendingBreakdown } from '../components/dashboard/SpendingBreakdown'
import { StatCard } from '../components/dashboard/StatCard'
import { Button } from '../components/ui/Button'
import { buttonClasses } from '../components/ui/buttonClasses'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { Section } from '../components/ui/Section'
import { moneyChange, pointsChange } from '../lib/analytics/change'
import { formatDay, formatMonth } from '../lib/dates'
import { formatCents, formatPercent } from '../lib/money'
import { buildReport, type Observation } from '../lib/report/monthlyReport'
import { resolvePeriod, selectionFromParams, selectionToParams } from '../lib/analytics/reportPeriod'
import { OPENING_SOURCE_LABEL } from '../lib/balances/reconcile'
import { availableMonths, latestDate } from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'
import type { BalancePoint } from '../types/balance'

/**
 * Icons say whether an observation is good news, not which way a number moved:
 * "spending fell" is good news but a falling arrow would suggest the opposite.
 */
const TONE_ICON = {
  good: { Icon: Check, className: 'bg-positive-soft text-positive', label: 'Good news' },
  bad: { Icon: AlertTriangle, className: 'bg-negative-soft text-negative', label: 'Worth a look' },
  neutral: { Icon: Info, className: 'bg-navy-700 text-ink-muted', label: 'Note' },
} as const

/** One shared empty list: a new [] each render would make the report rebuild every time. */
const NO_BALANCES: BalancePoint[] = []

export function ReportsPage() {
  const { status, isSample, transactions, accounts } = useDisplayData()
  const savedBalances = useFinanceStore((s) => s.balancePoints)
  const balances = isSample ? NO_BALANCES : savedBalances
  const [searchParams, setSearchParams] = useSearchParams()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const months = useMemo(() => availableMonths(transactions), [transactions])
  const selection = useMemo(() => selectionFromParams(searchParams, months), [searchParams, months])
  const report = useMemo(
    () => (selection ? buildReport(transactions, selection, latestDate(transactions), accounts, balances) : null),
    [transactions, selection, accounts, balances],
  )
  const period = useMemo(() => (selection ? resolvePeriod(selection, latestDate(transactions)) : null), [selection, transactions])

  async function exportPdf() {
    if (!report) return
    setExporting(true)
    setExportError(null)
    try {
      // Code splitting: the PDF library (a few hundred KB) is only downloaded
      // the first time someone exports, not when the app loads.
      const { downloadReportPdf } = await import('../lib/report/reportPdf')
      downloadReportPdf(report, { isSample, generatedAt: new Date() })
    } catch (error) {
      console.error('[WealthFlow] PDF export failed', error)
      setExportError('The PDF couldn’t be created. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  if (status === 'loading') return null
  if (!report || !selection || !period) {
    return (
      <>
        <PageHeader title="Reports" />
        <Card className="py-16 text-center">
          <p className="font-medium">No transactions to report on yet</p>
          <Link to="/upload" className={buttonClasses('primary', 'mt-4')}>
            Import transactions
          </Link>
        </Card>
      </>
    )
  }

  const { summary, previous } = report
  const vs = report.kind === 'custom' ? `vs previous ${period.days} days` : `vs ${report.previousLabel}`

  return (
    <>
      <PageHeader
        title={report.title}
        description={`${report.kind === 'month' ? 'Calendar month' : 'Custom period'} · ${report.subtitle} · ${report.transactionCount} transactions`}
        actions={
          <>
            <PeriodPicker key={selection.kind} selection={selection} period={period} months={months} onChange={(s) => setSearchParams(selectionToParams(s))} />
            <Button variant="primary" onClick={exportPdf} disabled={exporting}>
              <FileDown aria-hidden className="size-4" />
              {exporting ? 'Creating…' : 'Export PDF'}
            </Button>
          </>
        }
      />

      {isSample && <SampleDataNotice />}

      {exportError && (
        <p role="alert" className="mb-4 flex items-center gap-2 rounded-lg bg-negative-soft px-4 py-3 text-sm text-negative">
          <AlertCircle aria-hidden className="size-4" /> {exportError}
        </p>
      )}

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Income" value={formatCents(summary.income)} change={previous && moneyChange(summary.income, previous.income, true)} formatChange={(n) => formatPercent(n)} comparisonLabel={vs} hint="Nothing to compare with" />
          <StatCard label="Spending" value={formatCents(summary.expenses)} change={previous && moneyChange(summary.expenses, previous.expenses, false)} formatChange={(n) => formatPercent(n)} comparisonLabel={vs} hint="Nothing to compare with" />
          <StatCard label="Saved" value={formatCents(summary.net)} change={previous && moneyChange(summary.net, previous.net, true)} formatChange={(n) => formatPercent(n)} comparisonLabel={vs} hint="Nothing to compare with" />
          <StatCard
            label="Savings rate"
            value={formatPercent(summary.savingsRate, 2)}
            change={previous && pointsChange(summary.savingsRate, previous.savingsRate, true)}
            formatChange={(n) => `${n.toFixed(1)} pts`}
            comparisonLabel={vs}
            hint={summary.savingsRate === null ? 'No income this month' : 'Nothing to compare with'}
          />
        </div>

        <Section title="Key observations" subtitle="Calculated from your transactions, never guessed">
          <ul className="flex flex-col gap-3">
            {report.observations.map((o: Observation) => {
              const { Icon, className, label } = TONE_ICON[o.tone]
              return (
                <li key={o.text} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${className}`} title={label}>
                    <Icon aria-hidden className="size-3.5" />
                    <span className="sr-only">{label}:</span>
                  </span>
                  <span className="pt-0.5">{o.text}</span>
                </li>
              )
            })}
          </ul>
        </Section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Spending by category" subtitle={report.periodLabel}>
            <SpendingBreakdown categories={report.categories} maxRows={13} />
          </Section>
          <Section title="Biggest expenses" subtitle="Single payments, transfers excluded">
            <ol className="divide-y divide-navy-600/40">
              {report.biggestExpenses.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="w-4 text-right text-xs text-ink-faint tabular">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.description}</p>
                    <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                      {formatDay(t.date)} · <CategoryLabel category={t.category} />
                    </p>
                  </div>
                  <span className="font-medium tabular">{formatCents(-t.amount)}</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section
            title="Recurring payments"
            subtitle={report.recurringAvailable ? 'Charged once a month at a similar amount' : 'Detected per calendar month'}
            action={<span className="text-sm font-medium tabular">{formatCents(report.recurringTotal)}</span>}
          >
            {!report.recurringAvailable ? (
              <p className="py-6 text-center text-sm text-ink-faint">Recurring payments are found per calendar month. Switch to Calendar month to see them.</p>
            ) : report.recurring.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-faint">None found for this month.</p>
            ) : (
              <ul className="divide-y divide-navy-600/40">
                {report.recurring.map((r) => (
                  <li key={r.key} className="flex items-center gap-3 py-2.5 text-sm">
                    <Repeat aria-hidden className="size-4 shrink-0 text-ink-faint" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{r.name}</p>
                      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                        {formatDay(r.date)} · <CategoryLabel category={r.category} />
                      </p>
                    </div>
                    <span className="tabular">{formatCents(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title={report.kind === 'month' ? 'Recent months' : 'Months in this period'}
            subtitle={report.kind === 'month' ? 'How this month compares' : 'Only days inside your period are counted'}
          >
            <div className="relative -mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-navy-600/60 text-left text-xs text-ink-faint">
                    <th className="py-2 pr-3 font-normal">Month</th>
                    <th className="py-2 pr-3 text-right font-normal">Income</th>
                    <th className="py-2 pr-3 text-right font-normal">Spending</th>
                    <th className="py-2 pr-3 text-right font-normal">Saved</th>
                    <th className="py-2 text-right font-normal">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {report.history.map((h) => (
                    <tr key={h.month} className={`border-b border-navy-600/30 last:border-0 ${report.kind === 'custom' || h.month === report.month ? 'font-medium' : 'text-ink-muted'}`}>
                      <td className="py-2.5 pr-3">
                        {formatMonth(h.month, 'short')}
                        {report.kind === 'month' && report.comparison.isPartial && h.month === report.month && <span className="text-xs text-ink-faint"> (to date)</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular">{formatCents(h.income)}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{formatCents(h.expenses)}</td>
                      <td className={`py-2.5 pr-3 text-right tabular ${h.net < 0 ? 'text-negative' : ''}`}>{formatCents(h.net)}</td>
                      <td className="py-2.5 text-right tabular">{formatPercent(h.savingsRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        {report.balanceChecks.length > 0 && (
          <Section title="Balance check" subtitle="Opening + income − expenses ± transfers = expected closing. Only a user-provided opening can be verified.">
            <div className="relative -mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-navy-600/60 text-left text-xs text-ink-faint">
                    <th className="py-2 pr-3 font-normal">Account</th>
                    <th className="py-2 pr-3 font-normal">Opening source</th>
                    {['Opening', 'Income', 'Expenses', 'Transfers', 'Expected', 'Actual', 'Difference'].map((h) => (
                      <th key={h} className="py-2 pr-3 text-right font-normal last:pr-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.balanceChecks.map((r) => (
                    <tr key={r.accountId} className="border-b border-navy-600/30 last:border-0">
                      <td className="py-2.5 pr-3">{r.accountName}</td>
                      <td className={`py-2.5 pr-3 text-xs ${r.openingSource === 'user' ? 'text-positive' : 'text-warning'}`}>{OPENING_SOURCE_LABEL[r.openingSource!]}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{formatCents(r.opening!)}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{formatCents(r.income)}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{formatCents(r.expenses)}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{formatCents(r.transfersIn - r.transfersOut, { signed: true })}</td>
                      <td className="py-2.5 pr-3 text-right font-medium tabular">{formatCents(r.expectedClosing!)}</td>
                      <td className="py-2.5 pr-3 text-right tabular">{r.actualClosing === null ? '—' : formatCents(r.actualClosing)}</td>
                      <td className={`py-2.5 text-right tabular ${r.difference === null || !r.verified ? 'text-ink-faint' : r.difference ? 'text-warning' : 'text-positive'}`}>
                        {r.difference === null ? '—' : !r.verified ? `${formatCents(r.difference, { signed: true })} (not verified)` : r.difference === 0 ? 'Balanced' : formatCents(r.difference, { signed: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>
    </>
  )
}
