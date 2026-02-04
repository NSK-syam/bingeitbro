'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, username: string) => Promise<{ error: Error | null }>;
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

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // Create user profile for OAuth users if it doesn't exist
      if (session?.user && _event === 'SIGNED_IN') {
        try {
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('id', session.user.id)
            .single();

          if (!existingUser) {
            const metadata = session.user.user_metadata;
            const generatedUsername = session.user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9_]/g, '') + '_' + Math.random().toString(36).slice(2, 6);

            const { error: insertError } = await supabase.from('users').insert({
              id: session.user.id,
              email: session.user.email,
              name: metadata?.full_name || metadata?.name || session.user.email?.split('@')[0],
              username: generatedUsername,
              avatar: getRandomEmoji()
            });

            if (insertError) {
              console.error('Failed to create user profile:', insertError);
              // Try without username in case column doesn't exist
              await supabase.from('users').insert({
                id: session.user.id,
                email: session.user.email,
                name: metadata?.full_name || metadata?.name || session.user.email?.split('@')[0],
                avatar: getRandomEmoji()
              });
            }
          }
        } catch (err) {
          console.error('Error in auth state change:', err);
        }
      }
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
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', username.toLowerCase())
      .single();

    return !data;
  };

  const signUp = async (email: string, password: string, name: string, username: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();

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
      .single();

    if (existingEmail) {
      return { error: new Error('An account with this email already exists') };
    }

    const siteUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://bingeitbro.com';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, username: username.toLowerCase() },
        emailRedirectTo: `${siteUrl}/auth/callback`
      }
    });

    if (!error && data.user) {
      await supabase.from('users').insert({
        id: data.user.id,
        email: email.toLowerCase(),
        name: name,
        username: username.toLowerCase(),
        avatar: getRandomEmoji()
      });
    }

    return { error };
  };

  const signInWithGoogle = async () => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();
    const siteUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://bingeitbro.com';

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${siteUrl}/auth/callback`,
      },
    });

    return { error };
  };

  const signOut = async () => {
    if (!isConfigured) return;
    try {
      const supabase = createClient();
      // Sign out from all sessions
      await supabase.auth.signOut({ scope: 'global' });

      // Clear local state
      setUser(null);
      setSession(null);

      // Clear all Supabase-related items from localStorage
      if (typeof window !== 'undefined') {
        const keysToRemove = Object.keys(localStorage).filter(key =>
          key.startsWith('sb-') || key.includes('supabase')
        );
        keysToRemove.forEach(key => localStorage.removeItem(key));
      }
    } catch (err) {
      console.error('Sign out failed:', err);
      // Even if signOut fails, clear local state and storage
      setUser(null);
      setSession(null);
      if (typeof window !== 'undefined') {
        const keysToRemove = Object.keys(localStorage).filter(key =>
          key.startsWith('sb-') || key.includes('supabase')
        );
        keysToRemove.forEach(key => localStorage.removeItem(key));
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

function getRandomEmoji(): string {
  const emojis = ['🎬', '🍿', '🎭', '🎪', '🎯', '🎲', '🎸', '🎺', '🎻', '🎹', '🎤', '🎧', '🎵', '🎶', '🌟', '⭐', '🔥', '💫', '✨', '🎉'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}
