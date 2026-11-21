import { describe, expect, it } from 'vitest'
import { summarize } from '../lib/analytics/summary'
import { monthPeriod } from '../lib/analytics/periods'
import { sumCents } from '../lib/money'
import { SAMPLE_DATA_END, SAMPLE_TRANSACTIONS } from './sampleData'

describe('sample data', () => {
  it('is deterministic and has unique ids', () => {
    const ids = SAMPLE_TRANSACTIONS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(SAMPLE_TRANSACTIONS.length).toBeGreaterThan(200)
  })

  it('never goes past the data end date', () => {
    expect(SAMPLE_TRANSACTIONS.every((t) => t.date <= SAMPLE_DATA_END)).toBe(true)
  })

  it('has transfers that cancel out exactly', () => {
    const transfers = SAMPLE_TRANSACTIONS.filter((t) => t.category === 'Transfers').map((t) => t.amount)
    expect(transfers.length).toBeGreaterThan(0)
    expect(sumCents(transfers)).toBe(0)
  })

  it('produces a plausible month: positive savings rate below 100%', () => {
    const { savingsRate } = summarize(SAMPLE_TRANSACTIONS, monthPeriod('2026-10'))
    expect(savingsRate).not.toBeNull()
    expect(savingsRate!).toBeGreaterThan(0)
    expect(savingsRate!).toBeLessThan(100)
  })
})
