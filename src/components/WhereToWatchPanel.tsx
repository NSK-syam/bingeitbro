'use client';

import { useCallback, useMemo, type MouseEvent } from 'react';
import { buildOttLaunchHref, getOttLaunchTarget } from '@/lib/ott-launch';
import { postNativeExternalOpenMessage } from '@/lib/native-webview';
import { getStreamingService } from '@/lib/streaming-services';
import { normalizeWatchProviderKey } from '@/lib/tmdb';
import type { OTTLink } from '@/types';

type WhereToWatchPanelProps = {
  links: OTTLink[];
  regionNote?: string;
};

function dedupeOttLinks(links: OTTLink[]): OTTLink[] {
  const unique = new Map<string, OTTLink>();

  for (const link of links) {
    const key = normalizeWatchProviderKey(link.platform) || link.platform.toLowerCase().trim();
    if (!key) continue;
    if (!unique.has(key)) {
      unique.set(key, link);
    }
  }

  return Array.from(unique.values());
}

export function WhereToWatchPanel({ links, regionNote = '' }: WhereToWatchPanelProps) {
  const uniqueLinks = useMemo(() => dedupeOttLinks(links), [links]);
  const handleProviderClick = useCallback((event: MouseEvent<HTMLAnchorElement>, link: OTTLink) => {
    const target = getOttLaunchTarget(link);
    if (!target) return;
    if (postNativeExternalOpenMessage(target)) {
      event.preventDefault();
    }
  }, []);

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl p-6 sm:p-7 border border-white/5">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">Where to watch</h2>

      {uniqueLinks.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {uniqueLinks.map((link) => {
            const service = getStreamingService(link.platform);
            const logoUrl = link.logoPath ? `https://image.tmdb.org/t/p/w92${link.logoPath}` : '';
            const monogram = service?.monogram || link.platform.charAt(0).toUpperCase();

            return (
              <a
                key={`${link.platform}-${link.url}`}
                href={buildOttLaunchHref(link)}
                onClick={(event) => handleProviderClick(event, link)}
                className="group flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[var(--bg-secondary)] p-4 transition hover:bg-[var(--bg-card-hover)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {logoUrl ? (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[var(--bg-primary)]/60">
                      <img src={logoUrl} alt={link.platform} className="h-8 w-8 object-contain" />
                    </span>
                  ) : (
                    <span
                      className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-sm font-black tracking-[0.16em] text-white"
                      style={{
                        borderColor: service ? `${service.accent}99` : 'rgba(255,255,255,0.16)',
                        background: service
                          ? `linear-gradient(145deg, ${service.accent} 0%, rgba(10,10,12,0.84) 100%)`
                          : 'linear-gradient(145deg, rgba(245,158,11,0.78) 0%, rgba(10,10,12,0.84) 100%)',
                      }}
                    >
                      {monogram}
                    </span>
                  )}

                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-primary)]">{link.platform}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <svg className="h-5 w-5 text-[var(--text-muted)] transition group-hover:text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-3xl border border-dashed border-white/10 bg-black/20 px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          No streaming provider availability is available for this title right now.
        </div>
      )}
    </div>
  );
}
