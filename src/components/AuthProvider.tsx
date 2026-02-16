'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { safeLocalStorageGet, safeLocalStorageKeys, safeLocalStorageRemove, safeLocalStorageSet, safeSessionStorageKeys, safeSessionStorageRemove } from '@/lib/safe-storage';
import { getRandomMovieAvatar } from '@/lib/avatar-options';
import { isLikelyInAppBrowser } from '@/lib/browser-detect';
import { BirthdayPopup } from './BirthdayPopup';
import { BalloonRain } from './BalloonRain';
import { WatchReminderCenter } from './WatchReminderCenter';
import { FriendRecommendationReminderCenter } from './FriendRecommendationReminderCenter';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
    username: string,
    birthdate: string | null,
    captchaToken?: string,
  ) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();
  const initializedRef = useRef(false);
  const ensuredProfileRef = useRef<string | null>(null);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [birthdayName, setBirthdayName] = useState('');
  const [birthdayToday, setBirthdayToday] = useState(false);
  // Confetti removed by request; keep balloons + popup only.

  const resetBirthdayState = () => {
    setBirthdayToday(false);
    setBirthdayOpen(false);
    setBirthdayName('');
  };

  useEffect(() => {
    if (!isConfigured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const ensureUserProfile = async (authUser: User | null) => {
      if (!authUser) return;
      if (ensuredProfileRef.current === authUser.id) return;

      try {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id', authUser.id)
          .maybeSingle();

        if (existingUser) {
          ensuredProfileRef.current = authUser.id;
          return;
        }

        const metadata = authUser.user_metadata || {};
        const email = authUser.email?.toLowerCase();
        if (!email) {
          console.error('Missing email for authenticated user; profile not created.');
          return;
        }

        const baseUsername = email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
        const generatedUsername = `${baseUsername}_${Math.random().toString(36).slice(2, 6)}`;

        const baseInsert = {
          id: authUser.id,
          email,
          name: metadata?.full_name || metadata?.name || email.split('@')[0] || 'New user',
          avatar: getRandomMovieAvatar(),
        };

        const { error: insertError } = await supabase
          .from('users')
          .insert({ ...baseInsert, username: generatedUsername });

        if (insertError) {
          console.error('Failed to create user profile with username:', insertError);
          const { error: fallbackError } = await supabase
            .from('users')
            .insert(baseInsert);
          if (fallbackError) {
            console.error('Failed to create user profile:', fallbackError);
            return;
          }
        }

        ensuredProfileRef.current = authUser.id;
      } catch (err) {
        console.error('Error ensuring user profile:', err);
      }
    };

    // Set up auth listener FIRST - this ensures we catch the SIGNED_IN event
    // that fires when the page loads after OAuth redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      initializedRef.current = true;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (!session?.user) resetBirthdayState();

      // Ensure user profile exists for OAuth users (SIGNED_IN) and initial sessions after redirect
      void ensureUserProfile(session?.user ?? null);
    });

    // Get initial session AFTER setting up the listener
    // This ensures we don't miss any auth events
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Only update if onAuthStateChange hasn't already initialized
      if (!initializedRef.current) {
        initializedRef.current = true;
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (!session?.user) resetBirthdayState();
        void ensureUserProfile(session?.user ?? null);
      }
    }).catch(() => {
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isConfigured]);

  useEffect(() => {
    if (!isConfigured || !user?.id) return;
    let cancelled = false;
    const supabase = createClient();

    const isBirthday = (birthdate: string | null | undefined) => {
      if (!birthdate) return false;
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate);
      if (!match) return false;
      const month = Number(match[2]);
      const day = Number(match[3]);
      const now = new Date();
      if (now.getMonth() + 1 !== month) return false;
      if (now.getDate() !== day) return false;
      return true;
    };

    const openPopupOnce = () => {
      if (typeof window === 'undefined') return;
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const key = `bib-bday-popup:${user.id}:${y}-${m}-${d}`;
      if (safeLocalStorageGet(key)) return;
      safeLocalStorageSet(key, '1');
      setBirthdayOpen(true);
    };

    void (async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('username,name,birthdate')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;
        const display = (data?.username || data?.name || user.user_metadata?.name || user.email?.split('@')[0] || 'there') as string;
        setBirthdayName(display);
        const bday = isBirthday((data as { birthdate?: string | null } | null)?.birthdate);
        setBirthdayToday(bday);
        if (bday) {
          openPopupOnce();
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConfigured, user?.id, user?.email, user?.user_metadata?.name]);

  const signIn = async (email: string, password: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const checkUsernameAvailable = async (username: string): Promise<boolean> => {
    if (!isConfigured) return false;

    const normalized = username.trim().toLowerCase();
    if (!normalized) return false;

    try {
      const resp = await fetch(`/api/username-available?username=${encodeURIComponent(normalized)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      const payload = (await resp.json().catch(() => ({}))) as { available?: unknown };
      if (typeof payload.available === 'boolean') return payload.available;
      // Don't block signup because of an availability check issue.
      return true;
    } catch {
      return true;
    }
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    username: string,
    birthdate: string | null,
    captchaToken?: string,
  ) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    try {
      const resp = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name,
          username: username.toLowerCase(),
          birthdate: birthdate || null,
          captchaToken: captchaToken || null,
        }),
      });
      const payload = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; needsEmailConfirmation?: boolean };
      if (!resp.ok || !payload?.ok) {
        return { error: new Error(payload?.error || payload?.message || 'Signup failed.') };
      }
      if (payload.needsEmailConfirmation) {
        return {
          error: new Error(
            'Account created. Please verify your email, then sign in.',
          ),
        };
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) return { error: signInError as unknown as Error };
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Signup failed.';
      return { error: new Error(message) };
    }

  };

  const signInWithGoogle = async () => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };
    if (typeof window !== 'undefined' && isLikelyInAppBrowser(window.navigator.userAgent || '')) {
      return {
        error: new Error(
          'Google sign-in is blocked in in-app browsers. Open Binge it bro in Safari or Chrome, then try Google sign-in again.',
        ),
      };
    }

    const supabase = createClient();
    const siteUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://bingeitbro.com';

    // Clear any existing session first to ensure fresh login
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore signout errors
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
        queryParams: {
          prompt: 'select_account',  // Force Google to show account picker
          access_type: 'offline',
        },
      },
    });

    return { error };
  };

  const signOut = async () => {
    // Clear React state first
    setUser(null);
    setSession(null);

    if (typeof window === 'undefined') return;

    // 1. Delete all Supabase cookies (this is where @supabase/ssr stores the session)
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (name.startsWith('sb-') || name.includes('supabase')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${window.location.hostname}`;
      }
    });

    // 2. Clear localStorage (backup)
    safeLocalStorageKeys().forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        safeLocalStorageRemove(key);
      }
    });

    // 3. Clear sessionStorage (backup for legacy)
    safeSessionStorageKeys().forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase') || key === 'cinema-chudu-auth') {
        safeSessionStorageRemove(key);
      }
    });

    // 4. Call Supabase signOut (may fail but cookies already cleared)
    if (isConfigured) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Supabase signOut error (ignored):', err);
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      checkUsernameAvailable,
      signOut,
      isConfigured
    }}>
      {children}
      <WatchReminderCenter />
      <FriendRecommendationReminderCenter />
      <BalloonRain isOn={birthdayToday} />
      <BirthdayPopup
        isOpen={birthdayOpen}
        onClose={() => setBirthdayOpen(false)}
        username={birthdayName}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
