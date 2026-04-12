// @ts-nocheck
const React = require('react');
const WebBrowser = require('expo-web-browser');
const { makeRedirectUri } = require('expo-auth-session');
const {
  captureAppleProviderCredential,
  formatAppleFullName,
  isAppleSignInAvailable,
  signInWithAppleAsync,
} = require('../lib/apple-auth');
const { getRuntimeConfig, isSupabaseConfigured } = require('../lib/config');
const { httpRequest } = require('../lib/http');
const { getSupabaseClient } = require('../lib/supabase');

const { useEffect, useMemo, useState } = React;

const notMountedError = () => new Error('AuthProvider is not mounted.');

const AUTH_CONTEXT_DEFAULTS = {
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({ error: notMountedError() }),
  signUp: async () => ({ error: notMountedError() }),
  signOut: async () => ({ error: notMountedError() }),
  signInWithApple: async () => ({ error: notMountedError() }),
  signInWithGoogle: async () => ({ error: notMountedError() }),
  deleteAccount: async () => ({ error: notMountedError() }),
};

const AuthContext = React.createContext(undefined);

WebBrowser.maybeCompleteAuthSession();

function toError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage);
}

function getOAuthRedirectUrl() {
  const { appScheme } = getRuntimeConfig();

  return makeRedirectUri({
    scheme: appScheme,
    path: 'auth/callback',
  });
}

function getGoogleMobileRedirectUrl() {
  const { siteUrl } = getRuntimeConfig();
  const callbackUrl = new URL('/auth/callback', siteUrl);
  callbackUrl.searchParams.set('native_app', '1');
  return callbackUrl.toString();
}

function parseAuthCallback(url) {
  if (!url) {
    return {};
  }

  const normalized = url.replace('#', '?');
  const parsedUrl = new URL(normalized);

  return {
    accessToken: parsedUrl.searchParams.get('access_token'),
    code: parsedUrl.searchParams.get('code'),
    refreshToken: parsedUrl.searchParams.get('refresh_token'),
  };
}

async function exchangeOAuthResult(supabase, provider, queryParams) {
  if (queryParams.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(queryParams.code);
    if (error) {
      throw error;
    }

    return;
  }

  if (queryParams.accessToken && queryParams.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: queryParams.accessToken,
      refresh_token: queryParams.refreshToken,
    });
    if (error) {
      throw error;
    }

    return;
  }

  throw new Error(`${provider} sign-in did not return a usable session.`);
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return undefined;
    }

    const supabase = getSupabaseClient();
    let mounted = true;

    const applySession = (nextSession) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession ?? null);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    };

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
    });

    supabase.auth
      .getSession()
      .then(({ data: sessionData }) => {
        applySession(sessionData.session);
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [configured]);

  const actions = useMemo(() => {
    const signIn = async ({ email, password }) => {
      if (!configured) {
        return { error: new Error('Supabase is not configured for the mobile app.') };
      }

      try {
        const supabase = getSupabaseClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ?? null };
      } catch (error) {
        return { error: toError(error, 'Unable to sign in.') };
      }
    };

    const signUp = async ({
      birthdate = null,
      captchaToken = null,
      email,
      name,
      password,
      username,
    }) => {
      if (!configured) {
        return { error: new Error('Supabase is not configured for the mobile app.') };
      }

      try {
        const payload = await httpRequest('/api/signup', {
          method: 'POST',
          body: {
            email,
            password,
            name,
            username,
            birthdate,
            captchaToken,
          },
        });

        if (payload?.needsEmailConfirmation) {
          return {
            error: null,
            needsEmailConfirmation: true,
          };
        }

        const supabase = getSupabaseClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error ?? null, needsEmailConfirmation: false };
      } catch (error) {
        return {
          error: toError(error, 'Unable to sign up.'),
          needsEmailConfirmation: false,
        };
      }
    };

    const signOut = async () => {
      if (!configured) {
        return { error: null };
      }

      try {
        const supabase = getSupabaseClient();
        const { error } = await supabase.auth.signOut();
        return { error: error ?? null };
      } catch (error) {
        return { error: toError(error, 'Unable to sign out.') };
      }
    };

    const signInWithApple = async () => {
      if (!configured) {
        return { error: new Error('Supabase is not configured for the mobile app.') };
      }

      try {
        const supported = await isAppleSignInAvailable();
        if (!supported) {
          return { error: new Error('Apple sign-in is unavailable on this device.') };
        }

        const credential = await signInWithAppleAsync();
        const supabase = getSupabaseClient();
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
          nonce: credential.nonce,
        });

        if (error) {
          return { error };
        }

        const fullName = formatAppleFullName(credential.fullName);
        if (fullName) {
          await supabase.auth.updateUser({
            data: {
              full_name: fullName,
              given_name: credential.fullName?.givenName ?? null,
              family_name: credential.fullName?.familyName ?? null,
            },
          });
        }

        const {
          data: { session: refreshedSession },
        } = await supabase.auth.getSession();

        if (refreshedSession?.access_token) {
          try {
            await captureAppleProviderCredential(refreshedSession.access_token);
          } catch {
            // Best effort only. A metadata capture outage must not turn an
            // already-established Apple session into a failed sign-in.
          }
        }

        return { error: null };
      } catch (error) {
        return { error: toError(error, 'Unable to sign in with Apple.') };
      }
    };

    const signInWithGoogle = async () => {
      if (!configured) {
        return { error: new Error('Supabase is not configured for the mobile app.') };
      }

      try {
        const returnUrl = getOAuthRedirectUrl();
        const redirectTo = getGoogleMobileRedirectUrl();
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        });

        if (error) {
          return { error };
        }

        if (!data?.url) {
          return { error: new Error('Google sign-in did not provide an auth URL.') };
        }

        const result = await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
        if (result.type !== 'success') {
          return { error: new Error('Google sign-in was cancelled.') };
        }

        await exchangeOAuthResult(supabase, 'Google', parseAuthCallback(result.url));
        return { error: null };
      } catch (error) {
        return { error: toError(error, 'Unable to sign in with Google.') };
      }
    };

    const deleteAccount = async () => {
      if (!configured) {
        return { error: new Error('Supabase is not configured for the mobile app.') };
      }

      try {
        const supabase = getSupabaseClient();
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();

        const accessToken = currentSession?.access_token;
        if (!accessToken) {
          return { error: new Error('You must be signed in to delete your account.') };
        }

        await httpRequest('/api/account/delete', {
          method: 'POST',
          accessToken,
        });

        await supabase.auth.signOut();
        return { error: null };
      } catch (error) {
        return { error: toError(error, 'Unable to delete your account.') };
      }
    };

    return {
      signIn,
      signUp,
      signOut,
      signInWithApple,
      signInWithGoogle,
      deleteAccount,
    };
  }, [configured]);

  const value = useMemo(
    () => ({
      ...AUTH_CONTEXT_DEFAULTS,
      ...actions,
      session,
      user,
      loading,
    }),
    [actions, loading, session, user],
  );

  return React.createElement(AuthContext.Provider, { value }, children);
}

exports.AuthProvider = AuthProvider;
exports.AuthContext = AuthContext;
