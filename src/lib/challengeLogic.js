/**
 * Pure business logic — no side effects, no imports.
 * Used by both frontend components and tests.
 */

/**
 * Calculate penalty in cents for failed days.
 * Grace days do NOT count as failed.
 * @param {number} failedDays
 * @param {number} effectiveAmountCents
 * @returns {number} penalty in cents
 */
export function calculatePenalty(failedDays, effectiveAmountCents) {
  if (failedDays <= 0) return 0
  return Math.round((failedDays / 7) * effectiveAmountCents)
}

/**
 * Calculate effective amount applying welcome bonus.
 * @param {number} amountCents - actual deposit
 * @param {boolean} welcomeBonusUsed - true if bonus already consumed
 * @returns {number} effective amount in cents
 */
export function calculateEffectiveAmount(amountCents, welcomeBonusUsed) {
  return welcomeBonusUsed ? amountCents : amountCents * 2
}

/**
 * Calculate steps remaining and walking time estimate.
 * Assumes 100 steps/minute average walking pace.
 * @param {number} goal
 * @param {number} current
 * @returns {{ remaining: number, minutesEstimate: number, goalReached: boolean }}
 */
export function calculateStepsRemaining(goal, current) {
  const remaining = Math.max(0, goal - current)
  if (remaining === 0) {
    return { remaining: 0, minutesEstimate: 0, goalReached: true }
  }
  const minutesEstimate = Math.round(remaining / 100)
  return { remaining, minutesEstimate, goalReached: false }
}

/**
 * Calculate refund amount after applying penalty.
 * @param {number} amountCents - actual deposit (what was charged)
 * @param {number} penaltyCents
 * @returns {number} refund in cents
 */
export function calculateRefund(amountCents, penaltyCents) {
  return Math.max(0, amountCents - Math.min(penaltyCents, amountCents))
}
