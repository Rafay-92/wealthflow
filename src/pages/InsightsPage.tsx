import { Cpu, ShieldCheck } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { MonthSelect } from '../components/dashboard/MonthSelect'
import { InsightCard } from '../components/insights/InsightCard'
import { buttonClasses } from '../components/ui/buttonClasses'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { Section } from '../components/ui/Section'
import { useInsights } from '../hooks/useInsights'
import { formatMonth } from '../lib/dates'

export function InsightsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { status, isSample, months, month, context, insights, error, provider } = useInsights(searchParams.get('month') ?? undefined)

  if (status === 'loading') return null
  if (!month || !context) {
    return (
      <>
        <PageHeader title="Insights" />
        <Card className="py-16 text-center">
          <p className="font-medium">No transactions to learn from yet</p>
          <Link to="/upload" className={buttonClasses('primary', 'mt-4')}>
            Import transactions
          </Link>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Insights"
        description={context.isPartial ? `${formatMonth(month)} · month to date (${context.periodLabel})` : formatMonth(month)}
        actions={<MonthSelect months={months} value={month} onChange={(m) => setSearchParams({ month: m })} />}
      />

      {isSample && <SampleDataNotice />}

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-navy-600/60 bg-navy-900 px-4 py-3 text-sm text-ink-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-positive" />
        <p>
          <span className="font-medium text-ink">Calculated on this device by fixed rules.</span> No AI service is used and nothing
          is sent anywhere. Every insight shows exactly how it was calculated.
        </p>
      </div>

      {error && <Card className="mb-6 text-sm text-negative">{error}</Card>}

      {insights === null ? null : insights.length === 0 ? (
        <Card className="py-12 text-center text-sm text-ink-faint">Nothing notable for this month.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {insights.map((insight) => (
            <Card key={insight.id} className="p-5 motion-safe:animate-rise">
              <InsightCard insight={insight} />
            </Card>
          ))}
        </div>
      )}

      <Section title="About these insights" className="mt-6">
        <div className="flex items-start gap-3 text-sm text-ink-muted">
          <Cpu aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          <div className="flex flex-col gap-2">
            <p>
              Source: <span className="text-ink">{provider.name}</span>. Each rule checks one thing (savings rate, category changes,
              subscriptions, unusual expenses…) and only speaks up when the change is big enough to matter: for categories, at least
              $25 and 15%.
            </p>
            <p>
              WealthFlow is built so an AI model could write these in the future. If that's ever added, it will be optional, ask for
              your permission first, and receive only summary numbers like the ones shown under “How this was calculated”, never your
              bank statements.
            </p>
          </div>
        </div>
      </Section>
    </>
  )
}
