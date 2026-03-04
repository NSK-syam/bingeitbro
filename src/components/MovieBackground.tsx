'use client';

import { useEffect, useState } from 'react';
import { getRenderProfile } from '@/lib/render-profile';
import { buildTmdbV3Url, fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

const CACHE_KEY = 'bib-movie-bg-posters-v5';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Keep this low to avoid TMDB rate limiting on cold loads.
const QUERY_LIMIT = 8;
const POSTERS_PER_QUERY = 6;
const MAX_POSTERS = 56;
const MIN_RENDER_POSTERS = 24;

let inMemoryCache: { posters: string[]; ts: number } | null = null;

function normalizePosterPool(input: string[]): string[] {
  if (input.length === 0) return [];
  const base = [...input];
  if (base.length >= MIN_RENDER_POSTERS) return base.slice(0, MAX_POSTERS);

  // Ensure we always have enough cards to fill the background grid, even when TMDB returns few posters.
  const expanded: string[] = [];
  while (expanded.length < MIN_RENDER_POSTERS) {
    expanded.push(...base.sort(() => Math.random() - 0.5));
  }
  return expanded.slice(0, Math.min(MAX_POSTERS, MIN_RENDER_POSTERS));
}

export function MovieBackground() {
  const [posters, setPosters] = useState<string[]>([]);
  const [lightMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return getRenderProfile().lowPerformance;
  });

  useEffect(() => {
    if (lightMode) return undefined;

    if (inMemoryCache && Date.now() - inMemoryCache.ts < CACHE_TTL_MS && inMemoryCache.posters.length > 0) {
      const cached = inMemoryCache.posters;
      const timer = window.setTimeout(() => setPosters(cached), 0);
      return () => window.clearTimeout(timer);
    }

    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { posters?: string[]; ts?: number };
        if (
          Array.isArray(parsed.posters) &&
          parsed.posters.length > 0 &&
          typeof parsed.ts === 'number' &&
          Date.now() - parsed.ts < CACHE_TTL_MS
        ) {
          inMemoryCache = { posters: parsed.posters, ts: parsed.ts };
          const cached = parsed.posters;
          const timer = window.setTimeout(() => setPosters(cached), 0);
          return () => window.clearTimeout(timer);
        }
      }
    } catch {
      // Ignore cache parse/storage failures
    }

    const controller = new AbortController();

    const fetchPosters = async () => {
      try {
        const featuredItemQueries = [
          // Pin RRR so it reliably appears in the background mix.
          buildTmdbV3Url('/3/movie/579974', { language: 'en-US' }),
        ];

        const queries = [
          buildTmdbV3Url('/3/movie/popular', { language: 'en-US', region: 'US', page: 1 }),
          buildTmdbV3Url('/3/movie/top_rated', { language: 'en-US', region: 'US', page: 1 }),
          buildTmdbV3Url('/3/discover/movie', { with_original_language: 'te', sort_by: 'popularity.desc', page: 1 }),
          buildTmdbV3Url('/3/discover/movie', { with_original_language: 'te', sort_by: 'popularity.desc', page: 2 }),
          buildTmdbV3Url('/3/discover/movie', { with_original_language: 'en', sort_by: 'popularity.desc', page: 2 }),
          buildTmdbV3Url('/3/tv/popular', { language: 'en-US', page: 1 }),
          buildTmdbV3Url('/3/tv/top_rated', { language: 'en-US', page: 1 }),
          buildTmdbV3Url('/3/discover/movie', { with_original_language: 'hi', sort_by: 'popularity.desc', page: 1 }),
          buildTmdbV3Url('/3/discover/movie', { with_original_language: 'ta', sort_by: 'popularity.desc', page: 1 }),
        ];

        const queryBatch = queries.slice(0, QUERY_LIMIT);
        const [featuredSettled, settled] = await Promise.all([
          Promise.allSettled(
            featuredItemQueries.map((url) =>
              fetchTmdbWithProxy(url, { signal: controller.signal }).then((res) => res.json())
            )
          ),
          queryBatch.length
            ? Promise.allSettled(
                queryBatch.map((url) =>
                  fetchTmdbWithProxy(url, { signal: controller.signal }).then((res) => res.json())
                )
              )
            : Promise.resolve([]),
        ]);

        const allPosters: string[] = [];

        for (const result of featuredSettled) {
          if (result.status !== 'fulfilled') continue;
          const posterPath =
            typeof (result.value as { poster_path?: unknown })?.poster_path === 'string'
              ? ((result.value as { poster_path: string }).poster_path)
              : '';
          if (posterPath) allPosters.push(posterPath);
        }

        for (const result of settled) {
          if (result.status !== 'fulfilled' || !Array.isArray(result.value?.results)) continue;
          const moviePosters = result.value.results
              .filter((m: { poster_path: string | null }) => m.poster_path)
              .slice(0, POSTERS_PER_QUERY)
              .map((m: { poster_path: string }) => m.poster_path);
          allPosters.push(...moviePosters);
        }

        const deduped = Array.from(new Set(allPosters));
        const shuffled = deduped.sort(() => Math.random() - 0.5).slice(0, MAX_POSTERS);
        const normalized = normalizePosterPool(shuffled);
        inMemoryCache = { posters: normalized, ts: Date.now() };
        setPosters(normalized);
        try {
          window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(inMemoryCache));
        } catch {
          // Ignore storage quota errors
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch movie posters:', error);
      }
    };

    fetchPosters();

    return () => {
      controller.abort();
    };
  }, [lightMode]);

  if (posters.length === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(820px 500px at 20% 0%, rgba(245,158,11,0.1) 0%, rgba(0,0,0,0) 65%), linear-gradient(to bottom, rgba(10,10,12,0.58) 0%, rgba(10,10,12,0.8) 100%)',
        }}
      />
    );
  }

  if (lightMode) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(780px 460px at 22% 0%, rgba(245,158,11,0.11) 0%, rgba(0,0,0,0) 64%), linear-gradient(to bottom, rgba(10,10,12,0.62) 0%, rgba(10,10,12,0.82) 100%)',
        }}
      />
    );
  }

  const all = posters.length > 0 ? [...posters, ...posters] : [];

  return (
    <>
      <style jsx global>{`
        @keyframes scrollMoviePosters {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .movie-poster-scroll {
          animation: scrollMoviePosters 125s linear infinite;
          will-change: transform;
          transform: translateZ(0);
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(900px 460px at 24% 2%, rgba(245,158,11,0.16) 0%, rgba(10,10,12,0) 70%), linear-gradient(to bottom, rgba(10,10,12,0.45) 0%, rgba(10,10,12,0.68) 54%, rgba(10,10,12,0.82) 100%)',
            zIndex: 1,
          }}
        />
        <div
          className="movie-poster-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: '3px',
            opacity: 0.42,
          }}
        >
          {all.map((poster, index) => (
            <div key={index} style={{ aspectRatio: '2/3', overflow: 'hidden' }}>
              <img
                src={`https://image.tmdb.org/t/p/w185${poster}`}
                alt=""
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
