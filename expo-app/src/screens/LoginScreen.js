import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [usePassword, setUsePassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  async function handleSendLink() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      Alert.alert('Invalid email', 'Please enter a valid email address.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: 'walkorpay://auth/callback',
      },
    })
    setLoading(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setSent(true)
  }

  async function handlePasswordSignIn() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setPasswordError('Please enter a valid email address.')
      return
    }
    if (!password) {
      setPasswordError('Please enter your password.')
      return
    }

    setPasswordError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password })
    setLoading(false)

    if (error) {
      setPasswordError(error.message)
    }
  }

  if (sent) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>📬</Text>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.subtitle}>
          We sent a magic link to{'\n'}
          <Text style={styles.emailText}>{email.trim().toLowerCase()}</Text>
        </Text>
        <TouchableOpacity onPress={() => setSent(false)} style={styles.link}>
          <Text style={styles.linkText}>Use a different email</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.logo}>Walk or Pay</Text>
      <Text style={styles.tagline}>Hit your step goal — or fund a cause you care about.</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          onSubmitEditing={usePassword ? handlePasswordSignIn : handleSendLink}
          returnKeyType={usePassword ? 'next' : 'send'}
        />

        {usePassword ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={(v) => { setPassword(v); setPasswordError('') }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={handlePasswordSignIn}
              returnKeyType="done"
            />
            {passwordError ? (
              <Text style={styles.errorText}>{passwordError}</Text>
            ) : null}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handlePasswordSignIn}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Sign In</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setUsePassword(false); setPasswordError('') }} style={styles.link}>
              <Text style={styles.linkText}>Sign in with magic link instead</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSendLink}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.buttonText}>Send magic link</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setUsePassword(true)} style={styles.link}>
              <Text style={styles.linkText}>Sign in with password instead</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: '#888',
    marginBottom: 48,
    textAlign: 'center',
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  emailText: {
    fontWeight: '600',
    color: '#1a1a1a',
  },
  form: {
    width: '100%',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    marginTop: 4,
    alignItems: 'center',
  },
  linkText: {
    color: '#888',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  errorText: {
    color: '#e53e3e',
    fontSize: 13,
    textAlign: 'center',
  },
})
