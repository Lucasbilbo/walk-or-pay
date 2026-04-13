import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

const supabaseUrl = 'https://zbqwosnlunkhrcuxwmop.supabase.co'
const supabaseAnonKey = 'sb_publishable_buyW9tZ7nkRBrYc94SVVnQ_Vt8Kij1W'
console.log('[supabase] initializing with URL:', supabaseUrl)

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

export const SHORTCUT_LOG_URL = 'https://walk-or-pay.netlify.app/.netlify/functions/shortcut-log-steps'
