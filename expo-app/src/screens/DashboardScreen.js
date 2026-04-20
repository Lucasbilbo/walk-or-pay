import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native'
import { queryStatisticsForQuantity, requestAuthorization } from '@kingstinct/react-native-healthkit'
import * as Notifications from 'expo-notifications'
import { supabase, SHORTCUT_LOG_URL } from '../lib/supabase'

const API_BASE = 'https://walk-or-pay.netlify.app/.netlify/functions'

function getLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDates(startDate) {
  const dates = []
  const start = new Date(startDate + 'T00:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

function CompletedScreen({ challenge, dailyLogs, onSignOut, onStartChallenge }) {
  const failedDays = dailyLogs.filter(l => !l.goal_met && !l.grace_day_used).length
  const completedDays = 7 - failedDays
  const penaltyCents = challenge.penalty_cents ?? 0
  const refundCents = Math.max(0, challenge.amount_cents - penaltyCents)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Walk or Pay</Text>
        <TouchableOpacity onPress={onSignOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { alignItems: 'center', paddingVertical: 28 }]}>
        <Text style={styles.completedEmoji}>🏁</Text>
        <Text style={styles.completedTitle}>Challenge completed</Text>
        <Text style={styles.completedSubtitle}>{challenge.start_date} – {challenge.end_date}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Days completed</Text>
          <Text style={styles.summaryValue}>{completedDays} / 7</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Days failed</Text>
          <Text style={[styles.summaryValue, failedDays > 0 && styles.textDanger]}>{failedDays} / 7</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryDivider]}>
          <Text style={styles.summaryLabel}>Amount deposited</Text>
          <Text style={styles.summaryValue}>{(challenge.amount_cents / 100).toFixed(2)} €</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Penalty</Text>
          <Text style={[styles.summaryValue, penaltyCents > 0 && styles.textDanger]}>
            {(penaltyCents / 100).toFixed(2)} €
          </Text>
        </View>
        <View style={[styles.summaryRow, { marginTop: 4 }]}>
          <Text style={styles.summaryLabelBold}>Amount refunded</Text>
          <Text style={[styles.summaryValueBold, styles.textSuccess]}>
            {(refundCents / 100).toFixed(2)} €
          </Text>
        </View>
      </View>

      <View style={[styles.card, penaltyCents === 0 ? styles.cardSuccess : styles.cardWarning]}>
        <Text style={styles.completedMessage}>
          {penaltyCents === 0
            ? 'Challenge completed with no penalty! Your full deposit will be refunded.'
            : 'Your penalty will be donated to a charitable cause.'}
        </Text>
      </View>

      <TouchableOpacity style={styles.startButton} onPress={onStartChallenge}>
        <Text style={styles.startButtonText}>Start a new challenge →</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

function WeekView({ challenge, dailyLogs }) {
  const today = getLocalDateString()
  const weekDates = getWeekDates(challenge.start_date)

  return (
    <View style={styles.weekRow}>
      {weekDates.map((date, i) => {
        const log = dailyLogs.find(l => l.log_date === date)
        const isToday = date === today
        const isFuture = date > today
        const goalMet = log?.goal_met === true
        const goalFailed = log && !log.goal_met && !log.grace_day_used && !isFuture

        let emoji = '⚪'
        let dotStyle = styles.dotGray
        if (isToday) { emoji = '🔵'; dotStyle = styles.dotBlue }
        else if (goalMet) { emoji = '✅'; dotStyle = styles.dotGreen }
        else if (goalFailed) { emoji = '❌'; dotStyle = styles.dotRed }

        return (
          <View key={date} style={styles.dayCol}>
            <Text style={styles.dayEmoji}>{emoji}</Text>
            <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
              {DAY_LABELS[i]}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

export default function DashboardScreen({ user, onSignOut, onStartChallenge }) {
  const [steps, setSteps] = useState(null)
  const [stepsLoading, setStepsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [challenge, setChallenge] = useState(null)
  const [dailyLogs, setDailyLogs] = useState([])
  const [challengeLoading, setChallengeLoading] = useState(true)
  const [token, setToken] = useState(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [graceDayLoading, setGraceDayLoading] = useState(false)

  useEffect(() => {
    loadChallenge()
    loadToken()
  }, [])

  useEffect(() => {
    const initHealth = async () => {
      try {
        await requestAuthorization({
          toRead: ['HKQuantityTypeIdentifierStepCount'],
          toWrite: [],
        })

        const now = new Date()
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

        const stats = await queryStatisticsForQuantity(
          'HKQuantityTypeIdentifierStepCount',
          ['cumulativeSum'],
          {
            unit: 'count',
            filter: {
              date: {
                startDate: startOfDay,
                endDate: now,
              },
            },
          }
        )
        setSteps(Math.round(stats.sumQuantity?.quantity ?? 0))
      } catch (e) {
        console.log('[HealthKit] not available yet:', e.message)
        setSteps(0)
      } finally {
        setStepsLoading(false)
      }
    }
    initHealth()
  }, [])

  useEffect(() => {
    if (challenge?.status === 'active') {
      registerForPushNotifications()
    }
  }, [challenge?.id])

  async function registerForPushNotifications() {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync()
      let finalStatus = existing
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync()
        finalStatus = status
      }
      if (finalStatus !== 'granted') return

      const pushToken = await Notifications.getExpoPushTokenAsync()
      if (!pushToken?.data) return

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      await fetch(`${API_BASE}/save-push-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token: pushToken.data }),
      })
    } catch (e) {
      console.log('[PushNotifications] registration failed:', e.message)
    }
  }

  async function loadChallenge() {
    setChallengeLoading(true)
    const { data: ch } = await supabase
      .from('challenges')
      .select('id,daily_goal,status,start_date,end_date,amount_cents,effective_amount_cents,grace_days,grace_days_used,penalty_cents')
      .eq('user_id', user.id)
      .in('status', ['active', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setChallenge(ch ?? null)

    if (ch) {
      const { data: logs } = await supabase
        .from('daily_logs')
        .select('log_date,steps,goal_met,grace_day_used')
        .eq('challenge_id', ch.id)
        .order('log_date', { ascending: true })
      setDailyLogs(logs ?? [])
    }

    setChallengeLoading(false)
  }

  async function loadToken() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    try {
      const res = await fetch(`${API_BASE}/generate-user-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (res.ok) setToken(data.token)
    } catch {
      // token unavailable — sync won't work but steps display will
    }
  }

  const fetchTodaySteps = useCallback(async () => {
    try {
      const now = new Date()
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const stats = await queryStatisticsForQuantity(
        'HKQuantityTypeIdentifierStepCount',
        ['cumulativeSum'],
        {
          unit: 'count',
          filter: {
            date: {
              startDate: startOfDay,
              endDate: now,
            },
          },
        }
      )
      setSteps(Math.round(stats.sumQuantity?.quantity ?? 0))
    } catch (e) {
      console.log('[HealthKit] refresh error:', e.message)
    }
  }, [])

  async function handleRefresh() {
    setStepsLoading(true)
    await fetchTodaySteps()
    setStepsLoading(false)
  }

  async function syncSteps() {
    if (!token) {
      Alert.alert('Not configured', 'Could not load your sync token. Please try again.')
      return
    }
    if (steps === null) {
      Alert.alert('No steps data', 'HealthKit data is not available yet.')
      return
    }

    setSyncing(true)
    try {
      const today = getLocalDateString()
      const res = await fetch(SHORTCUT_LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, steps, date: today }),
      })
      const data = await res.json()

      if (!res.ok) {
        Alert.alert('Sync failed', data.error || 'Unknown error')
        return
      }

      setLastSyncedAt(new Date())
      loadChallenge()
    } catch (err) {
      Alert.alert('Sync error', err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleGraceDay() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    setGraceDayLoading(true)
    try {
      const today = getLocalDateString()
      const res = await fetch(`${API_BASE}/use-grace-day`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ challenge_id: challenge.id, date: today }),
      })
      const data = await res.json()
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to use grace day')
        return
      }
      loadChallenge()
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setGraceDayLoading(false)
    }
  }

  const today = getLocalDateString()
  const goalMet = challenge && steps !== null && steps >= challenge.daily_goal
  const stepsRemaining = challenge && steps !== null
    ? Math.max(0, challenge.daily_goal - steps)
    : null
  const stepsProgress = challenge && steps !== null
    ? Math.min(1, steps / challenge.daily_goal)
    : 0
  const todayLog = dailyLogs.find(l => l.log_date === today)
  const graceDaysLeft = challenge ? (challenge.grace_days ?? 0) - (challenge.grace_days_used ?? 0) : 0
  const showGraceDay = challenge
    && !goalMet
    && !todayLog?.goal_met
    && !todayLog?.grace_day_used
    && graceDaysLeft > 0
  const dailyRisk = challenge
    ? (challenge.effective_amount_cents / 7 / 100).toFixed(2)
    : null

  if (!challengeLoading && challenge?.status === 'completed') {
    return (
      <CompletedScreen
        challenge={challenge}
        dailyLogs={dailyLogs}
        onSignOut={onSignOut}
        onStartChallenge={onStartChallenge}
      />
    )
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Walk or Pay</Text>
        <TouchableOpacity onPress={onSignOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Steps card */}
      <View style={[styles.card, goalMet && styles.cardSuccess]}>
        <Text style={styles.cardLabel}>TODAY'S STEPS</Text>
        {stepsLoading ? (
          <Text style={styles.stepsLoading}>Loading…</Text>
        ) : steps !== null ? (
          <>
            <Text style={[styles.stepsCount, goalMet && styles.stepsCountSuccess]}>
              {steps.toLocaleString()}
            </Text>
            {challenge && (
              <Text style={styles.stepsGoal}>
                {goalMet
                  ? `Goal reached! (${challenge.daily_goal.toLocaleString()} steps)`
                  : `${stepsRemaining.toLocaleString()} to go · goal: ${challenge.daily_goal.toLocaleString()}`}
              </Text>
            )}
            {challenge && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${stepsProgress * 100}%` }]} />
              </View>
            )}
          </>
        ) : (
          <Text style={styles.stepsError}>HealthKit unavailable</Text>
        )}

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={handleRefresh}
          disabled={stepsLoading}
        >
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Sync button */}
      <TouchableOpacity
        style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
        onPress={syncSteps}
        disabled={syncing || stepsLoading || steps === null}
      >
        <Text style={styles.syncButtonText}>
          {syncing ? 'Syncing…' : 'Sync steps to Walk or Pay'}
        </Text>
      </TouchableOpacity>

      {lastSyncedAt && (
        <Text style={styles.syncedAt}>
          Last synced at {lastSyncedAt.toLocaleTimeString()}
        </Text>
      )}

      {/* Active challenge */}
      {!challengeLoading && challenge && (
        <>
          {/* Week view */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>THIS WEEK</Text>
            <WeekView challenge={challenge} dailyLogs={dailyLogs} />
          </View>

          {/* Stats */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>CHALLENGE STATS</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>€{dailyRisk}</Text>
                <Text style={styles.statLabel}>Today's risk</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{graceDaysLeft}</Text>
                <Text style={styles.statLabel}>Grace days left</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{challenge.end_date}</Text>
                <Text style={styles.statLabel}>Ends</Text>
              </View>
            </View>

            {showGraceDay && (
              <TouchableOpacity
                style={[styles.graceDayButton, graceDayLoading && styles.graceDayButtonDisabled]}
                onPress={handleGraceDay}
                disabled={graceDayLoading}
              >
                <Text style={styles.graceDayText}>
                  {graceDayLoading ? 'Using grace day…' : 'Use grace day for today'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {!challengeLoading && !challenge && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>NO ACTIVE CHALLENGE</Text>
          <Text style={styles.noChallenge}>
            Put money on the line and commit to your daily step goal for 7 days.
          </Text>
          <TouchableOpacity style={styles.startButton} onPress={onStartChallenge}>
            <Text style={styles.startButtonText}>Start your first challenge →</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f9f9f9' },
  container: { padding: 20, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: { fontSize: 20, fontWeight: '800', color: '#1a1a1a', letterSpacing: -0.5 },
  signOut: { fontSize: 13, color: '#999' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardSuccess: { borderColor: '#22c55e', backgroundColor: '#f0fdf4' },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  stepsLoading: { fontSize: 48, color: '#ccc', fontWeight: '700' },
  stepsCount: { fontSize: 64, fontWeight: '800', color: '#1a1a1a', lineHeight: 72 },
  stepsCountSuccess: { color: '#16a34a' },
  stepsGoal: { fontSize: 14, color: '#888', marginTop: 4, marginBottom: 10 },
  stepsError: { fontSize: 16, color: '#ef4444' },
  progressTrack: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 3,
  },
  refreshButton: { marginTop: 10, alignSelf: 'flex-start' },
  refreshText: { fontSize: 13, color: '#888', textDecorationLine: 'underline' },
  syncButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 8,
  },
  syncButtonDisabled: { opacity: 0.4 },
  syncButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  syncedAt: { fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 16 },
  // Week view
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: { alignItems: 'center', flex: 1 },
  dayEmoji: { fontSize: 22, marginBottom: 4 },
  dayLabel: { fontSize: 11, color: '#aaa', fontWeight: '500' },
  dayLabelToday: { color: '#1a1a1a', fontWeight: '700' },
  dotGray: {},
  dotBlue: {},
  dotGreen: {},
  dotRed: {},
  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#aaa' },
  statDivider: { width: 1, height: 32, backgroundColor: '#f0f0f0' },
  // Grace day
  graceDayButton: {
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  graceDayButtonDisabled: { opacity: 0.4 },
  graceDayText: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },
  // Completed screen
  completedEmoji: { fontSize: 48, marginBottom: 10 },
  completedTitle: { fontSize: 24, fontWeight: '800', color: '#1a1a1a', marginBottom: 4 },
  completedSubtitle: { fontSize: 13, color: '#999' },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  summaryDivider: { marginTop: 8 },
  summaryLabel: { fontSize: 14, color: '#888' },
  summaryValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  summaryLabelBold: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  summaryValueBold: { fontSize: 15, fontWeight: '800' },
  textDanger: { color: '#ef4444' },
  textSuccess: { color: '#16a34a' },
  cardWarning: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  completedMessage: { fontSize: 14, lineHeight: 20, color: '#1a1a1a', textAlign: 'center' },
  // No challenge
  noChallenge: { fontSize: 14, color: '#888', marginTop: 4, lineHeight: 20, marginBottom: 16 },
  startButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
