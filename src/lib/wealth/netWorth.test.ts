import { describe, expect, it } from 'vitest'
import type { WealthEntry, WealthItem } from '../../types/wealth'
import { itemsWithValues, netWorthHistory, netWorthOn, parseWealthValue, valueOn } from './netWorth'

const item = (id: string, type: WealthItem['type']): WealthItem => ({ id, name: id, type, createdAt: '' })
const entry = (itemId: string, date: string, value: number): WealthEntry => ({ id: `${itemId}:${date}`, itemId, date, value })

const items = [item('savings', 'cash'), item('brokerage', 'investment'), item('visa', 'credit-card'), item('car-loan', 'loan')]
const entries = [
  entry('savings', '2026-09-01', 1000000),
  entry('brokerage', '2026-09-01', 2500000),
  entry('visa', '2026-09-01', 120000),
  entry('savings', '2026-10-01', 1100000),
  entry('visa', '2026-10-01', 80000),
  entry('car-loan', '2026-10-15', 900000), // started tracking later
  entry('savings', '2026-11-01', 1250000),
]

describe('valueOn', () => {
  it('uses the latest value on or before the date', () => {
    expect(valueOn(entries, 'savings', '2026-10-20')?.value).toBe(1100000)
    expect(valueOn(entries, 'savings', '2026-10-01')?.value).toBe(1100000)
    expect(valueOn(entries, 'car-loan', '2026-09-30')).toBeNull()
  })
})

describe('netWorthOn', () => {
  it('is total assets minus total liabilities', () => {
    expect(netWorthOn(items, entries, '2026-09-01')).toEqual({
      date: '2026-09-01',
      assets: 3500000,
      liabilities: 120000,
      netWorth: 3380000,
    })
  })

  it('carries forward items not updated on that date', () => {
    // Brokerage still $25,000 from Sep 1; car loan now included.
    expect(netWorthOn(items, entries, '2026-11-01')).toEqual({
      date: '2026-11-01',
      assets: 1250000 + 2500000,
      liabilities: 80000 + 900000,
      netWorth: 3750000 - 980000,
    })
  })

  it('can be negative when you owe more than you own', () => {
    const r = netWorthOn([item('cash', 'cash'), item('student-loan', 'loan')], [entry('cash', '2026-11-01', 50000), entry('student-loan', '2026-11-01', 2000000)], '2026-11-01')
    expect(r.netWorth).toBe(-1950000)
  })
})

describe('netWorthHistory', () => {
  it('has one point per recorded date, oldest first', () => {
    expect(netWorthHistory(items, entries).map((p) => [p.date, p.netWorth])).toEqual([
      ['2026-09-01', 3380000],
      ['2026-10-01', 3520000],
      ['2026-10-15', 2620000],
      ['2026-11-01', 2770000],
    ])
  })

  it('ignores entries for items that were deleted', () => {
    expect(netWorthHistory([item('savings', 'cash')], entries).map((p) => p.date)).toEqual(['2026-09-01', '2026-10-01', '2026-11-01'])
  })
})

describe('itemsWithValues', () => {
  it('splits assets and liabilities, largest first', () => {
    const r = itemsWithValues(items, entries)
    expect(r.assets.map((a) => [a.item.id, a.latest?.value])).toEqual([
      ['brokerage', 2500000],
      ['savings', 1250000],
    ])
    expect(r.liabilities.map((l) => l.item.id)).toEqual(['car-loan', 'visa'])
  })
})

describe('parseWealthValue', () => {
  it('accepts positive amounts in common formats', () => {
    expect(parseWealthValue('$12,500.50')).toBe(1250050)
    expect(parseWealthValue('0')).toBe(0)
  })

  it('explains what is wrong', () => {
    expect(parseWealthValue('')).toBe('Enter an amount.')
    expect(parseWealthValue('lots')).toMatch(/isn’t a valid amount/)
    expect(parseWealthValue('-50')).toMatch(/positive/)
  })
})
