import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import IOSSetup from './IOSSetup'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const POLL_MS = 5 * 60 * 1000

function eur(cents) {
  return `€${(cents / 100).toFixed(2)}`
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

function EmptyState({ profile, onStartChallenge }) {
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🚶</div>
      <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>No active challenge</h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 28, fontSize: 15, lineHeight: 1.6 }}>
        Commit to your goal — if you miss a day, your pledge goes to a charity you choose. Hit every day and get it all back.
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

function CompletedSummary({ challenge, dailyLogs, onStartChallenge }) {
  const completedDays = dailyLogs.filter(l => l.goal_met || l.grace_day_used).length
  const penaltyCents = challenge.penalty_cents ?? 0
  const refundCents = Math.max(0, challenge.amount_cents - Math.min(penaltyCents, challenge.amount_cents))

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px 40px' }}>
      <div className="card" style={{ marginBottom: 12, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🏁</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Challenge complete!</h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
          Week of {challenge.start_date} – {challenge.end_date}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-success)' }}>{completedDays}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>Days completed</div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: penaltyCents > 0 ? 'var(--color-danger)' : 'var(--color-text)' }}>
              {eur(penaltyCents)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>Pledged to {challenge.charity || 'charity'}</div>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-primary)' }}>{eur(refundCents)}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>Refunded</div>
          </div>
        </div>
      </div>

      <button
        className="btn btn-primary"
        onClick={onStartChallenge}
        style={{ width: '100%', padding: '14px', fontSize: 15 }}
      >
        Start a new challenge
      </button>
    </div>
  )
}

function WeekView({ challenge, dailyLogs }) {
  const today = new Date().toISOString().split('T')[0]
  const start = new Date(challenge.start_date + 'T12:00:00')

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const log = dailyLogs.find(l => l.log_date === dateStr)
    return { dateStr, label: DAY_LABELS[i], log, isToday: dateStr === today }
  })

  return (
    <div style={{ display: 'flex', justifyContent: 'space-around' }}>
      {days.map(({ dateStr, label, log, isToday }) => {
        let icon = '○'
        let iconColor = 'var(--color-text-secondary)'

        if (log?.goal_met) {
          icon = '✓'; iconColor = 'var(--color-success)'
        } else if (log?.grace_day_used) {
          icon = '🛡'; iconColor = 'var(--color-warning)'
        } else if (log && !log.goal_met && !log.grace_day_used) {
          icon = '✗'; iconColor = 'var(--color-danger)'
        } else if (isToday) {
          icon = '●'; iconColor = 'var(--color-primary)'
        }

        return (
          <div key={dateStr} style={{ textAlign: 'center', flex: 1 }}>
            <div style={{ fontSize: 16, color: iconColor, fontWeight: 700, lineHeight: 1.4 }}>{icon}</div>
            <div style={{
              fontSize: 10, marginTop: 3,
              color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              fontWeight: isToday ? 700 : 400,
            }}>
              {label}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard({ user, profile, onStartChallenge }) {
  const [challenge, setChallenge] = useState(null)
  const [challengeLoading, setChallengeLoading] = useState(true)
  const [challengeError, setChallengeError] = useState(null)

  const [dailyLogs, setDailyLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)

  const [steps, setSteps] = useState(null)
  const [stepsLoading, setStepsLoading] = useState(false)
  const [stepsError, setStepsError] = useState(null)

  const [graceDayLoading, setGraceDayLoading] = useState(false)
  const [graceDayError, setGraceDayError] = useState(null)

  // Load most recent challenge (active or completed)
  useEffect(() => {
    if (!user) return
    setChallengeLoading(true)
    setChallengeError(null)
    supabase
      .from('challenges')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setChallengeError(error.message)
        else setChallenge(data)
        setChallengeLoading(false)
      })
  }, [user?.id])

  // Load daily logs when challenge id changes
  useEffect(() => {
    if (!challenge?.id) { setDailyLogs([]); return }
    setLogsLoading(true)
    supabase
      .from('daily_logs')
      .select('log_date,steps,goal_met,grace_day_used')
      .eq('challenge_id', challenge.id)
      .order('log_date', { ascending: true })
      .then(({ data }) => {
        setDailyLogs(data ?? [])
        setLogsLoading(false)
      })
  }, [challenge?.id])

  // Fetch steps from get-steps endpoint
  const fetchSteps = useCallback(async () => {
    if (!challenge || challenge.status !== 'active') return
    setStepsLoading(true)
    setStepsError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/.netlify/functions/get-steps?date=${today}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch steps')
      setSteps(data.steps)
    } catch (err) {
      setStepsError(err.message)
    } finally {
      setStepsLoading(false)
    }
  }, [challenge?.id, challenge?.status])

  useEffect(() => {
    fetchSteps()
    const interval = setInterval(fetchSteps, POLL_MS)
    return () => clearInterval(interval)
  }, [fetchSteps])

  // Grace day handler
  async function handleUseGraceDay() {
    setGraceDayLoading(true)
    setGraceDayError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const today = new Date().toISOString().split('T')[0]
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
      // Refetch challenge and logs to reflect updated grace_days_used
      const { data: updated } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', challenge.id)
        .maybeSingle()
      if (updated) setChallenge(updated)
      const { data: logs } = await supabase
        .from('daily_logs')
        .select('log_date,steps,goal_met,grace_day_used')
        .eq('challenge_id', challenge.id)
        .order('log_date', { ascending: true })
      setDailyLogs(logs ?? [])
    } catch (err) {
      setGraceDayError(err.message)
    } finally {
      setGraceDayLoading(false)
    }
  }

  if (challengeLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>Loading…</span>
      </div>
    )
  }

  if (challengeError) {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 16px', textAlign: 'center', color: 'var(--color-danger)' }}>
        {challengeError}
      </div>
    )
  }

  if (!challenge) {
    return <EmptyState profile={profile} onStartChallenge={onStartChallenge} />
  }

  if (challenge.status === 'completed') {
    return <CompletedSummary challenge={challenge} dailyLogs={dailyLogs} onStartChallenge={onStartChallenge} />
  }

  // Active challenge
  const today = new Date().toISOString().split('T')[0]
  const todayLog = dailyLogs.find(l => l.log_date === today)
  const currentSteps = steps ?? 0
  const dailyGoal = challenge.daily_goal
  const stepsRemaining = Math.max(0, dailyGoal - currentSteps)
  const minutesRemaining = Math.round(stepsRemaining / 100)
  const pct = dailyGoal > 0 ? Math.min(100, Math.round((currentSteps / dailyGoal) * 100)) : 0
  const goalReached = currentSteps >= dailyGoal

  let barColor = 'var(--color-primary)'
  if (goalReached || todayLog?.goal_met || todayLog?.grace_day_used) barColor = 'var(--color-success)'

  const failedDays = dailyLogs.filter(l => !l.goal_met && !l.grace_day_used).length
  const moneyLostCents = Math.round((failedDays / 7) * challenge.effective_amount_cents)
  const dailyRiskCents = Math.round(challenge.effective_amount_cents / 7)

  const graceDaysLeft = challenge.grace_days - challenge.grace_days_used
  const canUseGraceDay = (
    graceDaysLeft > 0 &&
    !todayLog?.grace_day_used &&
    !todayLog?.goal_met &&
    !goalReached &&
    today >= challenge.start_date &&
    today <= challenge.end_date
  )

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>

      {/* ── Steps today ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 52, fontWeight: 800, color: barColor, letterSpacing: -2, lineHeight: 1 }}>
              {stepsLoading && steps === null ? '…' : currentSteps.toLocaleString()}
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 4 }}>steps today</div>
          </div>
          <button
            className="btn"
            onClick={fetchSteps}
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

        {!goalReached && !todayLog?.goal_met && !todayLog?.grace_day_used && steps !== null && (
          <div style={{ marginTop: 10, fontSize: 14, color: 'var(--color-warning)' }}>
            ~{stepsRemaining.toLocaleString()} more steps (~{minutesRemaining} min)
          </div>
        )}
        {(goalReached || todayLog?.goal_met) && (
          <div style={{ marginTop: 10, fontSize: 14, color: 'var(--color-success)', fontWeight: 600 }}>
            ✅ Goal reached!
          </div>
        )}
        {stepsError && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-danger)' }}>{stepsError}</div>
        )}
      </div>

      {/* ── Week view ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        {logsLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>Loading…</div>
        ) : (
          <WeekView challenge={challenge} dailyLogs={dailyLogs} />
        )}
      </div>

      {/* ── Money at risk ── */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{eur(challenge.effective_amount_cents)}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>At stake</div>
          </div>
          <div>
            <div style={{
              fontSize: 20, fontWeight: 700,
              color: moneyLostCents > 0 ? 'var(--color-danger)' : 'var(--color-text)',
            }}>
              {eur(moneyLostCents)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>Pledged so far</div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-warning)' }}>{eur(dailyRiskCents)}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>Today's pledge</div>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {challenge.start_date} – {challenge.end_date} · {graceDaysLeft} grace {graceDaysLeft === 1 ? 'day' : 'days'} left
        </div>
      </div>

      {/* ── Grace day ── */}
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
            Counts as completing today. {graceDaysLeft - 1} grace {graceDaysLeft - 1 === 1 ? 'day' : 'days'} remaining after this.
          </p>
          {graceDayError && (
            <p style={{ color: 'var(--color-danger)', fontSize: 13, marginTop: 8 }}>{graceDayError}</p>
          )}
        </div>
      )}

      {/* ── iOS Setup ── */}
      <IOSSetup />
    </div>
  )
}
