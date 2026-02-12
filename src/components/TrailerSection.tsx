'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

type MediaType = 'movie' | 'tv';

type TMDBVideo = {
  site?: string;
  type?: string;
  key?: string;
  name?: string;
  official?: boolean;
  published_at?: string;
  size?: number;
};

function pickBestYouTubeVideo(videos: TMDBVideo[]): TMDBVideo | null {
  const list = (videos || [])
    .filter((v) => (v.site || '').toLowerCase() === 'youtube' && Boolean(v.key))
    .filter((v) => {
      const t = (v.type || '').toLowerCase();
      return t === 'trailer' || t === 'teaser';
    });

  if (list.length === 0) return null;

  const score = (v: TMDBVideo) => {
    const type = (v.type || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    const official = v.official ? 1 : 0;
    const isTrailer = type === 'trailer' ? 1 : 0;
    const hasOfficialWord = name.includes('official') ? 1 : 0;
    const size = typeof v.size === 'number' ? v.size : 0;
    const published = v.published_at ? Date.parse(v.published_at) : 0;
    return (
      isTrailer * 1_000_000 +
      official * 200_000 +
      hasOfficialWord * 40_000 +
      size * 500 +
      (Number.isFinite(published) ? published / 1_000_000 : 0)
    );
  };

  return [...list].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function TrailerSection({
  tmdbId,
  mediaType,
  title,
}: {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [video, setVideo] = useState<TMDBVideo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
    if (!apiKey) {
      setLoading(false);
      setError('TMDB not configured');
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError('');
    setVideo(null);
    setOpen(false);

    void (async () => {
      try {
        const res = await fetchTmdbWithProxy(
          `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/videos?api_key=${apiKey}`,
          { signal: controller.signal }
        );
        const json = await res.json().catch(() => null);
        const results = Array.isArray(json?.results) ? (json.results as TMDBVideo[]) : [];
        const best = pickBestYouTubeVideo(results);
        if (!cancelled) setVideo(best);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load trailer');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [tmdbId, mediaType]);

  const youtube = useMemo(() => {
    if (!video?.key) return null;
    const key = String(video.key);
    return {
      key,
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`,
      embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(key)}?autoplay=1&mute=0&rel=0`,
      thumb: `https://img.youtube.com/vi/${encodeURIComponent(key)}/hqdefault.jpg`,
      name: video.name || 'Trailer',
    };
  }, [video]);

  const fallbackSearch = useMemo(() => {
    const q = `${title} trailer`;
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
  }, [title]);

  return (
    <section className="bg-[var(--bg-card)] rounded-2xl p-6 sm:p-7 border border-white/5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Trailer</h2>
        {youtube?.watchUrl && (
          <a
            href={youtube.watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] transition-colors border border-white/10"
            title="Open on YouTube"
          >
            YouTube
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h6m0 0v6m0-6L7 17" />
            </svg>
          </a>
        )}
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          Loading trailer...
        </div>
      ) : youtube ? (
        <div className="mt-4">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="group w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20 hover:bg-black/30 transition-colors text-left"
              title="Play trailer"
            >
              <div className="relative aspect-video">
                <img
                  src={youtube.thumb}
                  alt={`${title} trailer thumbnail`}
                  className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="h-14 w-14 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] grid place-items-center shadow-[0_16px_50px_rgba(245,158,11,0.25)] group-hover:scale-105 transition-transform">
                    <svg className="w-7 h-7 translate-x-[1px]" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M4 4.5a1 1 0 0 1 1.6-.8l9 6.5a1 1 0 0 1 0 1.6l-9 6.5A1 1 0 0 1 4 17.5v-13z" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white line-clamp-1">{youtube.name}</div>
                  <div className="text-[11px] text-white/80 bg-black/40 border border-white/10 rounded-full px-2 py-1">
                    Tap to play
                  </div>
                </div>
              </div>
            </button>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
              <div className="relative aspect-video">
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={youtube.embedUrl}
                  title={`${title} trailer`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <div className="p-3 flex items-center justify-between gap-3">
                <div className="text-xs text-[var(--text-muted)]">Playing from YouTube</div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <div className="text-sm text-[var(--text-muted)]">
            {error ? 'Trailer unavailable right now.' : 'No trailer found for this title.'}
          </div>
          <a
            href={fallbackSearch}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--bg-primary)] shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg"
          >
            Search on YouTube
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h6m0 0v6m0-6L7 17" />
            </svg>
          </a>
        </div>
      )}
    </section>
  );
}
