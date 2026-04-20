import { describe, it, expect } from 'vitest'
import {
  calculatePenalty,
  calculateEffectiveAmount,
  calculateStepsRemaining,
  calculateRefund,
  isGoalMet,
  countFailedDays,
} from '../lib/challengeLogic'

// ─── calculatePenalty ────────────────────────────────────────────────────────

describe('calculatePenalty', () => {
  it('0 failed days → 0', () => {
    expect(calculatePenalty(0, 10000)).toBe(0)
  })

  it('negative failed days treated as 0', () => {
    expect(calculatePenalty(-1, 10000)).toBe(0)
  })

  it('1 of 7 days failed → round(1/7 * effective)', () => {
    expect(calculatePenalty(1, 10000)).toBe(Math.round((1 / 7) * 10000))
  })

  it('3 of 7 days failed → round(3/7 * effective)', () => {
    expect(calculatePenalty(3, 7000)).toBe(Math.round((3 / 7) * 7000))
  })

  it('7 of 7 days failed → full effective_amount_cents', () => {
    expect(calculatePenalty(7, 10000)).toBe(10000)
  })

  it('with welcome bonus: penalty is calculated on effective (amount * 2), not on amount', () => {
    const amountCents = 5000
    const effectiveCents = calculateEffectiveAmount(amountCents, false) // bonus not yet used → 10000
    const penalty = calculatePenalty(3, effectiveCents)
    expect(effectiveCents).toBe(10000)
    expect(penalty).toBe(Math.round((3 / 7) * 10000))
    // Verify it differs from calculating on raw amount
    expect(penalty).not.toBe(Math.round((3 / 7) * amountCents))
  })
})

// ─── calculateRefund ─────────────────────────────────────────────────────────

describe('calculateRefund', () => {
  it('no penalty → returns full amount_cents', () => {
    expect(calculateRefund(5000, 0)).toBe(5000)
  })

  it('partial penalty → amount_cents minus penalty', () => {
    expect(calculateRefund(5000, 2000)).toBe(3000)
  })

  it('penalty equals deposit → 0 refund', () => {
    expect(calculateRefund(5000, 5000)).toBe(0)
  })

  it('penalty exceeds deposit → 0, never negative', () => {
    expect(calculateRefund(5000, 7000)).toBe(0)
  })
})

// ─── countFailedDays (grace day logic) ───────────────────────────────────────

describe('countFailedDays', () => {
  it('empty logs → 0 failed days', () => {
    expect(countFailedDays([])).toBe(0)
  })

  it('all goals met → 0 failed days', () => {
    const logs = [
      { goal_met: true, grace_day_used: false },
      { goal_met: true, grace_day_used: false },
    ]
    expect(countFailedDays(logs)).toBe(0)
  })

  it('goal_met=false AND grace_day_used=false → counts as failed', () => {
    const logs = [
      { goal_met: false, grace_day_used: false },
      { goal_met: true, grace_day_used: false },
    ]
    expect(countFailedDays(logs)).toBe(1)
  })

  it('grace_day_used=true does NOT count as failed, even if goal_met=false', () => {
    const logs = [
      { goal_met: false, grace_day_used: true },
      { goal_met: false, grace_day_used: false },
    ]
    expect(countFailedDays(logs)).toBe(1)
  })

  it('mixed week: 2 failed, 2 grace, 3 goal_met → 2 failed', () => {
    const logs = [
      { goal_met: true, grace_day_used: false },
      { goal_met: true, grace_day_used: false },
      { goal_met: true, grace_day_used: false },
      { goal_met: false, grace_day_used: true },
      { goal_met: false, grace_day_used: true },
      { goal_met: false, grace_day_used: false },
      { goal_met: false, grace_day_used: false },
    ]
    expect(countFailedDays(logs)).toBe(2)
  })

  it('all 7 days failed → 7', () => {
    const logs = Array.from({ length: 7 }, () => ({ goal_met: false, grace_day_used: false }))
    expect(countFailedDays(logs)).toBe(7)
  })
})

// ─── minutesEstimate (via calculateStepsRemaining) ───────────────────────────

describe('calculateStepsRemaining — minutesEstimate', () => {
  it('rounds (goal - steps) / 100', () => {
    const { minutesEstimate } = calculateStepsRemaining(8000, 6000)
    expect(minutesEstimate).toBe(Math.round((8000 - 6000) / 100))
  })

  it('fractional result is rounded', () => {
    // 8000 - 6550 = 1450 → 1450/100 = 14.5 → rounds to 15
    const { minutesEstimate } = calculateStepsRemaining(8000, 6550)
    expect(minutesEstimate).toBe(15)
  })

  it('steps >= goal → minutesEstimate is 0', () => {
    expect(calculateStepsRemaining(8000, 8000).minutesEstimate).toBe(0)
    expect(calculateStepsRemaining(8000, 9000).minutesEstimate).toBe(0)
  })

  it('goalReached=true when steps >= goal', () => {
    expect(calculateStepsRemaining(8000, 8500).goalReached).toBe(true)
  })

  it('goalReached=false and remaining > 0 when steps < goal', () => {
    const result = calculateStepsRemaining(8000, 5000)
    expect(result.goalReached).toBe(false)
    expect(result.remaining).toBe(3000)
  })
})

// ─── calculateEffectiveAmount ─────────────────────────────────────────────────

describe('calculateEffectiveAmount', () => {
  it('bonus not used → amount * 2', () => {
    expect(calculateEffectiveAmount(5000, false)).toBe(10000)
  })

  it('bonus already used → amount unchanged', () => {
    expect(calculateEffectiveAmount(5000, true)).toBe(5000)
  })
})
