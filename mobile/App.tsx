import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { createClient as createSupabaseClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewMessageEvent } from 'react-native-webview/lib/WebViewTypes';

const DEFAULT_SITE_URL = 'https://bingeitbro.com';
const ALLOWED_HOSTS = new Set(['bingeitbro.com', 'www.bingeitbro.com']);
const AUTH_BRIDGE_PATH = '/auth/native';
const NATIVE_PLATFORM = Platform.OS === 'ios' ? 'ios' : 'android';
const WEBVIEW_BOOTSTRAP_SCRIPT = `(function() {
  try {
    var meta = document.querySelector('meta[name=\"viewport\"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no';
      document.head.appendChild(meta);
    } else {
      var content = meta.getAttribute('content') || '';
      var parts = content.split(',').map(function(p) { return p.trim(); }).filter(Boolean);
      parts = parts.filter(function(p) {
        return p.indexOf('maximum-scale') !== 0 && p.indexOf('minimum-scale') !== 0 && p.indexOf('user-scalable') !== 0;
      });
      parts.push('maximum-scale=1');
      parts.push('minimum-scale=1');
      parts.push('user-scalable=no');
      meta.setAttribute('content', parts.join(', '));
    }
  } catch (e) {
    // best-effort; ignore viewport errors
  }
  window.__BIB_NATIVE_PLATFORM = ${JSON.stringify(NATIVE_PLATFORM)};
  window.__BIB_NATIVE_SHELL = true;
  window.__BIB_NATIVE_EXTERNAL_OPEN = true;
  window.dispatchEvent(new Event('bib-native-shell'));
}()); true;`;
const NATIVE_PUSH_TOKEN_STORAGE_KEY = 'bib-native-expo-push-token';
const NATIVE_PUSH_AUTO_PROMPT_KEY_PREFIX = 'bib-native-push-auto-prompted';

let mobileSupabaseClient: SupabaseClient | null = null;

function getMobileSupabaseClient(supabaseUrl: string, supabaseAnonKey: string): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!mobileSupabaseClient) {
    mobileSupabaseClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storage: {
          getItem: async (key) => (await AsyncStorage.getItem(key)) ?? null,
          setItem: async (key, value) => {
            await AsyncStorage.setItem(key, value);
          },
          removeItem: async (key) => {
            await AsyncStorage.removeItem(key);
          },
        },
      },
    });
  }
  return mobileSupabaseClient;
}

WebBrowser.maybeCompleteAuthSession();
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type NativePushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

type NativePushContext = {
  userId: string;
  accessToken: string;
};

type NativePushStatus = {
  enabled: boolean;
  permission: NativePushPermission;
  message?: string;
  platform: 'ios' | 'android';
};

type NativeBridgePayload = {
  type?: string;
  appUrl?: string;
  browserUrl?: string;
  userId?: string;
  accessToken?: string;
};

async function readApiErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const text = (await response.text().catch(() => '')).trim();
  if (!text) return fallbackMessage;

  try {
    const payload = JSON.parse(text) as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {
    // Fall through to the raw response body.
  }

  return text;
}

function isAllowedInAppUrl(rawUrl: string): boolean {
  if (rawUrl === 'about:blank') return true;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function getProviderLaunchTarget(rawUrl: string): { appUrl?: string; browserUrl?: string } | null {
  try {
    const parsed = new URL(rawUrl);
    if (!ALLOWED_HOSTS.has(parsed.hostname) || parsed.pathname !== '/open/provider') {
      return null;
    }

    const browserUrl = parsed.searchParams.get('web')?.trim() || '';
    const appUrl = parsed.searchParams.get('app')?.trim() || browserUrl;
    if (!browserUrl && !appUrl) return null;

    return {
      appUrl: appUrl || undefined,
      browserUrl: browserUrl || undefined,
    };
  } catch {
    return null;
  }
}

function getNativePushPermission(settings: Notifications.NotificationPermissionsStatus): NativePushPermission {
  if (settings.granted) return 'granted';
  if (!settings.canAskAgain) return 'denied';
  return 'default';
}

function getNativePushAutoPromptKey(userId: string): string {
  return `${NATIVE_PUSH_AUTO_PROMPT_KEY_PREFIX}:${userId}`;
}

export default function App() {
  const extra = (Constants.expoConfig?.extra ?? {}) as {
    siteUrl?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    eas?: {
      projectId?: string;
    };
  };
  const [hasError, setHasError] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(DEFAULT_SITE_URL);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authLoadingLabel, setAuthLoadingLabel] = useState('Signing in...');
  const webViewRef = useRef<WebView>(null);
  const currentUrlRef = useRef(DEFAULT_SITE_URL);
  const nativePushContextRef = useRef<NativePushContext | null>(null);
  const pushSyncInFlightRef = useRef(false);
  const hasBootstrappedPushStatusRef = useRef(false);
  const lastPushSyncUserIdRef = useRef<string | null>(null);

  const siteUrl = useMemo(() => {
    const envUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim();
    if (envUrl && envUrl.startsWith('http')) return envUrl;
    const extraUrl = extra.siteUrl?.trim();
    if (extraUrl && extraUrl.startsWith('http')) return extraUrl;
    return DEFAULT_SITE_URL;
  }, [extra.siteUrl]);

  const supabaseUrl = useMemo(
    () => process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || extra.supabaseUrl?.trim() || '',
    [extra.supabaseUrl],
  );
  const supabaseAnonKey = useMemo(
    () => process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || extra.supabaseAnonKey?.trim() || '',
    [extra.supabaseAnonKey],
  );
  const expoProjectId = useMemo(
    () =>
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
      Constants.easConfig?.projectId ||
      extra.eas?.projectId?.trim() ||
      '',
    [extra.eas?.projectId],
  );

  useEffect(() => {
    if (currentUrlRef.current === DEFAULT_SITE_URL && siteUrl !== DEFAULT_SITE_URL) {
      currentUrlRef.current = siteUrl;
      setSourceUrl(siteUrl);
    }
  }, [siteUrl]);

  const injectIntoWebView = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script}\ntrue;`);
  }, []);

  const emitNativePushStatus = useCallback((status: NativePushStatus) => {
    const payload = JSON.stringify(status);
    injectIntoWebView(
      `window.__BIB_NATIVE_PUSH_STATUS = ${payload}; window.dispatchEvent(new CustomEvent('bib-native-push-status', { detail: ${payload} }));`,
    );
  }, [injectIntoWebView]);

  const resolveInAppUrl = useCallback((rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      if (!ALLOWED_HOSTS.has(parsed.hostname)) return siteUrl;
      return parsed.toString();
    } catch {
      const path = rawUrl.trim();
      if (!path) return siteUrl;
      if (!path.startsWith('/')) return `${siteUrl}/${path}`;
      return `${siteUrl}${path}`;
    }
  }, [siteUrl]);

  const openInWebView = useCallback((rawUrl: string) => {
    const nextUrl = resolveInAppUrl(rawUrl);
    currentUrlRef.current = nextUrl;
    setSourceUrl(nextUrl);
    injectIntoWebView(`window.location.replace(${JSON.stringify(nextUrl)});`);
  }, [injectIntoWebView, resolveInAppUrl]);

  const resolveNativePushAuthContext = useCallback(async (overrideContext?: Partial<NativePushContext> | null) => {
    const fallbackUserId = overrideContext?.userId?.trim() || nativePushContextRef.current?.userId || '';
    const fallbackAccessToken = overrideContext?.accessToken?.trim() || nativePushContextRef.current?.accessToken || '';
    const supabase = getMobileSupabaseClient(supabaseUrl, supabaseAnonKey);

    if (!supabase) {
      return fallbackUserId && fallbackAccessToken
        ? { userId: fallbackUserId, accessToken: fallbackAccessToken }
        : null;
    }

    try {
      const { data } = await supabase.auth.getSession();
      const sessionUserId = data.session?.user?.id?.trim() || '';
      const sessionAccessToken = data.session?.access_token?.trim() || '';

      if (sessionUserId && sessionAccessToken) {
        const nextContext = {
          userId: sessionUserId,
          accessToken: sessionAccessToken,
        };
        nativePushContextRef.current = nextContext;
        return nextContext;
      }
    } catch {
      // Fall back to the last known bridge context below.
    }

    return fallbackUserId && fallbackAccessToken
      ? { userId: fallbackUserId, accessToken: fallbackAccessToken }
      : null;
  }, [supabaseAnonKey, supabaseUrl]);

  const deleteNativePushToken = useCallback(async (context: NativePushContext, token: string) => {
    const resolvedContext = await resolveNativePushAuthContext(context);
    if (!resolvedContext?.userId || !resolvedContext.accessToken) {
      throw new Error('Not authenticated.');
    }

    const response = await fetch(`${siteUrl.replace(/\/+$/, '')}/api/native-push-subscriptions`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${resolvedContext.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      const message = await readApiErrorMessage(response, 'Failed to remove native push token.');
      throw new Error(message);
    }
  }, [resolveNativePushAuthContext, siteUrl]);

  const saveNativePushToken = useCallback(async (context: NativePushContext, token: string) => {
    const resolvedContext = await resolveNativePushAuthContext(context);
    if (!resolvedContext?.userId || !resolvedContext.accessToken) {
      throw new Error('Not authenticated.');
    }

    const response = await fetch(`${siteUrl.replace(/\/+$/, '')}/api/native-push-subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedContext.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        provider: 'expo',
        platform: NATIVE_PLATFORM,
      }),
    });

    if (!response.ok) {
      const message = await readApiErrorMessage(response, 'Failed to save native push token.');
      throw new Error(message);
    }
  }, [resolveNativePushAuthContext, siteUrl]);

  const syncNativePushToken = useCallback(async (options?: { prompt?: boolean; testAfterEnable?: boolean }) => {
    if (!Device.isDevice) {
      emitNativePushStatus({
        enabled: false,
        permission: 'unsupported',
        message: 'Native app notifications require a physical device.',
        platform: NATIVE_PLATFORM,
      });
      return;
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      emitNativePushStatus({
        enabled: false,
        permission: 'unsupported',
        message: 'App push is missing Supabase configuration.',
        platform: NATIVE_PLATFORM,
      });
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#f59e0b',
      }).catch(() => undefined);
    }

    let settings = await Notifications.getPermissionsAsync();
    let permission = getNativePushPermission(settings);

    if (permission !== 'granted' && options?.prompt) {
      settings = await Notifications.requestPermissionsAsync();
      permission = getNativePushPermission(settings);
    }

    if (permission !== 'granted') {
      emitNativePushStatus({
        enabled: false,
        permission,
        message:
          permission === 'denied'
            ? 'App notifications are blocked in device settings.'
            : options?.prompt
              ? 'App notification permission was not granted.'
              : 'App notifications are not enabled yet.',
        platform: NATIVE_PLATFORM,
      });
      return;
    }

    const context = await resolveNativePushAuthContext();
    if (!context?.userId || !context.accessToken) {
      emitNativePushStatus({
        enabled: false,
        permission: 'granted',
        message: 'Sign in inside the app before enabling app notifications.',
        platform: NATIVE_PLATFORM,
      });
      return;
    }

    nativePushContextRef.current = context;

    if (!expoProjectId) {
      emitNativePushStatus({
        enabled: false,
        permission: 'granted',
        message: 'Expo project ID is missing in this app build.',
        platform: NATIVE_PLATFORM,
      });
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId: expoProjectId });
    const expoPushToken = tokenResponse.data;
    const previousToken = await AsyncStorage.getItem(NATIVE_PUSH_TOKEN_STORAGE_KEY).catch(() => null);

    if (previousToken && previousToken !== expoPushToken) {
      await deleteNativePushToken(context, previousToken).catch(() => undefined);
    }

    await saveNativePushToken(context, expoPushToken);
    await AsyncStorage.setItem(NATIVE_PUSH_TOKEN_STORAGE_KEY, expoPushToken);

    emitNativePushStatus({
      enabled: true,
      permission: 'granted',
      message: options?.prompt
        ? 'App notifications are enabled for this device.'
        : 'App notifications are ready on this device.',
      platform: NATIVE_PLATFORM,
    });

    if (options?.testAfterEnable) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'BiB app notifications are on',
          body: 'This is a test notification from the mobile app.',
          data: { url: currentUrlRef.current || '/' },
        },
        trigger: null,
      });
    }
  }, [deleteNativePushToken, emitNativePushStatus, expoProjectId, resolveNativePushAuthContext, saveNativePushToken, supabaseAnonKey, supabaseUrl]);

  const syncNativePushTokenIfNeeded = useCallback(
    async (options?: { prompt?: boolean; testAfterEnable?: boolean; force?: boolean }) => {
      const currentUserId = nativePushContextRef.current?.userId ?? null;

      if (pushSyncInFlightRef.current) {
        return;
      }

      if (
        !options?.force &&
        hasBootstrappedPushStatusRef.current &&
        lastPushSyncUserIdRef.current === currentUserId
      ) {
        return;
      }

      pushSyncInFlightRef.current = true;

      try {
        await syncNativePushToken({
          prompt: options?.prompt,
          testAfterEnable: options?.testAfterEnable,
        });
      } finally {
        pushSyncInFlightRef.current = false;
        hasBootstrappedPushStatusRef.current = true;
        lastPushSyncUserIdRef.current = currentUserId;
      }
    },
    [syncNativePushToken],
  );

  const maybeAutoEnableNativePush = useCallback(async (context?: NativePushContext | null) => {
    const nextContext = context ?? nativePushContextRef.current;
    if (Platform.OS !== 'ios' || !nextContext?.userId || !nextContext.accessToken) {
      return;
    }

    const autoPromptKey = getNativePushAutoPromptKey(nextContext.userId);
    const alreadyPrompted = await AsyncStorage.getItem(autoPromptKey).catch(() => null);
    const settings = await Notifications.getPermissionsAsync().catch(() => null);
    const permission = settings ? getNativePushPermission(settings) : 'default';

    if (permission === 'default' && !alreadyPrompted) {
      await AsyncStorage.setItem(autoPromptKey, '1').catch(() => undefined);
      await syncNativePushTokenIfNeeded({ prompt: true, force: true }).catch(() => undefined);
      return;
    }

    await syncNativePushTokenIfNeeded({ prompt: false, force: true }).catch(() => undefined);
  }, [syncNativePushTokenIfNeeded]);

  const clearNativePushToken = useCallback(async (overrideContext?: Partial<NativePushContext>) => {
    const token = await AsyncStorage.getItem(NATIVE_PUSH_TOKEN_STORAGE_KEY).catch(() => null);
    const context = await resolveNativePushAuthContext(overrideContext);

    if (token && context?.userId && context.accessToken) {
      await deleteNativePushToken({ userId: context.userId, accessToken: context.accessToken }, token).catch(() => undefined);
    }

    await AsyncStorage.removeItem(NATIVE_PUSH_TOKEN_STORAGE_KEY).catch(() => undefined);
    nativePushContextRef.current = null;
    lastPushSyncUserIdRef.current = null;
    hasBootstrappedPushStatusRef.current = true;

    const settings = await Notifications.getPermissionsAsync().catch(() => null);
    emitNativePushStatus({
      enabled: false,
      permission: settings ? getNativePushPermission(settings) : 'default',
      message: 'App notifications were disconnected for this account.',
      platform: NATIVE_PLATFORM,
    });
  }, [deleteNativePushToken, emitNativePushStatus, resolveNativePushAuthContext]);

  const sendNativePushTest = useCallback(async () => {
    const settings = await Notifications.getPermissionsAsync();
    const permission = getNativePushPermission(settings);
    if (permission !== 'granted') {
      emitNativePushStatus({
        enabled: false,
        permission,
        message: 'Enable app notifications first to run a native test alert.',
        platform: NATIVE_PLATFORM,
      });
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'BiB app notifications are on',
        body: 'This is a test notification from the mobile app.',
        data: { url: currentUrlRef.current || '/' },
      },
      trigger: null,
    });

    emitNativePushStatus({
      enabled: true,
      permission: 'granted',
      message: 'A native test notification was sent to this device.',
      platform: NATIVE_PLATFORM,
    });
  }, [emitNativePushStatus]);

  const getSafeNextPath = useCallback((rawUrl: string) => {
    try {
      const parsed = new URL(rawUrl);
      if (!ALLOWED_HOSTS.has(parsed.hostname)) return '/';
      const nextPath = `${parsed.pathname || '/'}${parsed.search || ''}`;
      if (
        nextPath.startsWith('/auth/callback') ||
        nextPath.startsWith(AUTH_BRIDGE_PATH) ||
        nextPath === 'about:blank'
      ) {
        return '/';
      }
      return nextPath || '/';
    } catch {
      return '/';
    }
  }, []);

  useEffect(() => {
    const openNotificationTarget = (rawUrl: unknown) => {
      if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
        openInWebView(siteUrl);
        return;
      }
      openInWebView(rawUrl);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      openNotificationTarget(response.notification.request.content.data?.url);
    });

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        openNotificationTarget(response.notification.request.content.data?.url);
      })
      .catch(() => undefined);

    return () => {
      responseSubscription.remove();
    };
  }, [openInWebView, siteUrl]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncNativePushTokenIfNeeded({ force: true }).catch(() => undefined);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncNativePushTokenIfNeeded]);

  const syncWebViewSession = useCallback((session: Session) => {
    const nextPath = getSafeNextPath(currentUrlRef.current);
    const bridgeUrl =
      `${siteUrl}${AUTH_BRIDGE_PATH}` +
      `#access_token=${encodeURIComponent(session.access_token)}` +
      `&refresh_token=${encodeURIComponent(session.refresh_token)}` +
      `&next=${encodeURIComponent(nextPath)}`;

    currentUrlRef.current = bridgeUrl;
    setSourceUrl(bridgeUrl);
    webViewRef.current?.injectJavaScript(`window.location.replace(${JSON.stringify(bridgeUrl)}); true;`);
  }, [getSafeNextPath, siteUrl]);

  const startNativeGoogleSignIn = useCallback(async () => {
    if (isAuthLoading) return;
    const supabase = getMobileSupabaseClient(supabaseUrl, supabaseAnonKey);

    if (!supabase) {
      Alert.alert('Google sign-in unavailable', 'Mobile auth is missing configuration. Add the public Supabase settings to the Expo app build.');
      return;
    }

    setIsAuthLoading(true);
    setAuthLoadingLabel('Signing in with Google...');

    try {
      await supabase.auth.signOut().catch(() => undefined);

      const appRedirectTo = makeRedirectUri({
        scheme: 'bingeitbro',
        path: 'auth/callback',
      });
      const webRedirectTo = `${siteUrl.replace(/\/+$/, '')}/auth/callback?native_app=1`;

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: webRedirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
            access_type: 'offline',
          },
        },
      });

      if (error || !data?.url) {
        throw new Error(error?.message || 'Could not start Google sign-in.');
      }

      const authResult = await WebBrowser.openAuthSessionAsync(data.url, appRedirectTo);
      const callbackHref = ('url' in authResult ? authResult.url : null) || (await Linking.getInitialURL()) || null;

      if (!callbackHref) {
        if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
          return;
        }
        throw new Error('Google sign-in did not complete.');
      }

      if (!callbackHref.startsWith('bingeitbro://')) {
        throw new Error('Google sign-in returned an unexpected callback.');
      }

      const callbackUrl = new URL(callbackHref);
      const callbackError = callbackUrl.searchParams.get('error_description') || callbackUrl.searchParams.get('error');
      if (callbackError) {
        throw new Error(callbackError);
      }

      const code = callbackUrl.searchParams.get('code');
      if (!code) {
        throw new Error('Missing authentication code.');
      }

      const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError || !exchangeData?.session) {
        throw new Error(exchangeError?.message || 'Could not complete Google sign-in.');
      }

      syncWebViewSession(exchangeData.session);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not complete Google sign-in.';
      Alert.alert('Google sign-in failed', message);
    } finally {
      setIsAuthLoading(false);
      setAuthLoadingLabel('Signing in...');
      if (Platform.OS === 'android') {
        WebBrowser.coolDownAsync().catch(() => undefined);
      }
    }
  }, [isAuthLoading, supabaseAnonKey, supabaseUrl, syncWebViewSession]);

  const startNativeAppleSignIn = useCallback(async () => {
    if (isAuthLoading) return;
    if (Platform.OS !== 'ios') {
      Alert.alert('Apple sign-in unavailable', 'Apple sign-in is only available in the iOS app.');
      return;
    }

    const supabase = getMobileSupabaseClient(supabaseUrl, supabaseAnonKey);
    if (!supabase) {
      Alert.alert('Apple sign-in unavailable', 'Mobile auth is missing configuration. Add the public Supabase settings to the Expo app build.');
      return;
    }

    setIsAuthLoading(true);
    setAuthLoadingLabel('Signing in with Apple...');

    try {
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Apple sign-in is not available on this device.');
      }

      await supabase.auth.signOut().catch(() => undefined);

      const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('Apple sign-in did not return an identity token.');
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        access_token: credential.authorizationCode ?? undefined,
        nonce,
      });

      if (error || !data?.session) {
        throw new Error(error?.message || 'Could not complete Apple sign-in.');
      }

      syncWebViewSession(data.session);
    } catch (error) {
      const maybeCode =
        error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (maybeCode === 'ERR_REQUEST_CANCELED') {
        return;
      }

      const message = error instanceof Error ? error.message : 'Could not complete Apple sign-in.';
      Alert.alert('Apple sign-in failed', message);
    } finally {
      setIsAuthLoading(false);
      setAuthLoadingLabel('Signing in...');
    }
  }, [isAuthLoading, supabaseAnonKey, supabaseUrl, syncWebViewSession]);

  const openExternalUrl = useCallback((url: string, options?: { allowInAppBrowserFallback?: boolean }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void Linking.openURL(url).catch(() => {
          if (options?.allowInAppBrowserFallback) {
            WebBrowser.openBrowserAsync(url).catch(() => undefined);
          }
        });
        return;
      }
    } catch {
      // Fall through to Linking for non-HTTP URLs.
    }

    Linking.openURL(url).catch(() => undefined);
  }, []);

  const openProviderTarget = useCallback((target: { appUrl?: string; browserUrl?: string }) => {
    const browserUrl = target.browserUrl?.trim() || '';
    const appUrl = target.appUrl?.trim() || browserUrl;

    if (appUrl && appUrl !== browserUrl) {
      void Linking.canOpenURL(appUrl)
        .then((supported) => {
          if (supported) {
            return Linking.openURL(appUrl);
          }
          if (browserUrl) {
            return Linking.openURL(browserUrl);
          }
          return Promise.reject(new Error('Provider app unavailable.'));
        })
        .catch(() => {
          if (browserUrl) {
            Linking.openURL(browserUrl).catch(() => undefined);
          }
        });
      return;
    }

    if (browserUrl) {
      openExternalUrl(browserUrl);
    } else if (appUrl) {
      void Linking.openURL(appUrl).catch(() => undefined);
    }
  }, [openExternalUrl]);

  const onShouldStartLoadWithRequest = (request: ShouldStartLoadRequest) => {
    const providerLaunchTarget = getProviderLaunchTarget(request.url);
    if (providerLaunchTarget) {
      openProviderTarget(providerLaunchTarget);
      return false;
    }
    if (isAllowedInAppUrl(request.url)) return true;
    openExternalUrl(request.url);
    return false;
  };

  const onLoadStart = useCallback(() => {
    setHasError(false);
  }, []);

  const onLoadEnd = useCallback(() => {
    setHasError(false);
    void syncNativePushTokenIfNeeded({ prompt: false }).catch(() => undefined);
  }, [syncNativePushTokenIfNeeded]);

  const onNavigationStateChange = useCallback((state: { url: string }) => {
    if (isAllowedInAppUrl(state.url)) {
      currentUrlRef.current = state.url;
    }
  }, []);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as NativeBridgePayload;
      if (payload.type === 'BIB_AUTH_GOOGLE_SIGN_IN') {
        void startNativeGoogleSignIn();
      } else if (payload.type === 'BIB_AUTH_APPLE_SIGN_IN') {
        void startNativeAppleSignIn();
      } else if (payload.type === 'BIB_OPEN_EXTERNAL_URL') {
        openProviderTarget({
          appUrl: payload.appUrl,
          browserUrl: payload.browserUrl,
        });
      } else if (payload.type === 'BIB_NATIVE_PUSH_SYNC_CONTEXT') {
        const userId = payload.userId?.trim() || '';
        const accessToken = payload.accessToken?.trim() || '';
        if (userId && accessToken) {
          nativePushContextRef.current = { userId, accessToken };
          void maybeAutoEnableNativePush({ userId, accessToken }).catch(() => undefined);
        }
      } else if (payload.type === 'BIB_NATIVE_PUSH_CLEAR_CONTEXT') {
        void clearNativePushToken({
          userId: payload.userId,
          accessToken: payload.accessToken,
        }).catch(() => undefined);
      } else if (payload.type === 'BIB_ENABLE_NATIVE_PUSH') {
        const userId = payload.userId?.trim() || nativePushContextRef.current?.userId || '';
        const accessToken = payload.accessToken?.trim() || nativePushContextRef.current?.accessToken || '';
        if (userId && accessToken) {
          nativePushContextRef.current = { userId, accessToken };
        }
        void syncNativePushTokenIfNeeded({ prompt: true, testAfterEnable: true, force: true }).catch((error) => {
          emitNativePushStatus({
            enabled: false,
            permission: 'default',
            message: error instanceof Error ? error.message : 'Failed to enable app notifications.',
            platform: NATIVE_PLATFORM,
          });
        });
      } else if (payload.type === 'BIB_REFRESH_NATIVE_PUSH_STATUS') {
        void syncNativePushTokenIfNeeded({ prompt: false, force: true }).catch(() => undefined);
      } else if (payload.type === 'BIB_SEND_NATIVE_PUSH_TEST') {
        void sendNativePushTest().catch(() => undefined);
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, [
    clearNativePushToken,
    emitNativePushStatus,
    openProviderTarget,
    sendNativePushTest,
    startNativeAppleSignIn,
    startNativeGoogleSignIn,
    maybeAutoEnableNativePush,
    syncNativePushTokenIfNeeded,
  ]);

  const androidStatusBarInset = Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) : 0;

  return (
    <SafeAreaView style={[styles.container, androidStatusBarInset > 0 ? { paddingTop: androidStatusBarInset } : null]}>
      <ExpoStatusBar style="light" translucent={false} />
      <WebView
        ref={webViewRef}
        source={{ uri: sourceUrl }}
        injectedJavaScriptBeforeContentLoaded={WEBVIEW_BOOTSTRAP_SCRIPT}
        pullToRefreshEnabled={Platform.OS === 'ios'}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onNavigationStateChange={onNavigationStateChange}
        onMessage={onMessage}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
        onError={() => {
          setHasError(true);
        }}
        startInLoadingState
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        cacheEnabled
        allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
        bounces={false}
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#f59e0b" />
            <Text style={styles.loadingText}>Loading Binge It Bro</Text>
          </View>
        )}
      />
      {hasError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorTitle}>Network error</Text>
          <Text style={styles.errorText}>Please check your connection and retry.</Text>
        </View>
      )}
      {isAuthLoading && (
        <View pointerEvents="none" style={styles.authOverlay}>
          <ActivityIndicator size="small" color="#f59e0b" />
          <Text style={styles.authOverlayText}>{authLoadingLabel}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#f5f5f5',
    fontSize: 14,
    fontWeight: '600',
  },
  authOverlay: {
    position: 'absolute',
    top: 12,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  authOverlayText: {
    color: '#f5f5f5',
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 20,
    left: 12,
    right: 12,
    backgroundColor: '#451a1a',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorTitle: {
    color: '#fecaca',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  errorText: {
    color: '#fee2e2',
    fontSize: 12,
    lineHeight: 16,
  },
});
