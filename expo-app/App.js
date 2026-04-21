import { useState, useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import { StripeProvider } from '@stripe/stripe-react-native'
import { supabase } from './src/lib/supabase'
import LoginScreen from './src/screens/LoginScreen'
import DashboardScreen from './src/screens/DashboardScreen'
import CreateChallengeScreen from './src/screens/CreateChallengeScreen'
import OnboardingScreen from './src/screens/OnboardingScreen'
import ProfileScreen from './src/screens/ProfileScreen'

const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [onboardingDone, setOnboardingDone] = useState(null) // null = unknown
  const [screen, setScreen] = useState('dashboard') // 'dashboard' | 'create-challenge' | 'profile'

  useEffect(() => {
    AsyncStorage.getItem('onboarding_complete').then(val => {
      setOnboardingDone(val === 'true')
    })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const handleUrl = async ({ url }) => {
      if (!url) return
      console.log('[App] deep link received:', url)

      const hashPart = url.split('#')[1]
      if (!hashPart) return

      const params = {}
      hashPart.split('&').forEach(pair => {
        const [key, value] = pair.split('=')
        params[key] = decodeURIComponent(value)
      })

      if (params.access_token && params.refresh_token) {
        const { data, error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        })
        console.log('[App] session set:', data?.user?.email, error)
      }
    }

    const subscription = Linking.addEventListener('url', handleUrl)

    Linking.getInitialURL().then(url => {
      if (url) handleUrl({ url })
    })

    return () => subscription.remove()
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  if (loading || onboardingDone === null) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    )
  }

  if (!onboardingDone) {
    return <OnboardingScreen onDone={() => setOnboardingDone(true)} />
  }

  if (!user) {
    return <LoginScreen />
  }

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      {screen === 'create-challenge' ? (
        <CreateChallengeScreen
          onBack={() => setScreen('dashboard')}
          onSuccess={() => setScreen('dashboard')}
        />
      ) : screen === 'profile' ? (
        <ProfileScreen
          user={user}
          onSignOut={handleSignOut}
          onBack={() => setScreen('dashboard')}
        />
      ) : (
        <DashboardScreen
          user={user}
          onSignOut={handleSignOut}
          onStartChallenge={() => setScreen('create-challenge')}
          onProfile={() => setScreen('profile')}
        />
      )}
    </StripeProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
})
