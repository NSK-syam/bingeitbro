import { Capacitor } from '@capacitor/core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Custom-scheme deep link the native (Capacitor) app registers. Supabase
 * redirects here after Google OAuth completes in the system browser, and
 * NativeAppBridge exchanges the PKCE code inside the app webview.
 * Must also be listed in Supabase Auth -> URL Configuration -> Redirect URLs.
 */
export const NATIVE_AUTH_CALLBACK_URL = 'com.bingeitbro.app://auth/callback';

/** True only inside the Capacitor iOS/Android shell. Always false on the server and on the web. */
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Google sign-in for the native app. Google blocks OAuth inside embedded
 * webviews (disallowed_useragent), so open the provider URL in the system
 * browser (SFSafariViewController / Chrome Custom Tabs). The PKCE code verifier
 * is stored in this webview's storage by signInWithOAuth, so the code exchange
 * must happen back in this webview (see NativeAppBridge).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signInWithGoogleNative(supabase: SupabaseClient<any, any, any>): Promise<{ error: Error | null }> {
  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: NATIVE_AUTH_CALLBACK_URL,
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
          access_type: 'offline',
        },
      },
    });
    if (error) return { error };
    if (!data?.url) return { error: new Error('Unable to start Google sign-in.') };

    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.url, presentationStyle: 'popover' });
    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error('Unable to start Google sign-in.') };
  }
}
