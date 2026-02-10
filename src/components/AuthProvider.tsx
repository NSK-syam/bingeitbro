'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { getRandomMovieAvatar } from '@/lib/avatar-options';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, username: string) => Promise<{ error: Error | null }>;
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>;
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
        void ensureUserProfile(session?.user ?? null);
      }
    }).catch(() => {
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [isConfigured]);

  const signIn = async (email: string, password: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const checkUsernameAvailable = async (username: string): Promise<boolean> => {
    if (!isConfigured) return false;

    const supabase = createClient();
    const normalized = username.trim().toLowerCase();
    if (!normalized) return false;

    const { data, error } = await supabase
      .from('users')
      .select('id')
      .ilike('username', normalized)
      .limit(1);

    if (error) return false;

    return !data || data.length === 0;
  };

  const signUp = async (email: string, password: string, name: string, username: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();
    const withTimeout = async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const timeout = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), ms);
      });
      try {
        return await Promise.race([promise, timeout]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    // Check if username is available
    const isAvailable = await checkUsernameAvailable(username);
    if (!isAvailable) {
      return { error: new Error('Username is already taken') };
    }

    // Check if email already exists
    const { data: existingEmail } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingEmail) {
      return { error: new Error('An account with this email already exists') };
    }

    const siteUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://bingeitbro.com';

    let data: { user: User | null } | null = null;
    let error: Error | null = null;
    try {
      const authResult = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name, username: username.toLowerCase() },
            emailRedirectTo: `${siteUrl}/auth/callback`
          }
        }),
        12000,
        'Signup timed out. Please try again.'
      );
      data = authResult.data as { user: User | null };
      error = authResult.error as Error | null;
    } catch (err) {
      error = err as Error;
    }

    if (!error && data?.user) {
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        return { error: new Error('An account with this email already exists. Try logging in.') };
      }
      // Fire-and-forget profile insert to avoid blocking the UI
      void withTimeout(
        Promise.resolve(
          supabase.from('users').insert({
            id: data.user.id,
            email: email.toLowerCase(),
            name: name,
            username: username.toLowerCase(),
            avatar: getRandomMovieAvatar()
          })
        ),
        8000,
        'Profile creation timed out'
      ).catch(() => {
        // Ignore errors here; auth succeeded and profile can be created later.
      });
    }

    return { error };
  };

  const resendConfirmation = async (email: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };
    const supabase = createClient();
    const siteUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://bingeitbro.com';

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    return { error };
  };

  const signInWithGoogle = async () => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

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
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key);
      }
    });

    // 3. Clear sessionStorage (backup for legacy)
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase') || key === 'cinema-chudu-auth') {
        sessionStorage.removeItem(key);
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
      resendConfirmation,
      signInWithGoogle,
      checkUsernameAvailable,
      signOut,
      isConfigured
    }}>
      {children}
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
