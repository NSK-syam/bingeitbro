import { createClient as _createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

// Singleton — reuse across the app like @supabase/ssr does
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any, any, any> | null = null;

// Using @supabase/supabase-js directly instead of @supabase/ssr to avoid
// navigator.locks deadlock in this static SPA (output: "export").
// The @supabase/ssr createBrowserClient uses navigator.locks internally
// which deadlocks when AuthProvider and components share the singleton.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): SupabaseClient<any, any, any> {
  if (!client) {
    client = _createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // Disable navigator.locks to prevent AbortError deadlocks
        // when AuthProvider and other components share this singleton
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
          return await fn();
        },
      },
    });
  }
  return client;
}

// Database types
export interface DBUser {
  id: string;
  email: string;
  name: string;
  username: string;
  avatar: string;
  theme?: string | null;
  created_at: string;
}

export interface DBRecommendation {
  id: string;
  user_id: string;
  title: string;
  original_title?: string;
  year: number;
  type: 'movie' | 'series' | 'documentary' | 'anime';
  poster: string;
  backdrop?: string;
  genres: string[];
  language: string;
  duration?: string;
  rating?: number;
  personal_note: string;
  mood?: string[];
  watch_with?: string;
  ott_links: { platform: string; url: string; availableIn?: string }[];
  tmdb_id?: number;
  created_at: string;
  updated_at: string;
  // Joined data
  user?: DBUser;
}

// Check if Supabase is configured
export function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey);
}
