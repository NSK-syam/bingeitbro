'use client';

import { useEffect, useState } from 'react';
import { isNativeIosReviewMode } from '@/lib/native-webview';

export function useIosReviewMode(): boolean {
  const [enabled, setEnabled] = useState(
    () => (typeof window !== 'undefined' ? isNativeIosReviewMode() : false),
  );

  useEffect(() => {
    const update = () => {
      setEnabled(isNativeIosReviewMode());
    };

    update();
    window.addEventListener('bib-native-shell', update);
    return () => window.removeEventListener('bib-native-shell', update);
  }, []);

  return enabled;
}
