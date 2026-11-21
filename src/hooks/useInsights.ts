import { useEffect, useMemo, useState } from 'react'
import { buildInsightContext } from '../lib/insights/context'
import { RuleBasedProvider } from '../lib/insights/rules'
import type { Insight, InsightContext, InsightProvider } from '../lib/insights/types'
import type { MonthKey } from '../lib/dates'
import { availableMonths, latestDate } from '../lib/transactions'
import { useDisplayData, useFinanceStore } from '../store/financeStore'

/**
 * Builds the insight context and asks the provider for insights.
 *
 * Written for an ASYNC provider even though today's rules are instant: an AI
 * provider would be a network call, and this way swapping one in later
 * doesn't change any page.
 */
export function useInsights(month: MonthKey | undefined, provider: InsightProvider = RuleBasedProvider) {
  const { status, isSample, transactions } = useDisplayData()
  const savedDecisions = useFinanceStore((s) => s.subscriptionDecisions)
  const wealthItems = useFinanceStore((s) => s.wealthItems)
  const wealthEntries = useFinanceStore((s) => s.wealthEntries)

  const months = useMemo(() => availableMonths(transactions), [transactions])
  const selected = month && months.includes(month) ? month : months[0]

  const context = useMemo<InsightContext | null>(() => {
    const latest = latestDate(transactions)
    if (!selected || !latest) return null
    // Sample data is never mixed with what you've saved.
    return buildInsightContext(
      {
        transactions,
        subscriptionDecisions: isSample ? [] : savedDecisions,
        wealthItems: isSample ? [] : wealthItems,
        wealthEntries: isSample ? [] : wealthEntries,
      },
      selected,
      latest,
    )
  }, [transactions, selected, isSample, savedDecisions, wealthItems, wealthEntries])

  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!context) return
    let cancelled = false // ignore a slow, outdated answer if the inputs changed meanwhile
    provider
      .generate(context)
      .then((result) => {
        if (!cancelled) {
          setInsights(result)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        console.error('[WealthFlow] Insights failed', e)
        if (!cancelled) setError('Insights couldn’t be calculated.')
      })
    return () => {
      cancelled = true
    }
  }, [context, provider])

  return { status, isSample, months, month: selected, context, insights: context ? insights : [], error, provider }
}
