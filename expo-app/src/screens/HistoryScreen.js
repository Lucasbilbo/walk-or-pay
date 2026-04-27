import { useState, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabase'

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function HistoryScreen({ user, onBack }) {
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    setLoading(true)
    setError(false)
    try {
      const { data, error: err } = await supabase
        .from('challenges')
        .select('id,start_date,end_date,daily_goal,amount_cents,penalty_cents,status,created_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })

      if (err) throw err
      setChallenges(data ?? [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function renderContent() {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a1a1a" />
        </View>
      )
    }

    if (error) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Could not load history.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadHistory}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )
    }

    if (challenges.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🏃</Text>
          <Text style={styles.emptyTitle}>No completed challenges yet</Text>
          <Text style={styles.emptySubtitle}>
            Your first challenge is in progress!{'\n'}Come back once it ends.
          </Text>
        </View>
      )
    }

    return challenges.map((ch) => {
      const deposited = (ch.amount_cents / 100).toFixed(2)
      const penalty = ch.penalty_cents ?? 0
      const refund = Math.max(0, ch.amount_cents - penalty)
      const refundFormatted = (refund / 100).toFixed(2)
      const fullRefund = penalty === 0

      return (
        <View key={ch.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.dateRange}>{formatDate(ch.start_date)} → {formatDate(ch.end_date)}</Text>
            <View style={styles.resultWrapper}>
              <Text style={[styles.result, fullRefund ? styles.resultFull : styles.resultPartial]}>
                {fullRefund ? '✓ Full refund' : 'Partial refund'}
              </Text>
              {!fullRefund && (
                <Text style={styles.resultSub}>remainder donated to ALS</Text>
              )}
            </View>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Daily goal</Text>
            <Text style={styles.value}>{ch.daily_goal.toLocaleString()} steps</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Deposited</Text>
            <Text style={styles.value}>€{deposited}</Text>
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.label}>Refunded</Text>
            <Text style={[styles.value, fullRefund ? styles.textSuccess : styles.textWarning]}>
              €{refundFormatted}
            </Text>
          </View>
        </View>
      )
    })
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.container,
          (loading || error || challenges.length === 0) && styles.containerFlex,
        ]}
      >
        {renderContent()}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f9f9f9', paddingTop: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  back: { fontSize: 15, color: '#888' },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  placeholder: { width: 40 },
  scroll: { flex: 1 },
  container: { padding: 20, paddingBottom: 40 },
  containerFlex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  errorText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', textAlign: 'center', marginBottom: 16 },
  retryButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  retryButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a1a', textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  dateRange: { fontSize: 13, fontWeight: '600', color: '#1a1a1a' },
  resultWrapper: { alignItems: 'flex-end' },
  result: { fontSize: 13, fontWeight: '700' },
  resultSub: { fontSize: 11, color: '#aaa', marginTop: 2 },
  resultFull: { color: '#16a34a' },
  resultPartial: { color: '#f59e0b' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
  },
  rowLast: {},
  label: { fontSize: 14, color: '#888' },
  value: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  textSuccess: { color: '#16a34a', fontWeight: '700' },
  textWarning: { color: '#f59e0b', fontWeight: '700' },
})
