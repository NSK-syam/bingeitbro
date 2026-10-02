'use client';

import { useSyncExternalStore } from 'react';
import { isNativeApp } from '@/lib/native-app';

const noopSubscribe = () => () => {};

/** Hydration-safe isNativeApp(): false during SSR and hydration, then the real value. */
export function useIsNativeApp(): boolean {
  return useSyncExternalStore(noopSubscribe, isNativeApp, () => false);
}
