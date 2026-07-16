import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// Both values are read from the environment — see .env.example.
//
// There is deliberately no hardcoded fallback. Anything compiled into the app
// ships inside the APK, and an APK is a zip file: whatever is embedded here is
// readable by anyone who installs it. Only the publishable (anon) key belongs
// in a mobile client, and it is safe only because Row Level Security denies it
// everything it is not explicitly granted. A secret or service_role key must
// never appear in this file.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Copy .env.example to .env and set ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
