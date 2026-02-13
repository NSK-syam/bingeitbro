'use client';

import { useEffect, useState } from 'react';
import { getRenderProfile } from '@/lib/render-profile';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

const CACHE_KEY = 'bib-show-bg-posters-v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const QUERY_LIMIT = 7;
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

  const minPool = posters.length < 20 ? [...posters, ...posters, ...posters] : posters;
  const posterPool = [...minPool, ...minPool];
  const rows: string[][] = [];
  const wallRowCount = 5;
  const postersPerRow = 16;

  for (let rowIndex = 0; rowIndex < wallRowCount; rowIndex += 1) {
    const start = (rowIndex * 3) % minPool.length;
    const rowItems: string[] = [];
    for (let i = 0; i < postersPerRow; i += 1) {
      rowItems.push(posterPool[(start + i) % posterPool.length]);
    }
    rows.push([...rowItems, ...rowItems]);
  }

  return (
    <>
      <style jsx global>{`
        @keyframes showPosterWallLeft {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }

        @keyframes showPosterWallRight {
          0% {
            transform: translate3d(-50%, 0, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        .show-poster-wall-track {
          display: flex;
          gap: 6px;
          width: max-content;
          will-change: transform;
          transform: translateZ(0);
        }

        .show-poster-wall-left {
          animation: showPosterWallLeft 36s steps(12, end) infinite;
        }

        .show-poster-wall-right {
          animation: showPosterWallRight 36s steps(12, end) infinite;
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
          style={{
            position: 'absolute',
            inset: '-30px 0',
            zIndex: 0,
            opacity: 0.58,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          {rows.map((rowPosters, rowIndex) => (
            <div
              key={`show-wall-row-${rowIndex}`}
              style={{
                overflow: 'hidden',
              }}
            >
              <div
                className={`show-poster-wall-track ${rowIndex % 2 === 0 ? 'show-poster-wall-left' : 'show-poster-wall-right'}`}
                style={{
                  animationDelay: `-${rowIndex * 1.5}s`,
                }}
              >
                {rowPosters.map((poster, index) => (
                  <div
                    key={`show-wall-poster-${rowIndex}-${index}`}
                    style={{
                      width: 'clamp(72px, 8vw, 124px)',
                      aspectRatio: '2/3',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      boxShadow: '0 10px 26px rgba(0,0,0,0.36)',
                    }}
                  >
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
          ))}
        </div>
      </div>
    </>
  );
}
