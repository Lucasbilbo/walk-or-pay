import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { calculateStepsRemaining } from '../lib/challengeLogic'
import IOSSetup from './IOSSetup'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function fmt(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div style={{ background: 'var(--color-border)', borderRadius: 8, height: 12, overflow: 'hidden', margin: '12px 0' }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: color, borderRadius: 8,
        transition: 'width 0.4s ease',
        minWidth: pct > 0 ? 12 : 0,
      }} />
    </div>
  )
}

function EmptyState({ profile, onStartChallenge }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🚶</div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>No active challenge</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 28, fontSize: 15, lineHeight: 1.6 }}>
        Put real money on the line and walk your way to a healthier life. Hit your goal every day — get it all back.
      </p>
      {profile?.welcome_bonus_used === false && (
        <div style={bonusStyle}>🎁 2x bonus on your first challenge!</div>
      )}
      <button
        className="btn btn-primary"
        onClick={onStartChallenge}
        style={{ padding: '14px 36px', fontSize: 16 }}
      >
        Start your first challenge
      </button>
    </div>
  )
}

const bonusStyle = {
  display: 'inline-block',
  background: 'rgba(245,158,11,0.12)',
  border: '1px solid var(--color-warning)',
  borderRadius: 20,
  padding: '6px 18px',
  fontSize: 14,
  color: 'var(--color-warning)',
  fontWeight: 600,
  marginBottom: 20,
}

export default function Dashboard({
  challenge, dailyLogs, steps, stepsLoading, stepsError,
  onRefetchSteps, onStartChallenge, profile, onRefetchChallenge,
}) {
  const [graceDayLoading, setGraceDayLoading] = useState(false)
  const [graceDayError, setGraceDayError] = useState(null)

  if (!challenge) {
    return <EmptyState profile={profile} onStartChallenge={onStartChallenge} />
  }

  const today = new Date().toISOString().split('T')[0]
  const todayLog = dailyLogs.find(l => l.date === today)
  const currentSteps = steps ?? 0
  const dailyGoal = challenge.daily_goal
  const { remaining, minutesEstimate, goalReached } = calculateStepsRemaining(dailyGoal, currentSteps)
  const pct = dailyGoal > 0 ? Math.min(100, Math.round((currentSteps / dailyGoal) * 100)) : 0

  const todayDone = goalReached || todayLog?.goal_met || todayLog?.grace_day_used
  const todayClosed = !!todayLog && !todayLog.goal_met && !todayLog.grace_day_used && today > challenge.end_date

  let barColor = 'var(--color-primary)'
  if (todayDone) barColor = 'var(--color-success)'
  if (todayClosed) barColor = 'var(--color-danger)'

  // Build 7-day week circles
  const startDate = new Date(challenge.start_date + 'T12:00:00')
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const log = dailyLogs.find(l => l.date === dateStr)
    const isToday = dateStr === today
    const isFuture = dateStr > today
    return { dateStr, label: DAY_LABELS[i], log, isToday, isFuture }
  })

  const graceDaysRemaining = challenge.grace_days - challenge.grace_days_used
  const canUseGraceDay = (
    graceDaysRemaining > 0 &&
    !todayLog?.goal_met &&
    !todayLog?.grace_day_used &&
    today >= challenge.start_date &&
    today <= challenge.end_date
  )

  async function handleUseGraceDay() {
    setGraceDayLoading(true)
    setGraceDayError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/.netlify/functions/use-grace-day', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ challenge_id: challenge.id, date: today }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to use grace day')
      onRefetchChallenge()
    } catch (err) {
      setGraceDayError(err.message)
    } finally {
      setGraceDayLoading(false)
    }
  }

  const effectiveAmount = challenge.effective_amount_cents
  const dailyRisk = Math.round(effectiveAmount / 7)

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>

      {/* ── Section 1: Today's progress ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 52, fontWeight: 800, color: barColor, letterSpacing: -2, lineHeight: 1 }}>
              {currentSteps.toLocaleString()}
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 4 }}>steps today</div>
          </div>
          <button
            className="btn"
            onClick={onRefetchSteps}
            disabled={stepsLoading}
            style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '6px 12px', fontSize: 12 }}
          >
            {stepsLoading ? '…' : '↻ Refresh'}
          </button>
        </div>

        <ProgressBar value={currentSteps} max={dailyGoal} color={barColor} />

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          <span>{pct}% of daily goal</span>
          <span>{dailyGoal.toLocaleString()} steps</span>
        </div>

        {!todayDone && !todayClosed && (
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--color-warning)' }}>
            ~{remaining.toLocaleString()} more steps (~{minutesEstimate} min)
          </div>
        )}
        {todayDone && (
          <div style={{ marginTop: 12, fontSize: 14, color: 'var(--color-success)', fontWeight: 600 }}>
            ✅ Goal reached!
          </div>
        )}
        {stepsError && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-danger)' }}>
            {stepsError}
          </div>
        )}
      </div>

      {/* ── Section 2: Week view ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          {weekDays.map(({ dateStr, label, log, isToday, isFuture }) => {
            let symbol = '⚪'
            if (log?.goal_met || log?.grace_day_used) symbol = '✅'
            else if (log && !log.goal_met && !log.grace_day_used) symbol = '❌'
            else if (isToday) symbol = '🔵'
            return (
              <div key={dateStr} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: 18 }}>{symbol}</div>
                <div style={{
                  fontSize: 10, marginTop: 4,
                  color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                  fontWeight: isToday ? 700 : 400,
                }}>
                  {label}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Section 3: Stats ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(effectiveAmount)}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>At stake</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-danger)' }}>{fmt(dailyRisk)}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>Today's risk</div>
          </div>
          <div>
            <div style={{
              fontSize: 20, fontWeight: 700,
              color: graceDaysRemaining > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)',
            }}>
              {graceDaysRemaining}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>Grace days left</div>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Week of {challenge.start_date} – {challenge.end_date}
        </div>
      </div>

      {/* ── Section 4: Actions ── */}
      {canUseGraceDay && (
        <div className="card" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleUseGraceDay}
            disabled={graceDayLoading}
            style={{ width: '100%', padding: '13px' }}
          >
            {graceDayLoading ? 'Using grace day…' : '🛡 Use grace day'}
          </button>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>
            Counts as completing today. {graceDaysRemaining - 1} grace {graceDaysRemaining - 1 === 1 ? 'day' : 'days'} remaining after this.
          </p>
          {graceDayError && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 8 }}>{graceDayError}</p>}
        </div>
      )}

      {/* ── Section 5: iOS Setup ── */}
      <IOSSetup />
    </div>
  )
}
