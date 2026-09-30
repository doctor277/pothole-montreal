import 'expo-sqlite/localStorage/install';
import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from '@/src/lib/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and set only the public Supabase project values.',
  );
}

if (__DEV__) {
  // Deliberately confirm only that Expo supplied the required public values.
  // Never print either value: they are embedded into an Expo build but should
  // still not be copied into terminal logs.
  console.info('[Pothole MTL][Supabase client] public configuration loaded', {
    hasUrl: true,
    hasPublishableKey: true,
  });
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the persisted anonymous session refreshed while the app is active, and
// stop refresh work in the background. This is the standard React Native
// Supabase lifecycle pattern; it never creates a user or signs one out.
supabase.auth.startAutoRefresh();

AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
