import { describe, expect, it } from 'vitest'
import { moneyChange, pointsChange } from './change'

describe('moneyChange', () => {
  it('reports more income as good', () => {
    expect(moneyChange(110000, 100000, true)).toEqual({ direction: 'up', tone: 'good', amount: 10 })
  })

  it('reports more spending as bad', () => {
    expect(moneyChange(120000, 100000, false)).toEqual({ direction: 'up', tone: 'bad', amount: 20 })
  })

  it('reports less spending as good', () => {
    expect(moneyChange(75000, 100000, false)).toEqual({ direction: 'down', tone: 'good', amount: -25 })
  })

  it('is neutral when nothing changed', () => {
    expect(moneyChange(5000, 5000, true)).toEqual({ direction: 'flat', tone: 'neutral', amount: 0 })
  })

  it('treats a tiny percentage change as no change', () => {
    // $1,000.00 -> $1,000.30 is +0.03%, which would display as "0.0%".
    expect(moneyChange(100030, 100000, true)).toEqual({ direction: 'flat', tone: 'neutral', amount: 0 })
  })

  it('has no percentage when the previous value was zero', () => {
    expect(moneyChange(5000, 0, true)).toEqual({ direction: 'up', tone: 'good', amount: null })
  })

  it('handles negative previous values (e.g. net savings recovering)', () => {
    // From -$100 to -$50 is an improvement of 50%.
    expect(moneyChange(-5000, -10000, true)).toEqual({ direction: 'up', tone: 'good', amount: 50 })
  })
})

describe('pointsChange', () => {
  it('measures rate changes in percentage points', () => {
    expect(pointsChange(25, 20, true)).toEqual({ direction: 'up', tone: 'good', amount: 5 })
  })

  it('treats a change that would display as "0.0" as no change', () => {
    expect(pointsChange(54.18, 54.21, true)).toEqual({ direction: 'flat', tone: 'neutral', amount: 0 })
    expect(pointsChange(54.1, 54.2, true)?.direction).toBe('down') // 0.1 is visible
  })

  it('returns null when either rate is missing', () => {
    expect(pointsChange(null, 20, true)).toBeNull()
    expect(pointsChange(25, null, true)).toBeNull()
  })
})
