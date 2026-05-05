import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { CardField, useStripe } from '@stripe/stripe-react-native'
import { supabase } from '../lib/supabase'

const API_BASE = 'https://walk-or-pay.netlify.app/.netlify/functions'

const STEP_OPTIONS = [2000, 4000, 6000, 8000, 10000, 12000, 15000, 20000]
const AMOUNT_OPTIONS = [5, 10, 20, 50, 100]
const CHARITY_OPTIONS = [
  '🏥 Cruz Roja Española',
  '🧒 UNICEF España',
  '🌿 WWF España',
  '🩺 Médicos Sin Fronteras',
  '❤️ Cáritas España',
]

export default function CreateChallengeScreen({ onBack, onSuccess }) {
  const { confirmPayment } = useStripe()

  const [step, setStep] = useState(1)
  const [dailyGoal, setDailyGoal] = useState(8000)
  const [amountEuros, setAmountEuros] = useState(20)
  const [charity, setCharity] = useState('🏥 Cruz Roja Española')
  const [graceDays, setGraceDays] = useState(0)
  const [loading, setLoading] = useState(false)

  const TOTAL_STEPS = 5

  function goNext() { setStep(s => s + 1) }
  function goBack() {
    if (step === 1) onBack()
    else setStep(s => s - 1)
  }

  async function handlePay() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        Alert.alert('Error', 'Not authenticated. Please sign in again.')
        return
      }

      const res = await fetch(`${API_BASE}/create-challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          daily_goal: dailyGoal,
          amount_cents: amountEuros * 100,
          grace_days: graceDays,
          charity,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Could not create challenge. Please try again.')
        return
      }

      const { client_secret } = data
      const { error } = await confirmPayment(client_secret, {
        paymentMethodType: 'Card',
      })

      if (error) {
        Alert.alert('Payment failed', error.message)
        return
      }

      onSuccess()
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Challenge</Text>
        <Text style={styles.stepIndicator}>{step}/{TOTAL_STEPS}</Text>
      </View>

      {/* Step 1 — Goal */}
      {step === 1 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily step goal</Text>
          <Text style={styles.cardSubtitle}>How many steps will you commit to each day?</Text>
          <View style={styles.optionsGrid}>
            {STEP_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.optionButton, dailyGoal === opt && styles.optionSelected]}
                onPress={() => setDailyGoal(opt)}
              >
                <Text style={[styles.optionText, dailyGoal === opt && styles.optionTextSelected]}>
                  {opt.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.selectedValue}>{dailyGoal.toLocaleString()} steps/day</Text>
          <TouchableOpacity style={styles.nextButton} onPress={goNext}>
            <Text style={styles.nextButtonText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2 — Stake */}
      {step === 2 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stake amount</Text>
          <Text style={styles.cardSubtitle}>How much do you want to put on the line?</Text>
          <View style={styles.optionsGrid}>
            {AMOUNT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.optionButton, amountEuros === opt && styles.optionSelected]}
                onPress={() => setAmountEuros(opt)}
              >
                <Text style={[styles.optionText, amountEuros === opt && styles.optionTextSelected]}>
                  €{opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.selectedValue}>€{amountEuros} at stake for 7 days</Text>
          <TouchableOpacity style={styles.nextButton} onPress={goNext}>
            <Text style={styles.nextButtonText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 3 — Charity */}
      {step === 3 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Choose your charity</Text>
          <Text style={styles.cardSubtitle}>
            If you miss a day, your pledge goes here. Hit every day and get it all back.
          </Text>
          <View style={styles.charityList}>
            {CHARITY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt}
                style={[styles.charityButton, charity === opt && styles.charitySelected]}
                onPress={() => setCharity(opt)}
              >
                <Text style={[styles.charityText, charity === opt && styles.charityTextSelected]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.nextButton} onPress={goNext}>
            <Text style={styles.nextButtonText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 4 — Grace day */}
      {step === 4 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Grace day</Text>
          <Text style={styles.cardSubtitle}>
            A grace day lets you miss one day without obligation. Do you want one?
          </Text>
          <View style={styles.graceRow}>
            <TouchableOpacity
              style={[styles.graceButton, graceDays === 0 && styles.graceSelected]}
              onPress={() => setGraceDays(0)}
            >
              <Text style={[styles.graceText, graceDays === 0 && styles.graceTextSelected]}>
                No grace day
              </Text>
              <Text style={styles.graceSubtext}>Full 7 days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.graceButton, graceDays === 1 && styles.graceSelected]}
              onPress={() => setGraceDays(1)}
            >
              <Text style={[styles.graceText, graceDays === 1 && styles.graceTextSelected]}>
                1 grace day
              </Text>
              <Text style={styles.graceSubtext}>Miss 1 free</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.nextButton} onPress={goNext}>
            <Text style={styles.nextButtonText}>Continue →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 5 — Review & Pay */}
      {step === 5 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Review & Pay</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Daily goal</Text>
            <Text style={styles.summaryValue}>{dailyGoal.toLocaleString()} steps</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Duration</Text>
            <Text style={styles.summaryValue}>7 days</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Daily pledge if missed</Text>
            <Text style={styles.summaryValue}>€{(amountEuros / 7).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Missed day pledge goes to</Text>
            <Text style={[styles.summaryValue, { maxWidth: 180, textAlign: 'right' }]}>{charity}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Grace days</Text>
            <Text style={styles.summaryValue}>{graceDays === 0 ? 'None' : '1 day'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service fee</Text>
            <Text style={styles.summaryValue}>€1.00</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryLabelBold}>Total charge</Text>
            <Text style={styles.summaryValueBold}>€{amountEuros + 1}.00</Text>
          </View>

          <Text style={styles.cardFieldLabel}>Card details</Text>
          <CardField
            postalCodeEnabled={false}
            style={styles.cardField}
            cardStyle={{
              backgroundColor: '#fafafa',
              textColor: '#1a1a1a',
              borderColor: '#e5e5e5',
              borderWidth: 1,
              borderRadius: 8,
            }}
          />

          <TouchableOpacity
            style={[styles.payButton, loading && styles.payButtonDisabled]}
            onPress={handlePay}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.payButtonText}>{`Pay €${amountEuros + 1} & Start Challenge`}</Text>
            }
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            Hit your goal every day and get your full deposit back. Miss a day and that day's share goes to {charity}.
          </Text>
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
  back: { fontSize: 15, color: '#888' },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  stepIndicator: { fontSize: 13, color: '#aaa' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a1a', marginBottom: 6 },
  cardSubtitle: { fontSize: 14, color: '#888', marginBottom: 24, lineHeight: 20 },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  optionButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    backgroundColor: '#fafafa',
  },
  optionSelected: {
    borderColor: '#1a1a1a',
    backgroundColor: '#1a1a1a',
  },
  optionText: { fontSize: 14, fontWeight: '600', color: '#555' },
  optionTextSelected: { color: '#fff' },
  selectedValue: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    marginBottom: 24,
  },
  nextButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  // Charity
  charityList: { flexDirection: 'column', gap: 10, marginBottom: 24 },
  charityButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    backgroundColor: '#fafafa',
  },
  charitySelected: { borderColor: '#1a1a1a', backgroundColor: '#1a1a1a' },
  charityText: { fontSize: 15, fontWeight: '600', color: '#555' },
  charityTextSelected: { color: '#fff' },
  // Grace day
  graceRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  graceButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  graceSelected: { borderColor: '#1a1a1a', backgroundColor: '#1a1a1a' },
  graceText: { fontSize: 14, fontWeight: '700', color: '#555', marginBottom: 2 },
  graceTextSelected: { color: '#fff' },
  graceSubtext: { fontSize: 12, color: '#aaa' },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  summaryTotal: { borderBottomWidth: 0, marginTop: 4 },
  summaryLabel: { fontSize: 14, color: '#888', flex: 1 },
  summaryValue: { fontSize: 14, color: '#1a1a1a', fontWeight: '500' },
  summaryLabelBold: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  summaryValueBold: { fontSize: 15, fontWeight: '800', color: '#1a1a1a' },
  cardFieldLabel: { fontSize: 13, color: '#888', marginTop: 20, marginBottom: 8 },
  cardField: { height: 50, marginBottom: 20 },
  payButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  payButtonDisabled: { opacity: 0.5 },
  payButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disclaimer: { fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 18 },
})
