import type { OTTLink } from '@/types';

export type OTTLaunchTarget = {
  appUrl?: string;
  browserUrl: string;
};

export function getOttLaunchTarget(link: OTTLink): OTTLaunchTarget | null {
  const browserUrl = (link.browserUrl || link.url || '').trim();
  if (!browserUrl) return null;

  const appUrl = (link.appUrl || browserUrl).trim();
  return {
    browserUrl,
    appUrl: appUrl || browserUrl,
  };
}

export function buildOttLaunchHref(link: OTTLink): string {
  const target = getOttLaunchTarget(link);
  if (!target) return link.url;

  const params = new URLSearchParams({
    web: target.browserUrl,
    label: link.platform,
  });

  if (target.appUrl) {
    params.set('app', target.appUrl);
  }

  return `/open/provider?${params.toString()}`;
}

