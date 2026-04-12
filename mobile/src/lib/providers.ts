import { buildTmdbV3Url, fetchTmdbWithProxy } from './tmdb-proxy';

export type OTTLink = {
  appUrl?: string;
  availableIn?: string;
  browserUrl?: string;
  logoPath?: string;
  platform: string;
  url: string;
};

export type TMDBWatchProviderEntry = {
  logo_path: string | null;
  provider_id: number;
  provider_name: string;
};

export type TMDBWatchProviders = {
  results: Record<
    string,
    {
      ads?: TMDBWatchProviderEntry[];
      buy?: TMDBWatchProviderEntry[];
      flatrate?: TMDBWatchProviderEntry[];
      free?: TMDBWatchProviderEntry[];
      link: string;
      rent?: TMDBWatchProviderEntry[];
    }
  >;
};

type OTTProviderTarget = {
  appUrl?: string;
  browserUrl: string;
};

type WatchRegion = 'IN' | 'US';

const WATCH_REGIONS: WatchRegion[] = ['US', 'IN'];

function buildOttProviderTarget(browserUrl: string, appUrl?: string): OTTProviderTarget {
  return {
    browserUrl,
    appUrl: appUrl || browserUrl,
  };
}

export function normalizeWatchProviderKey(name: string): string {
  const raw = (name || '').toLowerCase().trim();
  if (!raw) return '';

  const lower = raw
    .replace(/\s+with\s+ads/g, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (lower.includes('netflix')) return 'netflix';
  if (lower.includes('prime')) return 'prime video';
  if (lower.includes('amazon video')) return 'prime video';
  if (lower.includes('hotstar')) return 'jiohotstar';
  if (lower.includes('jiohotstar')) return 'jiohotstar';
  if (lower.includes('jio') && lower.includes('cinema')) return 'jiohotstar';
  if (lower.includes('disney')) return 'disney+';
  if (lower.includes('apple')) return 'apple tv';
  if (lower.includes('aha')) return 'aha';
  if (lower.includes('sonyliv')) return 'sonyliv';
  if (lower.includes('zee5')) return 'zee5';
  if (lower.includes('youtube')) return 'youtube';
  if (lower.includes('hulu')) return 'hulu';
  if (lower.includes('peacock')) return 'peacock';
  if (lower.includes('paramount')) return 'paramount+';
  if (lower.includes('crunchyroll')) return 'crunchyroll';
  return lower;
}

export function getDirectOttTarget(platformName: string, title: string): OTTProviderTarget | null {
  const encodedTitle = encodeURIComponent((title || '').trim());
  if (!encodedTitle) return null;
  const lowerName = platformName.toLowerCase();

  if (lowerName.includes('netflix')) {
    return buildOttProviderTarget(
      `https://www.netflix.com/search?q=${encodedTitle}`,
      `nflx://www.netflix.com/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('prime') || lowerName.includes('amazon')) {
    return buildOttProviderTarget(
      `https://www.primevideo.com/search?phrase=${encodedTitle}`,
      `https://app.primevideo.com/search?phrase=${encodedTitle}`,
    );
  }
  if (lowerName.includes('jiohotstar')) {
    return buildOttProviderTarget(
      `https://www.jiohotstar.com/in/search?q=${encodedTitle}`,
      `https://www.jiohotstar.com/in/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('hotstar')) {
    return buildOttProviderTarget(
      `https://www.hotstar.com/in/search?q=${encodedTitle}`,
      `https://www.hotstar.com/in/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('disney')) {
    return buildOttProviderTarget(
      `https://www.disneyplus.com/search?q=${encodedTitle}`,
      `https://www.disneyplus.com/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('aha')) {
    return buildOttProviderTarget(
      `https://www.aha.video/search?q=${encodedTitle}`,
      `https://www.aha.video/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('apple')) {
    return buildOttProviderTarget(
      `https://tv.apple.com/search?term=${encodedTitle}`,
      `https://tv.apple.com/search?term=${encodedTitle}`,
    );
  }
  if (lowerName.includes('zee5')) {
    return buildOttProviderTarget(
      `https://www.zee5.com/search?q=${encodedTitle}`,
      `https://www.zee5.com/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('sony') || lowerName.includes('sonyliv')) {
    return buildOttProviderTarget(
      `https://www.sonyliv.com/search?searchTerm=${encodedTitle}`,
      `https://www.sonyliv.com/search?searchTerm=${encodedTitle}`,
    );
  }
  if (lowerName.includes('jio') && (lowerName.includes('cinema') || lowerName.includes('cinema premium'))) {
    return buildOttProviderTarget(
      `https://www.jiocinema.com/search/${encodedTitle}`,
      `https://www.jiocinema.com/search/${encodedTitle}`,
    );
  }
  if (lowerName.includes('youtube')) {
    return buildOttProviderTarget(
      `https://www.youtube.com/results?search_query=${encodedTitle}`,
      `youtube://www.youtube.com/results?search_query=${encodedTitle}`,
    );
  }
  if (lowerName.includes('hulu')) {
    return buildOttProviderTarget(
      `https://www.hulu.com/search?q=${encodedTitle}`,
      `https://www.hulu.com/search?q=${encodedTitle}`,
    );
  }
  if (lowerName === 'max' || lowerName.includes('hbo')) {
    return buildOttProviderTarget(
      `https://play.max.com/search?q=${encodedTitle}`,
      `https://play.max.com/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('peacock')) {
    return buildOttProviderTarget(
      `https://www.peacocktv.com/search?q=${encodedTitle}`,
      `https://www.peacocktv.com/search?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('paramount')) {
    return buildOttProviderTarget(
      `https://www.paramountplus.com/search/?q=${encodedTitle}`,
      `https://www.paramountplus.com/search/?q=${encodedTitle}`,
    );
  }
  if (lowerName.includes('crunchyroll')) {
    return buildOttProviderTarget(
      `https://www.crunchyroll.com/search?q=${encodedTitle}`,
      `https://www.crunchyroll.com/search?q=${encodedTitle}`,
    );
  }
  return null;
}

function collectProvidersByRegion(
  providers: TMDBWatchProviders | null,
  regions: readonly WatchRegion[],
): TMDBWatchProviderEntry[] {
  if (!providers?.results) return [];

  const seen = new Set<number>();
  const merged: TMDBWatchProviderEntry[] = [];

  for (const region of regions) {
    const flat = providers.results[region]?.flatrate || [];
    for (const provider of flat) {
      if (seen.has(provider.provider_id)) continue;
      seen.add(provider.provider_id);
      merged.push(provider);
    }
  }

  return merged;
}

export async function getMovieWatchProviders(movieId: number): Promise<TMDBWatchProviders | null> {
  try {
    return await fetchTmdbWithProxy<TMDBWatchProviders>(
      buildTmdbV3Url(`/3/movie/${movieId}/watch/providers`),
    );
  } catch {
    return null;
  }
}

export async function getTvWatchProviders(tvId: number): Promise<TMDBWatchProviders | null> {
  try {
    return await fetchTmdbWithProxy<TMDBWatchProviders>(
      buildTmdbV3Url(`/3/tv/${tvId}/watch/providers`),
    );
  } catch {
    return null;
  }
}

export async function getStreamingProvidersForTitle(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<TMDBWatchProviderEntry[]> {
  const providers =
    mediaType === 'movie'
      ? await getMovieWatchProviders(tmdbId)
      : await getTvWatchProviders(tmdbId);

  return collectProvidersByRegion(providers, WATCH_REGIONS);
}

export function tmdbWatchProvidersToOttLinks(
  providers: TMDBWatchProviders | null,
  title: string,
): OTTLink[] {
  const results = providers?.results;
  if (!results) return [];

  const regionLabels: Record<string, string> = { IN: 'India', US: 'USA' };
  const byPlatform = new Map<
    string,
    {
      appUrl?: string;
      browserUrl?: string;
      logoPath?: string;
      platform: string;
      regions: Set<string>;
      url?: string;
    }
  >();

  for (const [region, label] of Object.entries(regionLabels)) {
    const regionProviders = results[region];
    if (!regionProviders) continue;

    const providerList: TMDBWatchProviderEntry[] = [
      ...(regionProviders.flatrate ?? []),
      ...(regionProviders.free ?? []),
      ...(regionProviders.ads ?? []),
      ...(regionProviders.rent ?? []),
      ...(regionProviders.buy ?? []),
    ];

    for (const provider of providerList) {
      const name = (provider.provider_name ?? '').trim();
      if (!name) continue;

      const key = normalizeWatchProviderKey(name);
      if (!key) continue;

      const providerTarget = getDirectOttTarget(name, title);
      if (!providerTarget) continue;

      const previous =
        byPlatform.get(key) ?? {
          platform: name,
          regions: new Set<string>(),
          url: providerTarget.browserUrl,
          browserUrl: providerTarget.browserUrl,
          appUrl: providerTarget.appUrl,
        };

      previous.regions.add(label);
      if (!previous.logoPath && provider.logo_path) previous.logoPath = provider.logo_path;
      previous.url = providerTarget.browserUrl;
      previous.browserUrl = providerTarget.browserUrl;
      previous.appUrl = providerTarget.appUrl;
      if (previous.platform.length > name.length) previous.platform = name;
      byPlatform.set(key, previous);
    }
  }

  const links: OTTLink[] = [];
  for (const meta of byPlatform.values()) {
    links.push({
      platform: meta.platform,
      url: meta.url || meta.browserUrl || '',
      browserUrl: meta.browserUrl,
      appUrl: meta.appUrl,
      availableIn: Array.from(meta.regions).join(' & '),
      logoPath: meta.logoPath,
    });
  }

  return links;
}
