import { normalizeWatchProviderKey } from '@/lib/tmdb';
import type { OTTLink } from '@/types';

export type StreamingServiceId =
  | 'netflix'
  | 'prime-video'
  | 'apple-tv'
  | 'disney-plus'
  | 'jiohotstar'
  | 'youtube'
  | 'hulu'
  | 'max'
  | 'peacock'
  | 'paramount-plus'
  | 'zee5'
  | 'sonyliv'
  | 'aha'
  | 'crunchyroll';

export type StreamingServiceDefinition = {
  id: StreamingServiceId;
  label: string;
  badge: string;
  monogram: string;
  availabilityLabel: string;
  accent: string;
  highlight: string;
  matchKeys: string[];
};

export const STREAMING_SERVICES: StreamingServiceDefinition[] = [
  {
    id: 'netflix',
    label: 'Netflix',
    badge: 'Global',
    monogram: 'N',
    availabilityLabel: 'US + India',
    accent: '#e50914',
    highlight: 'rgba(229, 9, 20, 0.28)',
    matchKeys: ['netflix'],
  },
  {
    id: 'prime-video',
    label: 'Prime Video',
    badge: 'Global',
    monogram: 'PV',
    availabilityLabel: 'US + India',
    accent: '#00a8e1',
    highlight: 'rgba(0, 168, 225, 0.24)',
    matchKeys: ['prime video'],
  },
  {
    id: 'apple-tv',
    label: 'Apple TV+',
    badge: 'Global',
    monogram: 'AT',
    availabilityLabel: 'US + India',
    accent: '#d4d4d8',
    highlight: 'rgba(212, 212, 216, 0.2)',
    matchKeys: ['apple tv'],
  },
  {
    id: 'disney-plus',
    label: 'Disney+',
    badge: 'US',
    monogram: 'D+',
    availabilityLabel: 'US',
    accent: '#1f80e0',
    highlight: 'rgba(31, 128, 224, 0.22)',
    matchKeys: ['disney+'],
  },
  {
    id: 'jiohotstar',
    label: 'JioHotstar',
    badge: 'India',
    monogram: 'JH',
    availabilityLabel: 'India',
    accent: '#2142ff',
    highlight: 'rgba(33, 66, 255, 0.22)',
    matchKeys: ['jiohotstar'],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    badge: 'Global',
    monogram: 'YT',
    availabilityLabel: 'US + India',
    accent: '#ff0000',
    highlight: 'rgba(255, 0, 0, 0.22)',
    matchKeys: ['youtube'],
  },
  {
    id: 'hulu',
    label: 'Hulu',
    badge: 'US',
    monogram: 'HU',
    availabilityLabel: 'US',
    accent: '#1ce783',
    highlight: 'rgba(28, 231, 131, 0.2)',
    matchKeys: ['hulu'],
  },
  {
    id: 'max',
    label: 'Max',
    badge: 'US',
    monogram: 'MX',
    availabilityLabel: 'US',
    accent: '#7f5af0',
    highlight: 'rgba(127, 90, 240, 0.22)',
    matchKeys: ['max', 'hbo max'],
  },
  {
    id: 'peacock',
    label: 'Peacock',
    badge: 'US',
    monogram: 'PK',
    availabilityLabel: 'US',
    accent: '#f59e0b',
    highlight: 'rgba(245, 158, 11, 0.22)',
    matchKeys: ['peacock'],
  },
  {
    id: 'paramount-plus',
    label: 'Paramount+',
    badge: 'US',
    monogram: 'P+',
    availabilityLabel: 'US',
    accent: '#60a5fa',
    highlight: 'rgba(96, 165, 250, 0.22)',
    matchKeys: ['paramount+'],
  },
  {
    id: 'zee5',
    label: 'Zee5',
    badge: 'India',
    monogram: 'Z5',
    availabilityLabel: 'India',
    accent: '#8230c6',
    highlight: 'rgba(130, 48, 198, 0.22)',
    matchKeys: ['zee5'],
  },
  {
    id: 'sonyliv',
    label: 'SonyLiv',
    badge: 'India',
    monogram: 'SL',
    availabilityLabel: 'India',
    accent: '#2563eb',
    highlight: 'rgba(37, 99, 235, 0.22)',
    matchKeys: ['sonyliv'],
  },
  {
    id: 'aha',
    label: 'Aha',
    badge: 'India',
    monogram: 'AH',
    availabilityLabel: 'India',
    accent: '#ff3366',
    highlight: 'rgba(255, 51, 102, 0.22)',
    matchKeys: ['aha'],
  },
  {
    id: 'crunchyroll',
    label: 'Crunchyroll',
    badge: 'Select',
    monogram: 'CR',
    availabilityLabel: 'Select regions',
    accent: '#f97316',
    highlight: 'rgba(249, 115, 22, 0.22)',
    matchKeys: ['crunchyroll'],
  },
];

const SERVICES_BY_MATCH_KEY = STREAMING_SERVICES.reduce<Map<string, StreamingServiceDefinition>>((acc, service) => {
  for (const key of service.matchKeys) {
    acc.set(key, service);
  }
  return acc;
}, new Map());

export function getStreamingService(platformName: string): StreamingServiceDefinition | null {
  const normalized = normalizeWatchProviderKey(platformName);
  if (!normalized) return null;
  return SERVICES_BY_MATCH_KEY.get(normalized) ?? null;
}

export function sortOttLinksByServices(links: OTTLink[], selectedIds: StreamingServiceId[]): OTTLink[] {
  if (links.length <= 1) return links;

  const selected = new Set(selectedIds);
  return [...links].sort((left, right) => {
    const leftService = getStreamingService(left.platform);
    const rightService = getStreamingService(right.platform);
    const leftSaved = leftService ? selected.has(leftService.id) : false;
    const rightSaved = rightService ? selected.has(rightService.id) : false;

    if (leftSaved !== rightSaved) return leftSaved ? -1 : 1;

    const leftRegion = (left.availableIn || '').length;
    const rightRegion = (right.availableIn || '').length;
    if (leftRegion !== rightRegion) return rightRegion - leftRegion;

    return left.platform.localeCompare(right.platform);
  });
}
