import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'
import AuthScreen from './components/AuthScreen'
import ConnectFitness from './components/ConnectFitness'
import Dashboard from './components/Dashboard'
import CreateChallenge from './components/CreateChallenge'
import PrivacyPolicy from './components/PrivacyPolicy'
import TermsOfService from './components/TermsOfService'
import SupportPage from './components/SupportPage'

export default function App() {
  const path = window.location.pathname
  if (path === '/privacy') return <PrivacyPolicy />
  if (path === '/terms') return <TermsOfService />
  if (path === '/support') return <SupportPage />
  const { user, loading: authLoading, signInWithMagicLink, signInWithPassword, signOut } = useAuth()

  const [screen, setScreen] = useState('dashboard') // 'dashboard' | 'create-challenge'
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [hasFitnessToken, setHasFitnessToken] = useState(null) // null = unknown

  // Load profile — NEVER run queries inside onAuthStateChange, use useEffect on user
  useEffect(() => {
    if (!user) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    setProfileLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle() // NEVER .single()
      .then(({ data }) => {
        setProfile(data)
        setProfileLoading(false)
      })
      .catch(err => {
        console.error('[App] Error loading profile:', err.message)
        setProfileLoading(false)
      })
  }, [user])

  // Check for fitness token
  useEffect(() => {
    if (!user) {
      setHasFitnessToken(false)
      return
    }
    supabase
      .from('fitness_tokens')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle() // NEVER .single()
      .then(({ data }) => setHasFitnessToken(!!data))
      .catch(() => setHasFitnessToken(false))
  }, [user])

  // Handle Google OAuth callback redirect (?google_connected=true)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_connected') === 'true') {
      setHasFitnessToken(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  // Determine app state
  const loading = authLoading || profileLoading || hasFitnessToken === null

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 15 }}>Loading…</span>
      </div>
    )
  }

  if (!user) {
    return <AuthScreen onSignIn={signInWithMagicLink} onSignInWithPassword={signInWithPassword} />
  }

  const isReviewer = user?.email === 'reviewer@walkorpay.com'

  if (!hasFitnessToken && !isReviewer) {
    return <ConnectFitness />
  }

  if (screen === 'create-challenge') {
    return (
      <CreateChallenge
        welcomeBonusUsed={profile?.welcome_bonus_used ?? false}
        onBack={() => setScreen('dashboard')}
        onSuccess={() => setScreen('dashboard')}
      />
    )
  }

  return (
    <div>
      <nav style={nav.bar}>
        <div style={nav.inner}>
          <span style={nav.logo}>Walk or Pay</span>
          <button
            onClick={signOut}
            style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <Dashboard
        user={user}
        profile={profile}
        onStartChallenge={() => setScreen('create-challenge')}
      />
    </div>
  )
}

const nav = {
  bar: { borderBottom: '1px solid var(--color-border)', padding: '14px 24px', position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 10 },
  inner: { maxWidth: 480, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { fontWeight: 800, fontSize: 17, color: 'var(--color-primary)', letterSpacing: -0.5 },
}
