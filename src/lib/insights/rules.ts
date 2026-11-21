import { formatDay } from '../dates'
import { formatCents, formatPercent, percentOf } from '../money'
import type { Insight, InsightContext, InsightProvider } from './types'

/** A category change is only an insight if it's at least $25 AND 15%. */
const MIN_CHANGE_CENTS = 2500
const MIN_CHANGE_PERCENT = 15

const pct = (n: number) => `${Math.abs(n).toFixed(0)}%`

/**
 * Deterministic insights: each rule reads numbers from the context and
 * either produces an insight with its evidence, or nothing. No rule ever
 * states something the numbers don't show.
 */
export function ruleBasedInsights(ctx: InsightContext): Insight[] {
  const out: Insight[] = []
  const add = (i: Omit<Insight, 'source'>) => out.push({ ...i, source: 'rules' })
  const { current, previous } = ctx
  const thisPeriod = ctx.isPartial ? `so far this month (${ctx.periodLabel})` : `in ${ctx.periodLabel}`

  // Savings rate
  if (current.income > 0 && current.savingsRate !== null) {
    const rate = current.savingsRate
    const prevRate = previous?.savingsRate ?? null
    const delta = prevRate === null ? null : rate - prevRate
    add({
      id: 'savings-rate',
      tone: rate >= 20 ? 'good' : rate < 0 ? 'bad' : 'neutral',
      title: rate >= 0 ? `You saved ${formatPercent(rate)} of your income` : `You spent ${formatCents(-current.net)} more than you earned`,
      detail:
        `Income was ${formatCents(current.income)} and spending ${formatCents(current.expenses)} ${thisPeriod}.` +
        (delta !== null && Math.abs(delta) >= 1 ? ` That's ${Math.abs(delta).toFixed(1)} points ${delta > 0 ? 'higher' : 'lower'} than ${ctx.previousLabel}.` : ''),
      evidence: [
        `Saved = income − spending = ${formatCents(current.income)} − ${formatCents(current.expenses)} = ${formatCents(current.net)}`,
        `Savings rate = saved ÷ income = ${formatPercent(rate)}`,
        ...(prevRate !== null ? [`${ctx.previousLabel}: ${formatPercent(prevRate)}`] : []),
        'Transfers between your own accounts are excluded.',
      ],
      priority: 10,
    })
  }

  // Overall spending vs the previous period
  if (previous && previous.expenses > 0) {
    const change = ((current.expenses - previous.expenses) / previous.expenses) * 100
    if (Math.abs(change) >= 10) {
      add({
        id: 'spending-change',
        tone: change > 0 ? 'bad' : 'good',
        title: `Spending is ${change > 0 ? 'up' : 'down'} ${pct(change)}${ctx.isPartial ? ' so far this month' : ''}`,
        detail: `You've spent ${formatCents(current.expenses)} ${thisPeriod}, compared with ${formatCents(previous.expenses)} in ${ctx.previousLabel}.`,
        evidence: [`${ctx.periodLabel}: ${formatCents(current.expenses)}`, `${ctx.previousLabel}: ${formatCents(previous.expenses)}`, `Change: ${change > 0 ? '+' : '−'}${pct(change)}`],
        priority: 20,
      })
    }
  }

  // Category changes: the biggest rises (up to 2) and the biggest fall
  const notable = ctx.categoryChanges.filter((c) => c.percent !== null && Math.abs(c.difference) >= MIN_CHANGE_CENTS && Math.abs(c.percent) >= MIN_CHANGE_PERCENT)
  const rises = notable.filter((c) => c.difference > 0).sort((a, b) => b.difference - a.difference).slice(0, 2)
  const fall = notable.filter((c) => c.difference < 0).sort((a, b) => a.difference - b.difference)[0]
  for (const c of [...rises, ...(fall ? [fall] : [])]) {
    const up = c.difference > 0
    const stopped = c.current === 0 // "decreased by 100%" is clumsy; say it plainly
    add({
      id: `category-change:${c.category}`,
      tone: up ? 'bad' : 'good',
      // Category named as a proper noun, so "Other" can't be misread as the word "other".
      title: stopped ? `No spending in ${c.category}` : `${c.category} spending ${up ? 'increased' : 'decreased'} by ${pct(c.percent!)}`,
      detail: stopped
        ? `You had no spending in the ${c.category} category ${thisPeriod}, compared with ${formatCents(c.previous)} in ${ctx.previousLabel}.`
        : `Your ${c.category.toLowerCase()} spending ${up ? 'increased' : 'decreased'} by ${pct(c.percent!)} compared to ${ctx.previousLabel}: ${formatCents(c.current)} vs ${formatCents(c.previous)}.`,
      evidence: [`${ctx.periodLabel}: ${formatCents(c.current)}`, `${ctx.previousLabel}: ${formatCents(c.previous)}`, `Difference: ${formatCents(c.difference, { signed: true })}`],
      priority: up ? 30 : 60,
    })
  }

  // Top category
  const top = ctx.categories[0]
  if (top) {
    add({
      id: 'top-category',
      tone: 'neutral',
      title: `You spent the most on ${top.category.toLowerCase()}`,
      detail: `${formatCents(top.amount)} went to ${top.category.toLowerCase()} ${thisPeriod}, ${Math.round(top.share * 100)}% of your spending.`,
      evidence: ctx.categories.slice(0, 3).map((c, i) => `${i + 1}. ${c.category}: ${formatCents(c.amount)} (${Math.round(c.share * 100)}%)`),
      priority: 50,
    })
  }

  // Unusual expenses (the biggest one)
  const unusual = ctx.unusualExpenses[0]
  if (unusual) {
    add({
      id: `unusual:${unusual.description}:${unusual.date}`,
      tone: 'neutral',
      title: `An unusually large ${unusual.category.toLowerCase()} expense`,
      detail: `${unusual.description} on ${formatDay(unusual.date)} was ${formatCents(unusual.amount)}, about ${Math.round(unusual.amount / unusual.typical)}× your typical ${unusual.category.toLowerCase()} expense.`,
      evidence: [`This expense: ${formatCents(unusual.amount)}`, `Typical (median of the previous 3 months): ${formatCents(unusual.typical)}`],
      priority: 40,
    })
  }

  // Subscriptions
  const subs = ctx.subscriptions
  if (subs.confirmedCount > 0) {
    add({
      id: 'subscriptions-cost',
      tone: 'neutral',
      title: `Your subscriptions cost about ${formatCents(subs.confirmedAnnual, { whole: true })} a year`,
      detail: `${subs.confirmedCount} confirmed ${subs.confirmedCount === 1 ? 'subscription comes' : 'subscriptions come'} to ${formatCents(subs.confirmedMonthly)} a month.`,
      evidence: [`Monthly total: ${formatCents(subs.confirmedMonthly)}`, `× 12 = ${formatCents(subs.confirmedAnnual)} (an estimate; prices can change)`],
      priority: 70,
    })
  } else if (subs.unreviewedLikelyCount > 0) {
    add({
      id: 'subscriptions-review',
      tone: 'neutral',
      title: `${subs.unreviewedLikelyCount} likely ${subs.unreviewedLikelyCount === 1 ? 'subscription' : 'subscriptions'} found`,
      detail: `Together they'd cost about ${formatCents(subs.unreviewedLikelyAnnual, { whole: true })} a year. Confirm them on the Subscriptions page to track them.`,
      evidence: ['Charged about once a month, at least 3 times, in the Subscriptions category', `Estimated yearly cost: ${formatCents(subs.unreviewedLikelyAnnual)}`],
      priority: 70,
    })
  }
  for (const p of subs.priceIncreases) {
    add({
      id: `price-increase:${p.name}`,
      tone: 'bad',
      title: `${p.name} raised its price`,
      detail: `It went from ${formatCents(p.from)} to ${formatCents(p.to)} a month, about ${formatCents((p.to - p.from) * 12)} more a year.`,
      evidence: [`Previous charge: ${formatCents(p.from)}`, `Latest charge: ${formatCents(p.to)}`],
      priority: 35,
    })
  }

  // Income change
  if (previous && previous.income > 0 && current.income > 0) {
    const change = percentOf(current.income - previous.income, previous.income)!
    if (Math.abs(change) >= 10) {
      add({
        id: 'income-change',
        tone: change > 0 ? 'good' : 'neutral',
        title: `Income is ${change > 0 ? 'up' : 'down'} ${pct(change)}`,
        detail: `You received ${formatCents(current.income)} ${thisPeriod}, compared with ${formatCents(previous.income)} in ${ctx.previousLabel}.`,
        evidence: [`${ctx.periodLabel}: ${formatCents(current.income)}`, `${ctx.previousLabel}: ${formatCents(previous.income)}`],
        priority: 45,
      })
    }
  }

  // Net worth
  if (ctx.netWorth) {
    const { current: now, previous: before, date, previousDate } = ctx.netWorth
    const diff = now - before
    if (diff !== 0) {
      add({
        id: 'net-worth',
        tone: diff > 0 ? 'good' : 'bad',
        title: `Your net worth ${diff > 0 ? 'grew' : 'fell'} by ${formatCents(Math.abs(diff), { whole: true })}`,
        detail: `It was ${formatCents(now)} on ${formatDay(date)}, ${diff > 0 ? 'up' : 'down'} from ${formatCents(before)} on ${formatDay(previousDate)}.`,
        evidence: [`${formatDay(date)}: ${formatCents(now)}`, `${formatDay(previousDate)}: ${formatCents(before)}`, 'From the values you entered on the Wealth page'],
        priority: 55,
      })
    }
  }

  // Data quality
  if (ctx.needsReviewCount > 0) {
    add({
      id: 'needs-review',
      tone: 'neutral',
      title: `${ctx.needsReviewCount} ${ctx.needsReviewCount === 1 ? 'transaction needs' : 'transactions need'} a category`,
      detail: 'They matched no rule, so they were filed under Income or Other. Fixing them makes every figure here more accurate.',
      evidence: ['Shown with “Needs review” on the Transactions page'],
      priority: 80,
    })
  }

  return out.sort((a, b) => a.priority - b.priority)
}

/** Today's provider: fixed rules, running entirely on this device. */
export const RuleBasedProvider: InsightProvider = {
  name: 'Rule-based (on this device)',
  generate: async (ctx) => ruleBasedInsights(ctx),
}
