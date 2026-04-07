import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function ConnectFitness() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleConnect() {
    setLoading(true)
    setError(null)
    try {
      let { data: { session }, error } = await supabase.auth.getSession()
      console.log('Session:', session, 'Error:', error)

      if (!session) {
        // Fallback: refresh session in case it wasn't loaded yet
        const { data: refreshed } = await supabase.auth.refreshSession()
        console.log('Refreshed:', refreshed)
        if (!refreshed.session) throw new Error('Not authenticated')
        session = refreshed.session
      }

      const token = session.access_token
      const res = await fetch('/.netlify/functions/google-auth-url', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || 'Failed to get auth URL')

      // Redirect to Google OAuth — page will not return here
      window.location.href = data.url
    } catch (err) {
      console.error('Connect error:', err)
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={s.outer}>
      <div className="card" style={s.card}>
        <div style={s.icon}>🚶</div>
        <h2 style={s.title}>Connect Google Fit</h2>
        <p style={s.sub}>
          Required to verify your steps automatically.
          Your fitness data stays private — we only read step counts.
        </p>
        <button
          className="btn btn-primary"
          onClick={handleConnect}
          disabled={loading}
          style={{ width: '100%', padding: '14px', fontSize: 15, marginTop: 8 }}
        >
          {loading ? 'Redirecting to Google…' : 'Connect Google Fit'}
        </button>
        {error && <p style={s.error}>{error}</p>}
      </div>
    </div>
  )
}

const s = {
  outer: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24 },
  card: { width: '100%', maxWidth: 440, textAlign: 'center' },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 700, marginBottom: 12 },
  sub: { color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 },
  error: { color: 'var(--color-danger)', fontSize: 13, marginTop: 12 },
}
