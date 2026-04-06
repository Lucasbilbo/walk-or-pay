import { describe, it, expect } from 'vitest'
import {
  calculatePenalty,
  calculateEffectiveAmount,
  calculateStepsRemaining,
  calculateRefund,
} from '../lib/challengeLogic'

describe('calculatePenalty', () => {
  it('0 failed days → 0 penalty', () => {
    expect(calculatePenalty(0, 10000)).toBe(0)
  })

  it('1 failed day with $100 effective → $14.29 (rounded to 1429 cents)', () => {
    // Math.round((1/7) * 10000) = Math.round(1428.57) = 1429
    expect(calculatePenalty(1, 10000)).toBe(1429)
  })

  it('7 failed days → full effective amount', () => {
    expect(calculatePenalty(7, 10000)).toBe(10000)
  })

  it('grace day does NOT count as failed (3 failed days with $70 effective)', () => {
    // failedDays only counts goal_met=false AND grace_day_used=false
    // so passing failedDays=3 (not 4) when 1 grace day was used
    expect(calculatePenalty(3, 7000)).toBe(Math.round((3 / 7) * 7000))
  })
})

describe('calculateEffectiveAmount', () => {
  it('welcome bonus NOT used → amount * 2', () => {
    expect(calculateEffectiveAmount(5000, false)).toBe(10000)
  })

  it('welcome bonus already used → amount unchanged', () => {
    expect(calculateEffectiveAmount(5000, true)).toBe(5000)
  })
})

describe('calculateStepsRemaining', () => {
  it('goal=8000, steps=6000 → 2000 remaining, 20 min estimate', () => {
    const result = calculateStepsRemaining(8000, 6000)
    expect(result.remaining).toBe(2000)
    expect(result.minutesEstimate).toBe(20)
    expect(result.goalReached).toBe(false)
  })

  it('goal=8000, steps=8500 → goal reached', () => {
    const result = calculateStepsRemaining(8000, 8500)
    expect(result.remaining).toBe(0)
    expect(result.minutesEstimate).toBe(0)
    expect(result.goalReached).toBe(true)
  })

  it('goal=8000, steps=8000 → exactly goal reached', () => {
    const result = calculateStepsRemaining(8000, 8000)
    expect(result.goalReached).toBe(true)
    expect(result.remaining).toBe(0)
  })
})

describe('calculateRefund', () => {
  it('no penalty → full refund', () => {
    expect(calculateRefund(5000, 0)).toBe(5000)
  })

  it('penalty less than deposit → partial refund', () => {
    expect(calculateRefund(5000, 2000)).toBe(3000)
  })

  it('penalty exceeds deposit → 0 refund (capped at deposit)', () => {
    expect(calculateRefund(5000, 7000)).toBe(0)
  })
})
