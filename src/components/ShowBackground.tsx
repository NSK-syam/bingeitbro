'use client';

import { useEffect, useState } from 'react';
import { getRenderProfile } from '@/lib/render-profile';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

const CACHE_KEY = 'bib-show-bg-posters-v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
// Keep this low to avoid TMDB rate limiting on cold loads.
const QUERY_LIMIT = 3;
const POSTERS_PER_QUERY = 6;
const MAX_POSTERS = 56;

let inMemoryCache: { posters: string[]; ts: number } | null = null;

export function ShowBackground() {
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
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!apiKey) return;

      try {
        const queries = [
          `https://api.themoviedb.org/3/tv/popular?api_key=${apiKey}&language=en-US&page=1`,
          `https://api.themoviedb.org/3/tv/top_rated?api_key=${apiKey}&language=en-US&page=1`,
          `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_original_language=hi&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_original_language=te&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_original_language=ta&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_original_language=ko&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_original_language=ja&sort_by=popularity.desc&page=1`,
          `https://api.themoviedb.org/3/discover/tv?api_key=${apiKey}&with_original_language=es&sort_by=popularity.desc&page=1`,
        ];

        const allPosters: string[] = [];
        const settled = await Promise.allSettled(
          queries.slice(0, QUERY_LIMIT).map((url) =>
            fetchTmdbWithProxy(url, { signal: controller.signal }).then((res) => res.json())
          )
        );

        for (const result of settled) {
          if (result.status !== 'fulfilled' || !Array.isArray(result.value?.results)) continue;
          const list = result.value.results;
          const posters = list
            .filter((m: { poster_path: string | null }) => m.poster_path)
            .slice(0, POSTERS_PER_QUERY)
            .map((m: { poster_path: string }) => m.poster_path);
          allPosters.push(...posters);
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
        console.error('Failed to fetch show posters:', error);
      }
    };

    fetchPosters();

    return () => {
      controller.abort();
    };
  }, [lightMode]);

  if (posters.length === 0 || lightMode) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(860px 520px at 82% 0%, rgba(59,130,246,0.1) 0%, rgba(0,0,0,0) 64%), linear-gradient(to bottom, rgba(10,10,12,0.6) 0%, rgba(10,10,12,0.82) 100%)',
        }}
      />
    );
  }

  const all = posters.length > 0 ? [...posters, ...posters] : [];

  return (
    <>
      <style jsx global>{`
        @keyframes scrollShowPosters {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .show-poster-scroll {
          animation: scrollShowPosters 125s linear infinite;
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(920px 480px at 80% 0%, rgba(59,130,246,0.16) 0%, rgba(10,10,12,0) 70%), linear-gradient(to bottom, rgba(10,10,12,0.44) 0%, rgba(10,10,12,0.66) 52%, rgba(10,10,12,0.82) 100%)',
            zIndex: 1,
          }}
        />
        <div
          className="show-poster-scroll"
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
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
