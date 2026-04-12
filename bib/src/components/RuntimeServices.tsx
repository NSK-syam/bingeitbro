'use client';

import { useEffect } from 'react';
import { HelpBotWidget } from '@/components/HelpBotWidget';
import { useIosReviewMode } from '@/hooks/useIosReviewMode';

type RuntimeServicesProps = {
  analyticsWebsiteId: string;
  analyticsDomain: string;
};

export function RuntimeServices({
  analyticsWebsiteId,
  analyticsDomain,
}: RuntimeServicesProps) {
  const iosReviewMode = useIosReviewMode();

  useEffect(() => {
    if (iosReviewMode) return;
    if (!analyticsWebsiteId || !analyticsDomain) return;

    const existing = document.querySelector<HTMLScriptElement>('script[data-bib-datafast="1"]');
    if (existing) return;

    const script = document.createElement('script');
    script.defer = true;
    script.src = 'https://datafa.st/js/script.js';
    script.dataset.websiteId = analyticsWebsiteId;
    script.dataset.domain = analyticsDomain;
    script.dataset.bibDatafast = '1';
    document.head.appendChild(script);
  }, [analyticsDomain, analyticsWebsiteId, iosReviewMode]);

  if (iosReviewMode) return null;
  return <HelpBotWidget />;
}
