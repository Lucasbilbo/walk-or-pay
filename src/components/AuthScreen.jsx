import { useState } from 'react'

export default function AuthScreen({ onSignIn }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    try {
      await onSignIn(email.trim())
      setSent(true)
    } catch (err) {
      setError(err.message || 'Failed to send magic link. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div style={s.outer}>
        <div className="card" style={s.card}>
          <div style={s.icon}>✉️</div>
          <h2 style={s.title}>Check your email</h2>
          <p style={s.sub}>
            We sent a magic link to <strong>{email}</strong>.
            Click it to sign in — no password needed.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.outer}>
      <div className="card" style={s.card}>
        <h1 style={s.logo}>Walk or Pay</h1>
        <p style={s.tagline}>Hit your step goal — or pay the price.</p>
        <form onSubmit={handleSubmit} style={s.form}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoFocus
            style={s.input}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !email.trim()}
            style={{ width: '100%', padding: '13px' }}
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
        {error && <p style={s.error}>{error}</p>}
        <p style={s.footer}>
          <a href="/privacy" style={s.footerLink}>Privacy Policy</a>
          {' · '}
          <a href="/terms" style={s.footerLink}>Terms of Service</a>
        </p>
      </div>
    </div>
  )
}

const s = {
  outer: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 },
  card: { width: '100%', maxWidth: 400, textAlign: 'center' },
  icon: { fontSize: 52, marginBottom: 16 },
  logo: { fontSize: 30, fontWeight: 800, color: 'var(--color-primary)', marginBottom: 8, letterSpacing: -1 },
  tagline: { color: 'var(--color-text-secondary)', marginBottom: 32, fontSize: 15 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 12 },
  sub: { color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    width: '100%', padding: '13px 16px', borderRadius: 8,
    border: '1px solid var(--color-border)', background: 'var(--color-bg)',
    color: 'var(--color-text)', fontSize: 15, fontFamily: 'inherit', outline: 'none',
  },
  error: { color: 'var(--color-danger)', fontSize: 13, marginTop: 12 },
  footer: { marginTop: 24, fontSize: 12, color: 'var(--color-text-secondary)' },
  footerLink: { color: 'var(--color-text-secondary)' },
}
