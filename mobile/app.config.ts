import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const extra = (base.extra ?? {}) as Record<string, unknown>;
  const ios = base.ios ?? {};
  const android = base.android ?? {};
  const existingInfoPlist = (ios.infoPlist ?? {}) as Record<string, unknown>;
  const existingSchemes = Array.isArray(existingInfoPlist.LSApplicationQueriesSchemes)
    ? existingInfoPlist.LSApplicationQueriesSchemes.filter((value): value is string => typeof value === 'string')
    : [];
  const lsApplicationQueriesSchemes = Array.from(new Set([...existingSchemes, 'nflx', 'youtube']));
  const appScheme =
    process.env.EXPO_PUBLIC_APP_SCHEME?.trim() ||
    (typeof base.scheme === 'string' ? base.scheme : '') ||
    'bingeitbro';
  const siteUrl =
    process.env.EXPO_PUBLIC_SITE_URL?.trim() ||
    (typeof extra.siteUrl === 'string' ? extra.siteUrl : '') ||
    'https://bingeitbro.com';
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
    (typeof extra.apiBaseUrl === 'string' ? extra.apiBaseUrl : '') ||
    siteUrl;
  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    (typeof extra.supabaseAnonKey === 'string' ? extra.supabaseAnonKey : '') ||
    '';
  const supabasePublishableKey =
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    (typeof extra.supabasePublishableKey === 'string' ? extra.supabasePublishableKey : '') ||
    supabaseAnonKey;
  const turnstileSiteKey =
    process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
    (typeof extra.turnstileSiteKey === 'string' ? extra.turnstileSiteKey : '') ||
    '';
  const iosBundleIdentifier =
    process.env.EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER?.trim() ||
    (typeof ios.bundleIdentifier === 'string' ? ios.bundleIdentifier : '') ||
    'com.bingeitbro.app';
  const androidPackage =
    process.env.EXPO_PUBLIC_ANDROID_PACKAGE?.trim() ||
    (typeof android.package === 'string' ? android.package : '') ||
    'com.bingeitbro.app';

  return {
    ...base,
    scheme: appScheme,
    ios: {
      ...ios,
      bundleIdentifier: iosBundleIdentifier,
      usesAppleSignIn: true,
      infoPlist: {
        ...existingInfoPlist,
        RCTNewArchEnabled: false,
        LSApplicationQueriesSchemes: lsApplicationQueriesSchemes,
      },
    },
    android: {
      ...android,
      package: androidPackage,
    },
    extra: {
      ...extra,
      appScheme,
      apiBaseUrl,
      siteUrl,
      iosBundleIdentifier,
      androidPackage,
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
        (typeof extra.supabaseUrl === 'string' ? extra.supabaseUrl : '') ||
        '',
      supabaseAnonKey,
      supabasePublishableKey,
      turnstileSiteKey,
    },
  } as ExpoConfig;
};
