import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  const extra = (base.extra ?? {}) as Record<string, unknown>;
  const ios = base.ios ?? {};
  const existingInfoPlist = (ios.infoPlist ?? {}) as Record<string, unknown>;
  const existingSchemes = Array.isArray(existingInfoPlist.LSApplicationQueriesSchemes)
    ? existingInfoPlist.LSApplicationQueriesSchemes.filter((value): value is string => typeof value === 'string')
    : [];
  const lsApplicationQueriesSchemes = Array.from(new Set([...existingSchemes, 'nflx', 'youtube']));

  return {
    ...base,
    ios: {
      ...ios,
      infoPlist: {
        ...existingInfoPlist,
        LSApplicationQueriesSchemes: lsApplicationQueriesSchemes,
      },
    },
    extra: {
      ...extra,
      siteUrl: process.env.EXPO_PUBLIC_SITE_URL?.trim() || (typeof extra.siteUrl === 'string' ? extra.siteUrl : '') || '',
      supabaseUrl:
        process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ||
        (typeof extra.supabaseUrl === 'string' ? extra.supabaseUrl : '') ||
        '',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
        (typeof extra.supabaseAnonKey === 'string' ? extra.supabaseAnonKey : '') ||
        '',
    },
  } as ExpoConfig;
};
