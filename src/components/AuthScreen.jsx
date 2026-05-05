import { useState } from 'react'

export default function AuthScreen({ onSignIn, onSignInWithPassword }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('magic') // 'magic' | 'password'
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)
    try {
      if (mode === 'password') {
        await onSignInWithPassword(email.trim(), password)
      } else {
        await onSignIn(email.trim())
        setSent(true)
      }
    } catch (err) {
      setError(err.message || (mode === 'password' ? 'Invalid email or password.' : 'Failed to send magic link. Try again.'))
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
        <p style={s.tagline}>Hit your step goal — or fund a cause you care about.</p>
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
          {mode === 'password' && (
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              style={s.input}
            />
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !email.trim()}
            style={{ width: '100%', padding: '13px' }}
          >
            {loading
              ? (mode === 'password' ? 'Signing in…' : 'Sending…')
              : (mode === 'password' ? 'Sign in' : 'Send magic link')}
          </button>
        </form>
        {error && <p style={s.error}>{error}</p>}
        <button
          type="button"
          onClick={() => { setMode(m => m === 'magic' ? 'password' : 'magic'); setError(null) }}
          style={s.modeToggle}
        >
          {mode === 'magic' ? 'Sign in with password instead' : 'Send magic link instead'}
        </button>
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
  modeToggle: {
    background: 'none', border: 'none', color: 'var(--color-text-secondary)',
    fontSize: 13, cursor: 'pointer', marginTop: 16, textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  footer: { marginTop: 24, fontSize: 12, color: 'var(--color-text-secondary)' },
  footerLink: { color: 'var(--color-text-secondary)' },
}
