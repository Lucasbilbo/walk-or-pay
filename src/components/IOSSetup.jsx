import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function IOSSetup() {
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleGetToken() {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch('/.netlify/functions/generate-user-token', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to get token')
      setToken(data.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed — select and copy manually')
    }
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        📱 iOS Setup
      </div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
        Use this token in the Walk or Pay iOS Shortcut to log steps from Apple Health automatically.
      </p>

      {!token ? (
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleGetToken}
          disabled={loading}
          style={{ width: '100%', padding: '11px', fontSize: 14 }}
        >
          {loading ? 'Generating…' : 'Get my iOS token'}
        </button>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              readOnly
              value={token}
              style={{
                flex: 1, background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: 6, padding: '8px 10px', fontSize: 11,
                color: 'var(--color-text)', fontFamily: 'monospace',
              }}
            />
            <button
              type="button"
              className="btn"
              onClick={handleCopy}
              style={{ background: 'var(--color-border)', color: 'var(--color-text)', padding: '8px 12px', fontSize: 13, whiteSpace: 'nowrap' }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginTop: 8 }}>{error}</p>}

      <a
        href="https://walk-or-pay.netlify.app/shortcut"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', marginTop: 10, fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none' }}
      >
        ↓ Download Shortcut
      </a>
    </div>
  )
}
