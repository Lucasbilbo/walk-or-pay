import { useState, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { supabase } from '../lib/supabase'
import { calculateEffectiveAmount } from '../lib/challengeLogic'

const MIN_STAKE = 5
const MAX_STAKE = 100

function fmt(cents) {
  return `$${(cents / 100).toFixed(2)}`
}

// ── Step 1: Goal ────────────────────────────────
function StepGoal({ goal, onChange, onNext }) {
  return (
    <div>
      <h2 style={s.title}>What's your daily step goal?</h2>
      <div style={s.bigNum}>{goal.toLocaleString()}</div>
      <input
        type="range"
        min={2000} max={20000} step={500}
        value={goal}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--color-primary)', margin: '20px 0' }}
      />
      <p style={s.note}>💡 Most health guidelines recommend 7,000–10,000 steps/day</p>
      <button type="button" className="btn btn-primary" onClick={onNext} style={s.fullBtn}>Next →</button>
    </div>
  )
}

// ── Step 2: Stake ────────────────────────────────
function StepStake({ stake, onChange, welcomeBonusUsed, onNext, onBack }) {
  const amountCents = Math.round(stake * 100)
  const effectiveCents = calculateEffectiveAmount(amountCents, welcomeBonusUsed)
  const perDayCents = Math.round(effectiveCents / 7)
  const valid = stake >= MIN_STAKE && stake <= MAX_STAKE

  return (
    <div>
      <h2 style={s.title}>How much do you want to put at stake?</h2>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '24px 0' }}>
        <span style={{ fontSize: 28, color: 'var(--color-text-secondary)' }}>$</span>
        <input
          type="number"
          min={MIN_STAKE} max={MAX_STAKE}
          value={stake}
          onChange={e => onChange(Number(e.target.value))}
          style={s.numInput}
        />
      </div>

      {!welcomeBonusUsed && (
        <div style={s.bonusBox}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            🎁 First challenge bonus: we'll double your stake to {fmt(effectiveCents)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            If you win, you get back {fmt(amountCents)} (your deposit).
            If you miss a day, you lose {fmt(perDayCents)} (from the doubled amount).
          </div>
        </div>
      )}

      <div style={{ fontSize: 14, textAlign: 'center', margin: '16px 0' }}>
        <span style={{ color: 'var(--color-text-secondary)' }}>Per missed day: </span>
        <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{fmt(perDayCents)}</span>
      </div>

      {stake > 0 && !valid && (
        <p style={{ color: 'var(--color-danger)', fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
          Amount must be between ${MIN_STAKE} and ${MAX_STAKE}.
        </p>
      )}

      <div style={s.btnRow}>
        <button type="button" className="btn" onClick={onBack} style={s.backBtn}>← Back</button>
        <button type="button" className="btn btn-primary" onClick={onNext} disabled={!valid} style={{ flex: 1 }}>Next →</button>
      </div>
    </div>
  )
}

// ── Step 3: Grace day ────────────────────────────
function StepGraceDay({ graceDays, onChange, onNext, onBack }) {
  const options = [
    { value: 1, title: 'Yes, give me 1 grace day', sub: 'One free pass if life gets in the way' },
    { value: 0, title: 'No grace days', sub: "Full commitment. I won't need it." },
  ]
  return (
    <div>
      <h2 style={s.title}>Do you want a grace day?</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '24px 0' }}>
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              ...s.optionCard,
              borderColor: graceDays === opt.value ? 'var(--color-primary)' : 'var(--color-border)',
              background: graceDays === opt.value ? 'rgba(59,130,246,0.1)' : 'var(--color-surface)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{opt.title}</div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{opt.sub}</div>
          </button>
        ))}
      </div>
      <div style={s.btnRow}>
        <button type="button" className="btn" onClick={onBack} style={s.backBtn}>← Back</button>
        <button type="button" className="btn btn-primary" onClick={onNext} style={{ flex: 1 }}>Next →</button>
      </div>
    </div>
  )
}

// ── Step 4: Summary & Pay (inner — needs Stripe context) ─────────
function StepPayInner({ goal, stake, graceDays, welcomeBonusUsed, onBack, onSuccess }) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const amountCents = Math.round(stake * 100)
  const effectiveCents = calculateEffectiveAmount(amountCents, welcomeBonusUsed)
  const perDayCents = Math.round(effectiveCents / 7)

  async function handlePay() {
    if (!stripe || !elements) return
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch('/.netlify/functions/create-challenge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          daily_goal: goal,
          amount_cents: amountCents,
          grace_days: graceDays,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create challenge')

      const cardElement = elements.getElement(CardElement)
      const { error: stripeError } = await stripe.confirmCardPayment(data.client_secret, {
        payment_method: { card: cardElement },
      })
      if (stripeError) throw new Error(stripeError.message)

      // Success — webhook will activate challenge asynchronously
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2 style={s.title}>Ready to commit?</h2>
      <div className="card" style={{ marginBottom: 20 }}>
        {[
          { label: 'Duration', value: '7-day challenge starting today' },
          { label: 'Daily goal', value: `${goal.toLocaleString()} steps` },
          { label: 'Your deposit', value: `$${stake.toFixed(2)}` },
          {
            label: 'At stake',
            value: welcomeBonusUsed ? `$${stake.toFixed(2)}` : `${fmt(effectiveCents)} (2x bonus!)`,
            highlight: !welcomeBonusUsed,
          },
          { label: 'Per missed day', value: fmt(perDayCents), danger: true },
          { label: 'Grace days', value: `${graceDays}` },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>{row.label}</span>
            <span style={{
              fontWeight: 600, fontSize: 14,
              color: row.danger ? 'var(--color-danger)' : row.highlight ? 'var(--color-warning)' : 'var(--color-text)',
            }}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      <div style={s.cardElementWrap}>
        <CardElement options={{ style: { base: { fontSize: '16px', color: '#F1F5F9', '::placeholder': { color: '#64748B' } } } }} />
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 14, marginBottom: 16 }}>{error}</p>}

      <div style={s.btnRow}>
        <button type="button" className="btn" onClick={onBack} disabled={loading} style={s.backBtn}>← Back</button>
        <button type="button" className="btn btn-primary" onClick={handlePay} disabled={loading || !stripe} style={{ flex: 1, padding: '14px' }}>
          {loading ? 'Processing…' : `Start Challenge — Pay $${stake.toFixed(2)}`}
        </button>
      </div>
    </div>
  )
}

// ── Step 4: wrapper that provides Stripe Elements context ─────────
function StepPay(props) {
  const stripePromise = useMemo(
    () => loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY),
    []
  )
  return (
    <Elements stripe={stripePromise}>
      <StepPayInner {...props} />
    </Elements>
  )
}

// ── Root component ───────────────────────────────
export default function CreateChallenge({ welcomeBonusUsed, onBack, onSuccess }) {
  const [step, setStep] = useState(1)
  const [goal, setGoal] = useState(8000)
  const [stake, setStake] = useState(20)
  const [graceDays, setGraceDays] = useState(1)

  function handleSuccess() {
    onSuccess()
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      {/* Header with back + progress dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <button
          type="button"
          className="btn"
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', padding: '0', fontSize: 14 }}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', gap: 6, flex: 1, justifyContent: 'center' }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: n <= step ? 'var(--color-primary)' : 'var(--color-border)',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>
        <div style={{ width: 48 }} />
      </div>

      {step === 1 && (
        <StepGoal goal={goal} onChange={setGoal} onNext={() => setStep(2)} />
      )}
      {step === 2 && (
        <StepStake
          stake={stake} onChange={setStake}
          welcomeBonusUsed={welcomeBonusUsed}
          onNext={() => setStep(3)} onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <StepGraceDay
          graceDays={graceDays} onChange={setGraceDays}
          onNext={() => setStep(4)} onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <StepPay
          goal={goal} stake={stake} graceDays={graceDays}
          welcomeBonusUsed={welcomeBonusUsed}
          onBack={() => setStep(3)} onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

const s = {
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4, lineHeight: 1.3 },
  bigNum: { fontSize: 64, fontWeight: 800, color: 'var(--color-primary)', textAlign: 'center', letterSpacing: -3, margin: '16px 0' },
  note: { color: 'var(--color-text-secondary)', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  fullBtn: { width: '100%', padding: '14px', fontSize: 15 },
  numInput: {
    padding: '12px 16px', borderRadius: 8, border: '1px solid var(--color-border)',
    background: 'var(--color-bg)', color: 'var(--color-text)',
    fontSize: 36, fontWeight: 800, fontFamily: 'inherit',
    textAlign: 'center', outline: 'none', width: 120,
  },
  bonusBox: {
    background: 'rgba(245,158,11,0.1)', border: '1px solid var(--color-warning)',
    borderRadius: 10, padding: 16, marginBottom: 8,
  },
  btnRow: { display: 'flex', gap: 12, marginTop: 24 },
  cardElementWrap: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 8, padding: '14px 16px', marginBottom: 16,
  },
  backBtn: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', padding: '12px 16px' },
  optionCard: {
    background: 'var(--color-surface)', border: '2px solid var(--color-border)',
    borderRadius: 12, padding: '16px 20px', cursor: 'pointer',
    textAlign: 'left', color: 'var(--color-text)', fontFamily: 'inherit',
    transition: 'border-color 0.15s', width: '100%',
  },
}
