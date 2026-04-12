import Constants from 'expo-constants';

export type MobileRuntimeConfig = {
  apiBaseUrl: string;
  appScheme: string;
  androidPackage: string;
  iosBundleIdentifier: string;
  siteUrl: string;
  supabaseAnonKey: string;
  supabasePublishableKey: string;
  supabaseUrl: string;
  turnstileSiteKey: string;
};

const DEFAULT_SITE_URL = 'https://bingeitbro.com';
const DEFAULT_APP_SCHEME = 'bingeitbro';
const DEFAULT_IOS_BUNDLE_IDENTIFIER = 'com.bingeitbro.app';
const DEFAULT_ANDROID_PACKAGE = 'com.bingeitbro.app';

let cachedConfig: MobileRuntimeConfig | null = null;

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function readExpoExtra(): Record<string, unknown> {
  const expoConfigExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const manifestExtra =
    ((Constants as typeof Constants & { manifest2?: { extra?: Record<string, unknown> } | null }).manifest2?.extra ??
      {}) as Record<string, unknown>;

  return {
    ...manifestExtra,
    ...expoConfigExtra,
  };
}

export function getRuntimeConfig(): MobileRuntimeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const extra = readExpoExtra();
  const siteUrl = trimTrailingSlash(trimString(extra.siteUrl) || DEFAULT_SITE_URL);
  const apiBaseUrl = trimTrailingSlash(trimString(extra.apiBaseUrl) || siteUrl || DEFAULT_SITE_URL);
  const supabaseAnonKey =
    trimString(extra.supabaseAnonKey) || trimString(extra.supabasePublishableKey);
  const supabasePublishableKey =
    trimString(extra.supabasePublishableKey) || supabaseAnonKey;

  cachedConfig = {
    siteUrl,
    apiBaseUrl,
    supabaseUrl: trimString(extra.supabaseUrl),
    supabaseAnonKey,
    supabasePublishableKey,
    turnstileSiteKey: trimString(extra.turnstileSiteKey),
    appScheme: trimString(extra.appScheme) || DEFAULT_APP_SCHEME,
    iosBundleIdentifier:
      trimString(extra.iosBundleIdentifier) || DEFAULT_IOS_BUNDLE_IDENTIFIER,
    androidPackage: trimString(extra.androidPackage) || DEFAULT_ANDROID_PACKAGE,
  };

  return cachedConfig;
}

export function isSupabaseConfigured(): boolean {
  const config = getRuntimeConfig();
  return Boolean(config.supabaseUrl && config.supabasePublishableKey);
}
