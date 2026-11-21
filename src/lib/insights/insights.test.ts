import { describe, expect, it } from 'vitest'
import { SAMPLE_DATA_END, SAMPLE_TRANSACTIONS } from '../../data/sampleData'
import { tx } from '../../test/factories'
import type { Transaction } from '../../types/transaction'
import { buildInsightContext, type InsightInputs } from './context'
import { RuleBasedProvider, ruleBasedInsights } from './rules'

const inputs = (transactions: Transaction[], extra: Partial<InsightInputs> = {}): InsightInputs => ({
  transactions,
  subscriptionDecisions: [],
  wealthItems: [],
  wealthEntries: [],
  ...extra,
})

const monthOf = (m: string, income: number, spend: Record<string, number>) => [
  tx({ date: `2026-${m}-01`, amount: income, category: 'Income' }),
  ...Object.entries(spend).map(([category, amount], i) =>
    tx({ date: `2026-${m}-${String(10 + i).padStart(2, '0')}`, amount: -amount, category: category as Transaction['category'] }),
  ),
]

const data = [
  ...monthOf('09', 400000, { Restaurants: 20000, Groceries: 40000, Housing: 150000 }),
  ...monthOf('10', 400000, { Restaurants: 32000, Groceries: 39000, Housing: 150000 }),
]

describe('rule-based insights', () => {
  const ctx = buildInsightContext(inputs(data), '2026-10', '2026-10-31')
  const insights = ruleBasedInsights(ctx)
  const byId = (id: string) => insights.find((i) => i.id === id)

  it('reports the savings rate, with evidence', () => {
    expect(byId('savings-rate')).toMatchObject({ tone: 'good', title: 'You saved 44.8% of your income' })
    expect(byId('savings-rate')!.evidence[0]).toBe('Saved = income − spending = $4,000.00 − $2,210.00 = $1,790.00')
  })

  it('reports a notable category increase in plain words', () => {
    expect(byId('category-change:Restaurants')).toMatchObject({
      tone: 'bad',
      title: 'Restaurants spending increased by 60%',
      detail: 'Your restaurants spending increased by 60% compared to September 2026: $320.00 vs $200.00.',
    })
  })

  it('stays quiet about small changes', () => {
    expect(byId('category-change:Groceries')).toBeUndefined() // -$10, -2.5%
    expect(byId('spending-change')).toBeUndefined() // +5.7%: below the 10% threshold
  })

  it('says "no spending" rather than "decreased by 100%"', () => {
    const stopped = [...monthOf('09', 400000, { Education: 45000 }), ...monthOf('10', 400000, { Groceries: 1000 })]
    const c = buildInsightContext(inputs(stopped), '2026-10', '2026-10-31')
    expect(ruleBasedInsights(c).find((i) => i.id === 'category-change:Education')).toMatchObject({
      tone: 'good',
      title: 'No spending in Education',
      detail: 'You had no spending in the Education category in October 2026, compared with $450.00 in September 2026.',
    })
  })

  it('names the top category', () => {
    expect(byId('top-category')!.title).toBe('You spent the most on housing')
  })

  it('puts the most important insights first', () => {
    const priorities = insights.map((i) => i.priority)
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
  })

  it('backs every insight with at least one line of evidence', () => {
    expect(insights.every((i) => i.evidence.length > 0)).toBe(true)
  })
})

describe('subscription insights', () => {
  const netflix = ['07', '08', '09', '10'].map((m) => tx({ date: `2026-${m}-05`, description: 'NETFLIX.COM', amount: -1549, category: 'Subscriptions' }))
  const spotify = ['07', '08', '09', '10'].map((m, i) => tx({ date: `2026-${m}-09`, description: 'SPOTIFY', amount: i < 3 ? -1099 : -1199, category: 'Subscriptions' }))

  it('nudges you to review likely subscriptions', () => {
    const ctx = buildInsightContext(inputs([...netflix, ...spotify]), '2026-10', '2026-10-31')
    const insight = ruleBasedInsights(ctx).find((i) => i.id === 'subscriptions-review')
    expect(insight?.title).toBe('2 likely subscriptions found')
  })

  it('states the yearly cost of confirmed subscriptions', () => {
    const ctx = buildInsightContext(
      inputs([...netflix, ...spotify], { subscriptionDecisions: [{ key: 'NETFLIX', status: 'confirmed', decidedAt: '' }] }),
      '2026-10',
      '2026-10-31',
    )
    expect(ruleBasedInsights(ctx).find((i) => i.id === 'subscriptions-cost')?.title).toBe('Your subscriptions cost about $186 a year')
  })

  it('flags a price increase', () => {
    const ctx = buildInsightContext(inputs(spotify), '2026-10', '2026-10-31')
    expect(ruleBasedInsights(ctx).find((i) => i.id === 'price-increase:SPOTIFY')).toMatchObject({
      tone: 'bad',
      detail: 'It went from $10.99 to $11.99 a month, about $12.00 more a year.',
    })
  })
})

describe('unusual expenses', () => {
  it('flags an expense far above its category’s usual amount', () => {
    const usual = ['07', '08', '09'].flatMap((m) => [5, 15, 25].map((d) => tx({ date: `2026-${m}-${d}`, amount: -4000, category: 'Shopping' })))
    const big = tx({ date: '2026-10-12', description: 'BEST BUY TV', amount: -89900, category: 'Shopping' })
    const ctx = buildInsightContext(inputs([...usual, big]), '2026-10', '2026-10-31')
    expect(ctx.unusualExpenses).toEqual([{ description: 'BEST BUY TV', date: '2026-10-12', category: 'Shopping', amount: 89900, typical: 4000 }])
    expect(ruleBasedInsights(ctx).find((i) => i.id.startsWith('unusual:'))?.detail).toBe(
      'BEST BUY TV on Oct 12 was $899.00, about 22× your typical shopping expense.',
    )
  })
})

describe('net worth insight', () => {
  it('reports the change between the last two updates', () => {
    const ctx = buildInsightContext(
      inputs(data, {
        wealthItems: [{ id: 'a', name: 'Savings', type: 'cash', createdAt: '' }],
        wealthEntries: [
          { id: '1', itemId: 'a', date: '2026-09-01', value: 1000000 },
          { id: '2', itemId: 'a', date: '2026-10-01', value: 1150000 },
        ],
      }),
      '2026-10',
      '2026-10-31',
    )
    expect(ruleBasedInsights(ctx).find((i) => i.id === 'net-worth')).toMatchObject({
      tone: 'good',
      title: 'Your net worth grew by $1,500',
      detail: 'It was $11,500.00 on Oct 1, up from $10,000.00 on Sep 1.',
    })
  })
})

describe('sample data', () => {
  it('produces sensible insights through the provider interface', async () => {
    const ctx = buildInsightContext(inputs(SAMPLE_TRANSACTIONS), '2026-11', SAMPLE_DATA_END)
    expect(ctx.isPartial).toBe(true)
    const insights = await RuleBasedProvider.generate(ctx)
    expect(insights.length).toBeGreaterThanOrEqual(4)
    for (const i of insights) {
      expect(i.title).not.toMatch(/NaN|undefined|Infinity/)
      expect(i.detail).not.toMatch(/NaN|undefined|Infinity/)
    }
    // The sample data's restaurant spending rises in the last months, and the rules notice.
    expect(insights.some((i) => i.id === 'category-change:Restaurants')).toBe(true)
  })
})
