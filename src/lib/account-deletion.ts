'use client';

import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase';
import {
  BibNative,
  clearWidgetData,
  generateRawNonce,
  isAppleSignInCanceled,
  isBibNativeAvailable,
} from '@/lib/native/bib-native';
import { safeLocalStorageKeys, safeLocalStorageRemove } from '@/lib/safe-storage';

/**
 * Client side of in-app account deletion (POST /api/account/delete).
 * See src/lib/server/account-deletion.ts for the server rules.
 */

export type ReauthMethod = 'apple-native' | 'apple-unavailable' | 'password' | 'recent-session';

export type DeleteAccountOutcome =
  | { status: 'deleted'; appleRevoked: boolean }
  | { status: 'canceled' }
  | { status: 'error'; code: string; message: string; retryable: boolean };

function providersOf(user: User | null | undefined): Set<string> {
  const set = new Set<string>();
  for (const identity of user?.identities ?? []) {
    if (identity?.provider) set.add(identity.provider);
  }
  const meta = (user?.app_metadata ?? {}) as { provider?: unknown; providers?: unknown };
  if (typeof meta.provider === 'string') set.add(meta.provider);
  if (Array.isArray(meta.providers)) {
    for (const p of meta.providers) if (typeof p === 'string') set.add(p);
  }
  return set;
}

/** Which re-authentication the server will require for this user (mirrors the server). */
export function getReauthMethod(user: User | null | undefined): ReauthMethod {
  const providers = providersOf(user);
  if (providers.has('apple')) {
    // Sign in with Apple only exists in the iOS app (Capacitor iOS + BibNative plugin).
    return isBibNativeAvailable() ? 'apple-native' : 'apple-unavailable';
  }
  if (providers.has('email')) return 'password';
  return 'recent-session';
}

/** Local data that belongs to the deleted account (sign-out itself clears the Supabase keys). */
function clearLocalAccountData(userId: string) {
  const exactKeys = new Set([
    'cinema-chudu-watchlist',
    'bib_native_push_registered',
    'bib-funnel-session-id',
    'bib-funnel-buffer',
  ]);
  for (const key of safeLocalStorageKeys()) {
    if (exactKeys.has(key) || key.includes(userId)) safeLocalStorageRemove(key);
  }
}

/**
 * Delete the signed-in user's account.
 * - Apple accounts in the iOS app: re-runs Sign in with Apple first for a fresh
 *   identity token + authorization code (server verifies and revokes). Cancel aborts.
 * - Email accounts: `password` is required.
 * - Google accounts: the session must be recent (server returns reauth_required otherwise).
 * On success: clears local data, calls `signOut` (from useAuth) and redirects to /.
 */
export async function deleteMyAccount(options: {
  password?: string;
  signOut: () => Promise<void>;
  redirectTo?: string;
}): Promise<DeleteAccountOutcome> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.access_token || !session.user) {
    return { status: 'error', code: 'not_authenticated', message: 'Please sign in again.', retryable: false };
  }
  const user = session.user;

  const payload: Record<string, string> = { confirm: 'DELETE' };
  const method = getReauthMethod(user);

  if (method === 'apple-unavailable') {
    return {
      status: 'error',
      code: 'apple_reauth_required',
      message:
        'This account uses Sign in with Apple. Open the Binge It Bro iOS app and delete it from your profile, or email support@bingeitbro.com.',
      retryable: false,
    };
  }

  if (method === 'apple-native') {
    const rawNonce = generateRawNonce();
    try {
      const result = await BibNative.signInWithApple({ nonce: rawNonce });
      if (!result?.identityToken || !result.authorizationCode) {
        return {
          status: 'error',
          code: 'apple_reauth_required',
          message: 'Apple did not return a confirmation. Please try again.',
          retryable: true,
        };
      }
      payload.appleIdentityToken = result.identityToken;
      payload.appleAuthorizationCode = result.authorizationCode;
      payload.appleNonce = rawNonce;
    } catch (err) {
      if (isAppleSignInCanceled(err)) return { status: 'canceled' };
      return {
        status: 'error',
        code: 'apple_reauth_failed',
        message: 'Could not confirm with Apple. Please try again.',
        retryable: true,
      };
    }
  }

  if (method === 'password') {
    if (!options.password) {
      return { status: 'error', code: 'password_required', message: 'Enter your password to confirm.', retryable: false };
    }
    payload.password = options.password;
  }

  let res: Response;
  try {
    res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
  } catch {
    return { status: 'error', code: 'network', message: 'Network error. Check your connection and try again.', retryable: true };
  }

  const body = (await res.json().catch(() => null)) as
    | { ok?: boolean; code?: string; message?: string; retryable?: boolean; appleRevoked?: boolean }
    | null;
  if (!res.ok || !body?.ok) {
    return {
      status: 'error',
      code: body?.code || `http_${res.status}`,
      message:
        body?.message ||
        (res.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : 'Account deletion failed. Please try again.'),
      retryable: body?.retryable ?? res.status >= 500,
    };
  }

  // Account is gone on the server: clean up this device.
  clearLocalAccountData(user.id);
  await clearWidgetData().catch(() => undefined);
  try {
    await options.signOut();
  } catch {
    // signOut already does best-effort local cleanup.
  }
  if (typeof window !== 'undefined') {
    window.location.href = options.redirectTo ?? '/?account_deleted=1';
  }
  return { status: 'deleted', appleRevoked: Boolean(body.appleRevoked) };
}
