import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { create } from 'zustand'
import {
  comparisonFromParams,
  selectionFromParams,
  selectionToParams,
  type ComparisonMode,
  type PeriodSelection,
} from '../lib/analytics/reportPeriod'
import type { MonthKey } from '../lib/dates'

/**
 * The period you last chose, remembered for this session (not saved), so
 * the Dashboard, Analytics and Reports show the same dates when you move
 * between them. The web address always wins when it names a period.
 */
const usePeriodMemory = create<{ params: Record<string, string> | null; remember: (p: Record<string, string>) => void }>()((set) => ({
  params: null,
  remember: (params) => set({ params }),
}))

export interface PeriodState {
  selection: PeriodSelection | null
  comparison: ComparisonMode
  /** One account only, or undefined for all accounts. */
  accountId: string | undefined
  update: (next: { selection?: PeriodSelection; comparison?: ComparisonMode; accountId?: string | null }) => void
  /** Back to the latest calendar month, compared with the month before, all accounts. */
  reset: () => void
}

export function usePeriod(months: readonly MonthKey[]): PeriodState {
  const [searchParams, setSearchParams] = useSearchParams()
  const remembered = usePeriodMemory((s) => s.params)
  const remember = usePeriodMemory((s) => s.remember)

  const named = searchParams.has('month') || (searchParams.has('from') && searchParams.has('to'))
  const params = useMemo(() => (named ? searchParams : new URLSearchParams(remembered ?? {})), [named, searchParams, remembered])
  // A period opened from a link (e.g. "View this statement period") is remembered too.
  useEffect(() => {
    if (named) remember(Object.fromEntries(searchParams))
  }, [named, searchParams, remember])
  const selection = useMemo(() => selectionFromParams(params, months), [params, months])
  const comparison = comparisonFromParams(params)
  const accountId = params.get('account') ?? undefined

  function write(next: Record<string, string>) {
    remember(next)
    setSearchParams(next)
  }

  return {
    selection,
    comparison,
    accountId,
    update: ({ selection: s = selection ?? undefined, comparison: c = comparison, accountId: a }) => {
      if (!s) return
      const account = a === undefined ? accountId : (a ?? undefined)
      write(selectionToParams(s, c, account ? { account } : {}))
    },
    reset: () => {
      const latest = months[0]
      write(latest ? { month: latest } : {})
    },
  }
}
