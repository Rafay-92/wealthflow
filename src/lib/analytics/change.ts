import type { Cents } from '../money'

export type Direction = 'up' | 'down' | 'flat'
/** Whether a change is good news. Depends on the metric: more income is good, more spending is not. */
export type Tone = 'good' | 'bad' | 'neutral'

export interface Change {
  direction: Direction
  tone: Tone
  /**
   * Percent change for money; percentage-point change for rates.
   * null when there's nothing meaningful to compare against.
   */
  amount: number | null
}

function toneFor(direction: Direction, upIsGood: boolean): Tone {
  if (direction === 'flat') return 'neutral'
  return (direction === 'up') === upIsGood ? 'good' : 'bad'
}

/**
 * Changes are shown to one decimal place, so anything below 0.05 displays
 * as "0.0". Calling that a decrease (red arrow, "0.0 pts") would be noise
 * dressed up as news, so it counts as no change.
 */
const NEGLIGIBLE = 0.05

function directionOf(diff: number): Direction {
  if (Math.abs(diff) < NEGLIGIBLE) return 'flat'
  return diff > 0 ? 'up' : 'down'
}

/**
 * Percent change between two money amounts.
 * Divides by |previous| so that going from -$100 to -$50 reads as "up 50%".
 * From a previous value of 0 the percentage is undefined (null), but the
 * direction is still reported.
 */
export function moneyChange(current: Cents, previous: Cents, upIsGood: boolean): Change {
  const diff = current - previous
  const percent = previous === 0 ? null : (diff / Math.abs(previous)) * 100
  // Judge the direction by the percentage shown, not by raw cents.
  const direction = percent === null ? directionOf(diff) : directionOf(percent)
  return { direction, tone: toneFor(direction, upIsGood), amount: direction === 'flat' ? 0 : percent }
}

/**
 * Change between two percentages, in percentage points.
 * A savings rate going from 20% to 25% is "+5 pts", not "+25%".
 */
export function pointsChange(current: number | null, previous: number | null, upIsGood: boolean): Change | null {
  if (current === null || previous === null) return null
  const diff = current - previous
  const direction = directionOf(diff)
  return { direction, tone: toneFor(direction, upIsGood), amount: direction === 'flat' ? 0 : diff }
}
