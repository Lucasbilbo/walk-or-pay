import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native'
import { queryQuantitySamples, requestAuthorization } from '@kingstinct/react-native-healthkit'
import { supabase, SHORTCUT_LOG_URL } from '../lib/supabase'

export default function DashboardScreen({ user, onSignOut, onStartChallenge }) {
  const [steps, setSteps] = useState(null)
  const [stepsLoading, setStepsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [challenge, setChallenge] = useState(null)
  const [challengeLoading, setChallengeLoading] = useState(true)
  const [token, setToken] = useState(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

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
        await fetchTodaySteps()
      } catch (e) {
        console.error('[HealthKit] error:', e)
        setSteps(0)
      } finally {
        setStepsLoading(false)
      }
    }
    initHealth()
  }, [])

  async function loadChallenge() {
    setChallengeLoading(true)
    const { data, error } = await supabase
      .from('challenges')
      .select('id,daily_goal,status,start_date,end_date,amount_cents,effective_amount_cents')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error) setChallenge(data)
    setChallengeLoading(false)
  }

  async function loadToken() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    try {
      const res = await fetch('https://walk-or-pay.netlify.app/.netlify/functions/generate-user-token', {
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
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const samples = await queryQuantitySamples('HKQuantityTypeIdentifierStepCount', {
        from: startOfDay,
        to: now,
        unit: 'count',
      })
      const totalSteps = samples.reduce((sum, s) => sum + s.quantity, 0)
      setSteps(Math.round(totalSteps))
    } catch (e) {
      console.error('[HealthKit] getQuantitySamples error:', e)
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
      const today = new Date().toISOString().split('T')[0]
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
    } catch (err) {
      Alert.alert('Sync error', err.message)
    } finally {
      setSyncing(false)
    }
  }

  const goalMet = challenge && steps !== null && steps >= challenge.daily_goal
  const stepsRemaining = challenge && steps !== null
    ? Math.max(0, challenge.daily_goal - steps)
    : null

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

      {/* Challenge info */}
      {!challengeLoading && challenge && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ACTIVE CHALLENGE</Text>
          <Text style={styles.challengeGoal}>
            {challenge.daily_goal.toLocaleString()} steps/day
          </Text>
          <Text style={styles.challengeDetail}>
            {challenge.start_date} → {challenge.end_date}
          </Text>
          <Text style={styles.challengeDetail}>
            Stake: ${(challenge.effective_amount_cents / 100).toFixed(2)}
          </Text>
        </View>
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
    marginBottom: 8,
  },
  stepsLoading: { fontSize: 48, color: '#ccc', fontWeight: '700' },
  stepsCount: { fontSize: 64, fontWeight: '800', color: '#1a1a1a', lineHeight: 72 },
  stepsCountSuccess: { color: '#16a34a' },
  stepsGoal: { fontSize: 14, color: '#888', marginTop: 4 },
  stepsError: { fontSize: 16, color: '#ef4444' },
  refreshButton: { marginTop: 12, alignSelf: 'flex-start' },
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
  challengeGoal: { fontSize: 22, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  challengeDetail: { fontSize: 14, color: '#888', marginTop: 2 },
  noChallenge: { fontSize: 14, color: '#888', marginTop: 4, lineHeight: 20, marginBottom: 16 },
  startButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  startButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
