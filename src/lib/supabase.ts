import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createClient() {
  // Use default cookie-based storage from @supabase/ssr
  // This ensures browser client reads same session that server sets
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
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
