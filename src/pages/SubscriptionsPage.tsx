import { Check, Undo2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { StatCard } from '../components/dashboard/StatCard'
import { SubscriptionRow } from '../components/subscriptions/SubscriptionRow'
import { Button } from '../components/ui/Button'
import { buttonClasses } from '../components/ui/buttonClasses'
import { Card } from '../components/ui/Card'
import { PageHeader } from '../components/ui/PageHeader'
import { SampleDataNotice } from '../components/ui/SampleDataNotice'
import { Section } from '../components/ui/Section'
import { formatCents } from '../lib/money'
import { findSubscriptions, groupSubscriptions, type SubscriptionDecision, type SubscriptionStatus } from '../lib/recurring/subscriptions'
import { latestDate } from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'

export function SubscriptionsPage() {
  const { status, isSample, transactions } = useDisplayData()
  const savedDecisions = useFinanceStore((s) => s.subscriptionDecisions)
  const saveStatus = useFinanceStore((s) => s.setSubscriptionStatus)
  // Sample data is never saved, so decisions about it live only in this page's memory.
  const [sampleDecisions, setSampleDecisions] = useState<SubscriptionDecision[]>([])
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const decisions = isSample ? sampleDecisions : savedDecisions
  const candidates = useMemo(() => {
    const latest = latestDate(transactions)
    return latest ? findSubscriptions(transactions, latest) : []
  }, [transactions])
  const overview = useMemo(() => groupSubscriptions(candidates, decisions), [candidates, decisions])

  async function decide(key: string, next: SubscriptionStatus | null) {
    if (isSample) {
      setSampleDecisions((list) => [
        ...list.filter((d) => d.key !== key),
        ...(next ? [{ key, status: next, decidedAt: new Date().toISOString() }] : []),
      ])
      return
    }
    setBusyKey(key)
    try {
      await saveStatus(key, next)
    } finally {
      setBusyKey(null)
    }
  }

  if (status === 'loading') return null

  if (candidates.length === 0) {
    return (
      <>
        <PageHeader title="Subscriptions" />
        <Card className="py-16 text-center">
          <p className="font-medium">No recurring payments found yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-faint">
            A payment shows up here after it's been charged about once a month, at least three times. Importing a few months of
            statements helps.
          </p>
          <Link to="/upload" className={buttonClasses('primary', 'mt-4')}>
            Import transactions
          </Link>
        </Card>
      </>
    )
  }

  const reviewActions = (key: string) => (
    <>
      <Button variant="ghost" className="px-3" disabled={busyKey === key} onClick={() => decide(key, 'dismissed')}>
        <X aria-hidden className="size-4" /> Not a subscription
      </Button>
      <Button className="px-3" disabled={busyKey === key} onClick={() => decide(key, 'confirmed')}>
        <Check aria-hidden className="size-4" /> Confirm
      </Button>
    </>
  )
  const undoAction = (key: string, label: string) => (
    <Button variant="ghost" className="px-3" disabled={busyKey === key} onClick={() => decide(key, null)} aria-label={label}>
      <Undo2 aria-hidden className="size-4" /> Undo
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Payments charged about once a month. Confirm the real subscriptions to see what they cost you each year."
      />

      {isSample && <SampleDataNotice />}

      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Subscriptions per month" value={formatCents(overview.monthlyTotal)} hint={`${overview.confirmed.filter((c) => c.active).length} confirmed and active`} />
          <StatCard label="Estimated per year" value={formatCents(overview.annualTotal)} hint="Monthly cost × 12" />
          <StatCard label="Recurring payments found" value={String(candidates.length)} hint="Including bills like rent" />
          <StatCard label="Waiting for review" value={String(overview.toReview.length)} hint={overview.toReview.length ? 'Confirm or dismiss below' : 'All reviewed'} />
        </div>

        {isSample && <p className="-mt-2 text-xs text-ink-faint">With sample data, your choices here aren't saved.</p>}

        {overview.toReview.length > 0 && (
          <Section title="To review" subtitle="Is this a subscription you chose to pay for?">
            <ul className="-my-4 divide-y divide-navy-600/40">
              {overview.toReview.map((item) => (
                <SubscriptionRow key={item.key} item={item} actions={reviewActions(item.key)} />
              ))}
            </ul>
          </Section>
        )}

        <Section
          title="Your subscriptions"
          subtitle="Confirmed by you"
          action={overview.confirmed.length > 0 && <span className="text-sm font-medium tabular">{formatCents(overview.monthlyTotal)}/mo</span>}
        >
          {overview.confirmed.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-faint">Nothing confirmed yet. Confirm items above and they'll be totalled here.</p>
          ) : (
            <ul className="-my-4 divide-y divide-navy-600/40">
              {overview.confirmed.map((item) => (
                <SubscriptionRow key={item.key} item={item} actions={undoAction(item.key, `Move ${item.name} back to review`)} />
              ))}
            </ul>
          )}
        </Section>

        {overview.dismissed.length > 0 && (
          <Section title="Not subscriptions" subtitle="Recurring, but you said they aren't subscriptions (rent, bills…)">
            <ul className="-my-4 divide-y divide-navy-600/40">
              {overview.dismissed.map((item) => (
                <SubscriptionRow key={item.key} item={item} actions={undoAction(item.key, `Move ${item.name} back to review`)} />
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  )
}
