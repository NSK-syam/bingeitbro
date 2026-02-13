'use client';

import { useEffect, useState } from 'react';
import { getRenderProfile } from '@/lib/render-profile';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

const CACHE_KEY = 'bib-movie-bg-posters-v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const QUERY_LIMIT = 7;
const POSTERS_PER_QUERY = 6;
const MAX_POSTERS = 56;

let inMemoryCache: { posters: string[]; ts: number } | null = null;

export function MovieBackground() {
  const [posters, setPosters] = useState<string[]>([]);
  const [lightMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return getRenderProfile().lowPerformance;
  });

  useEffect(() => {
    if (lightMode) return undefined;

    if (inMemoryCache && Date.now() - inMemoryCache.ts < CACHE_TTL_MS) {
      const cached = inMemoryCache.posters;
      const timer = window.setTimeout(() => setPosters(cached), 0);
      return () => window.clearTimeout(timer);
    }

    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { posters?: string[]; ts?: number };
        if (Array.isArray(parsed.posters) && typeof parsed.ts === 'number' && Date.now() - parsed.ts < CACHE_TTL_MS) {
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
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!apiKey) return;

      try {
        const queries = [
          `https://api.themoviedb.org/3/movie/popular?api_key=${apiKey}&language=en-US&region=US&page=1`,
          `https://api.themoviedb.org/3/movie/top_rated?api_key=${apiKey}&language=en-US&region=US&page=1`,
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=hi&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=te&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=ta&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=ko&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=ja&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&with_original_language=es&sort_by=popularity.desc&page=1`,
        ];

        const settled = await Promise.allSettled(
          queries.slice(0, QUERY_LIMIT).map((url) =>
            fetchTmdbWithProxy(url, { signal: controller.signal }).then((res) => res.json())
          )
        );

        const allPosters: string[] = [];
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
        inMemoryCache = { posters: shuffled, ts: Date.now() };
        setPosters(shuffled);
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
