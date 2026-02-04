import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Custom storage that uses sessionStorage - session expires when browser/tab is closed
const sessionOnlyStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(key);
  },
};

export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: sessionOnlyStorage,
      persistSession: true,
      storageKey: 'cinema-chudu-auth',
    },
  });
}

// Database types
export interface DBUser {
  id: string;
  email: string;
  name: string;
  username: string;
  avatar: string;
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
