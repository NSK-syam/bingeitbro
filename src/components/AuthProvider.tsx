'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string, username: string, phone: string) => Promise<{ error: Error | null; needsPhoneVerification?: boolean }>;
  sendPhoneOtp: (phone: string) => Promise<{ error: Error | null }>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<{ error: Error | null }>;
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
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [isConfigured]);

  const signIn = async (email: string, password: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Ensure user profile exists
    if (!error && data.user) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', data.user.id)
        .single();

      if (!existingUser) {
        // Create user profile if it doesn't exist
        await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email || email,
          name: data.user.user_metadata?.name || email.split('@')[0],
          username: data.user.user_metadata?.username || email.split('@')[0],
          avatar: getRandomEmoji()
        });
      }
    }

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

    return !data; // Available if no user found
  };

  const signUp = async (email: string, password: string, name: string, username: string, phone: string) => {
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

    // Get the current site URL for redirect
    const siteUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://bingeitbro.com';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      phone,
      options: {
        data: { name, username: username.toLowerCase(), phone },
        emailRedirectTo: `${siteUrl}/auth/callback`
      }
    });

    if (!error && data.user) {
      // Create user profile
      await supabase.from('users').insert({
        id: data.user.id,
        email: email.toLowerCase(),
        name: name,
        username: username.toLowerCase(),
        phone: phone,
        avatar: getRandomEmoji()
      });

      // Send phone OTP for verification
      return { error: null, needsPhoneVerification: true };
    }

    return { error };
  };

  const sendPhoneOtp = async (phone: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
    });

    return { error };
  };

  const verifyPhoneOtp = async (phone: string, token: string) => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    });

    return { error };
  };

  const signOut = async () => {
    if (!isConfigured) return;
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signIn,
      signUp,
      sendPhoneOtp,
      verifyPhoneOtp,
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
