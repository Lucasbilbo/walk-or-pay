import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = 'https://YOUR_SUPABASE_URL.supabase.co'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

const ExpoSecureStoreAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    storageKey: 'walkOrPay-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export const SHORTCUT_LOG_URL = 'https://YOUR_NETLIFY_SITE.netlify.app/.netlify/functions/shortcut-log-steps'
