'use client';

import { useLocalStorage } from './useLocalStorage';
import type { CountryCode } from '@/components/CountryToggle';

function guessCountry(): CountryCode {
  if (typeof window === 'undefined') return 'IN';
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toLowerCase();
  if (tz.includes('kolkata') || tz.includes('calcutta') || tz.startsWith('asia/')) return 'IN';
  return 'US';
}

export function useCountry(): [CountryCode, (value: CountryCode) => void] {
  return useLocalStorage<CountryCode>('bib-country', guessCountry());
}

