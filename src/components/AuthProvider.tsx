'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { safeLocalStorageGet, safeLocalStorageKeys, safeLocalStorageRemove, safeLocalStorageSet, safeSessionStorageKeys, safeSessionStorageRemove } from '@/lib/safe-storage';
import { getRandomMovieAvatar } from '@/lib/avatar-options';
import { isLikelyInAppBrowser } from '@/lib/browser-detect';
import { hasNativeAuthBridge, postNativeAuthMessage } from '@/lib/native-webview';
import { isNativeApp, signInWithGoogleNative } from '@/lib/native-app';
import { BibNative, generateRawNonce, isAppleSignInCanceled, isBibNativeAvailable } from '@/lib/native/bib-native';
import { trackFunnelEvent } from '@/lib/funnel';
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
  /**
   * Native Sign in with Apple (iOS app only). Resolves { error: null, canceled: true }
   * when the user dismisses the Apple sheet.
   */
  signInWithApple: () => Promise<{ error: Error | null; canceled?: boolean }>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  isConfigured: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const APPLE_PRIVATE_RELAY_DOMAIN = 'privaterelay.appleid.com';

/** `sub` claim of a JWT (unverified decode; only used to key local state). */
function getJwtSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

/** True if this Supabase user is signed in via (or linked to) the given Apple subject. */
function isAppleIdentityFor(user: User, appleSub: string): boolean {
  if (user.identities?.some((identity) => identity.provider === 'apple' && (identity.id === appleSub || identity.identity_data?.sub === appleSub))) {
    return true;
  }
  return user.app_metadata?.provider === 'apple' && user.user_metadata?.sub === appleSub;
}

function slugifyUsernameBase(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 18);
}

/** Display name from Apple's one-time name fields (null if Apple sent none). */
function appleFullName(givenName?: string, familyName?: string): string | null {
  const full = [givenName, familyName].map((part) => (part || '').trim()).filter(Boolean).join(' ');
  return full ? full.slice(0, 80) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();
  const initializedRef = useRef(false);
  const ensuredProfileRef = useRef<string | null>(null);
  // Full name from Apple's first authorization, consumed by ensureUserProfile.
  // Keyed by the Apple subject (`sub` of the identity token) so it can only apply to that
  // Apple identity; cleared after use and on any other auth transition.
  const pendingAppleNameRef = useRef<{ sub: string; name: string } | null>(null);
  const appleSignInInFlightRef = useRef(false);
  const previousUserIdRef = useRef<string | null>(null);
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

    /** Takes the pending Apple name if it belongs to this user's Apple identity; always clears it otherwise. */
    const takePendingAppleName = (authUser: User | null): string | null => {
      const pending = pendingAppleNameRef.current;
      if (!pending) return null;
      if (!authUser || !isAppleIdentityFor(authUser, pending.sub)) {
        pendingAppleNameRef.current = null;
        return null;
      }
      return pending.name;
    };

    const ensureUserProfile = async (authUser: User | null) => {
      // Captured synchronously (before any await) so it matches this auth transition.
      const pendingAppleName = takePendingAppleName(authUser);
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
          if (pendingAppleName) pendingAppleNameRef.current = null;
          return;
        }

        const metadata = authUser.user_metadata || {};
        const email = authUser.email?.toLowerCase();
        if (!email) {
          console.error('Missing email for authenticated user; profile not created.');
          return;
        }

        // Sign in with Apple: the name only arrives on the first authorization (stashed
        // by signInWithApple), and "Hide My Email" yields a random relay address.
        const isAppleRelayEmail = email.endsWith(`@${APPLE_PRIVATE_RELAY_DOMAIN}`);
        const metadataName = (metadata?.full_name || metadata?.name || pendingAppleName || '') as string;
        const emailLocal = email.split('@')[0] || '';

        // Non-Apple-relay emails keep the original username scheme; relay addresses are
        // random strings, so derive from Apple's name instead (kept within [a-z0-9_]{3,24}).
        const baseUsername = isAppleRelayEmail
          ? (() => {
              const fromName = slugifyUsernameBase(metadataName.trim().replace(/\s+/g, '_'));
              return fromName.length >= 3 ? fromName : 'user';
            })()
          : emailLocal.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
        const generatedUsername = `${baseUsername}_${Math.random().toString(36).slice(2, 6)}`;

        const baseInsert = {
          id: authUser.id,
          email,
          name: metadataName || (isAppleRelayEmail ? 'New user' : emailLocal) || 'New user',
          avatar: getRandomMovieAvatar(),
        };

        const { error: insertError } = await supabase
          .from('users')
          .upsert(
            { ...baseInsert, username: generatedUsername },
            { onConflict: 'id', ignoreDuplicates: true }
          );

        if (insertError) {
          console.error('Failed to create user profile with username:', insertError);
          const { error: fallbackError } = await supabase
            .from('users')
            .upsert(baseInsert, { onConflict: 'id', ignoreDuplicates: true });
          if (fallbackError) {
            console.error('Failed to create user profile:', fallbackError);
            return;
          }
        }

        ensuredProfileRef.current = authUser.id;
        if (pendingAppleName) pendingAppleNameRef.current = null;
      } catch (err) {
        console.error('Error ensuring user profile:', err);
      }
    };

    // Set up auth listener FIRST - this ensures we catch the SIGNED_IN event
    // that fires when the page loads after OAuth redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUserId = session?.user?.id ?? null;
      if (nextUserId && previousUserIdRef.current !== nextUserId) {
        trackFunnelEvent('auth_success', { source: 'auth_state_change' });
      }
      previousUserIdRef.current = nextUserId;
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
        const nextUserId = session?.user?.id ?? null;
        if (nextUserId && previousUserIdRef.current !== nextUserId) {
          trackFunnelEvent('auth_success', { source: 'initial_session' });
        }
        previousUserIdRef.current = nextUserId;
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
    if (hasNativeAuthBridge()) {
      postNativeAuthMessage('BIB_AUTH_GOOGLE_SIGN_IN');
      return { error: null };
    }
    if (isNativeApp()) {
      // Capacitor app: run OAuth in the system browser; NativeAppBridge
      // exchanges the code when the app deep link comes back.
      const nativeSupabase = createClient();
      try {
        await nativeSupabase.auth.signOut();
      } catch {
        // Ignore signout errors
      }
      return signInWithGoogleNative(nativeSupabase);
    }
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

  const signInWithApple = async (): Promise<{ error: Error | null; canceled?: boolean }> => {
    if (!isConfigured) return { error: new Error('Supabase not configured') };
    if (!isBibNativeAvailable()) {
      return { error: new Error('Sign in with Apple is only available in the iOS app.') };
    }
    if (appleSignInInFlightRef.current) {
      return { error: new Error('Sign in with Apple is already in progress.') };
    }
    appleSignInInFlightRef.current = true;

    try {
      // Raw nonce goes to Supabase; the plugin sends SHA-256(rawNonce) to Apple.
      const rawNonce = generateRawNonce();
      let result;
      try {
        result = await BibNative.signInWithApple({ nonce: rawNonce });
      } catch (err) {
        if (isAppleSignInCanceled(err)) return { error: null, canceled: true };
        return { error: err instanceof Error ? err : new Error('Sign in with Apple failed.') };
      }
      if (!result?.identityToken) return { error: new Error('Apple did not return an identity token.') };

      const fullName = appleFullName(result.givenName, result.familyName);
      const appleSub = getJwtSubject(result.identityToken);
      pendingAppleNameRef.current = fullName && appleSub ? { sub: appleSub, name: fullName } : null;

      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: result.identityToken,
        nonce: rawNonce,
      });
      if (error) {
        pendingAppleNameRef.current = null;
        return { error };
      }

      const signedInUser = data?.user ?? null;
      if (fullName && signedInUser) {
        // Apple sends the name only once: keep it in auth metadata and fill the
        // profile name only if it is empty or still the auto-generated placeholder.
        try {
          if (!signedInUser.user_metadata?.full_name) {
            await supabase.auth.updateUser({
              data: { full_name: fullName, given_name: result.givenName ?? null, family_name: result.familyName ?? null },
            });
          }
        } catch {
          // Non-fatal.
        }
        try {
          const { data: profile } = await supabase
            .from('users')
            .select('name,email')
            .eq('id', signedInUser.id)
            .maybeSingle();
          const currentName = String((profile as { name?: string | null } | null)?.name ?? '').trim();
          const profileEmail = String((profile as { email?: string | null } | null)?.email ?? signedInUser.email ?? '').toLowerCase();
          const placeholderNames = new Set(['', 'new user', profileEmail.split('@')[0] || '']);
          if (profile && placeholderNames.has(currentName.toLowerCase())) {
            await supabase.from('users').update({ name: fullName }).eq('id', signedInUser.id);
          }
        } catch {
          // Non-fatal: the profile may be created a moment later by ensureUserProfile with this name.
        }
      }
      return { error: null };
    } finally {
      // ensureUserProfile captures the name synchronously during the SIGNED_IN event,
      // so nothing needs it after this point.
      pendingAppleNameRef.current = null;
      appleSignInInFlightRef.current = false;
    }
  };

  const signOut = async () => {
    if (typeof window === 'undefined') return;

    if (isConfigured) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Supabase signOut error (continuing local cleanup):', err);
      }
    }

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

    // 4. Clear React state after remote sign-out + local storage cleanup.
    pendingAppleNameRef.current = null;
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signInWithApple,
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
