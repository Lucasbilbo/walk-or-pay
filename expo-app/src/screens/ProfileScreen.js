import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'

const API_BASE = 'https://walk-or-pay.netlify.app/.netlify/functions'

export default function ProfileScreen({ user, onSignOut, onBack }) {
  const [deleting, setDeleting] = useState(false)

  function confirmDelete() {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all your data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ]
    )
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        Alert.alert('Error', 'Not authenticated. Please sign in again.')
        return
      }

      const res = await fetch(`${API_BASE}/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      const data = await res.json()
      if (!res.ok) {
        Alert.alert('Error', data.error || 'Failed to delete account')
        return
      }

      await supabase.auth.signOut()
      onSignOut()
    } catch (err) {
      Alert.alert('Error', err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.signOutButton} onPress={onSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.deleteButton, deleting && styles.buttonDisabled]}
          onPress={confirmDelete}
          disabled={deleting}
        >
          {deleting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.deleteText}>Delete Account</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  back: { fontSize: 15, color: '#888' },
  title: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  placeholder: { width: 40 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 24,
  },
  label: { fontSize: 12, color: '#aaa', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  email: { fontSize: 16, color: '#1a1a1a', fontWeight: '500' },
  actions: { gap: 12 },
  signOutButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  deleteButton: {
    backgroundColor: '#d9534f',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  deleteText: { fontSize: 16, fontWeight: '600', color: '#fff' },
})
