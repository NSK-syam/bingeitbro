import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createClient,
  type Session,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { getRuntimeConfig, isSupabaseConfigured } from './config';

export type MobileSession = Session;
export type MobileUser = User;

let client: SupabaseClient | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

function syncAutoRefresh(nextAppState: AppStateStatus) {
  if (!client) {
    return;
  }

  if (nextAppState === 'active') {
    client.auth.startAutoRefresh();
    return;
  }

  client.auth.stopAutoRefresh();
}

function ensureAutoRefreshLifecycle() {
  if (appStateSubscription) {
    return;
  }

  syncAutoRefresh(AppState.currentState);
  appStateSubscription = AppState.addEventListener('change', syncAutoRefresh);
}

export function getSupabaseClient(): SupabaseClient {
  if (client) {
    return client;
  }

  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured for the mobile app.');
  }

  const { supabaseUrl, supabasePublishableKey } = getRuntimeConfig();
  client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      lock: async <T>(
        _name: string,
        _timeout: number,
        callback: () => Promise<T>,
      ): Promise<T> => callback(),
    },
  });

  ensureAutoRefreshLifecycle();
  return client;
}
