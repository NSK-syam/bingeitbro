'use client';

import { useEffect, useState } from 'react';
import { getRenderProfile } from '@/lib/render-profile';

const CACHE_KEY = 'bib-song-bg-artworks-v2';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const REQUEST_LIMIT = 52;
const MAX_ARTWORKS = 60;

let inMemoryCache: { artworks: string[]; ts: number } | null = null;

export function SongBackground() {
  const [artworks, setArtworks] = useState<string[]>([]);
  const [lightMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return getRenderProfile().lowPerformance;
  });

  useEffect(() => {
    if (lightMode) return undefined;

    if (inMemoryCache && Date.now() - inMemoryCache.ts < CACHE_TTL_MS) {
      const cached = inMemoryCache.artworks;
      const timer = window.setTimeout(() => setArtworks(cached), 0);
      return () => window.clearTimeout(timer);
    }

    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { artworks?: string[]; ts?: number };
        if (Array.isArray(parsed.artworks) && typeof parsed.ts === 'number' && Date.now() - parsed.ts < CACHE_TTL_MS) {
          inMemoryCache = { artworks: parsed.artworks, ts: parsed.ts };
          const cached = parsed.artworks;
          const timer = window.setTimeout(() => setArtworks(cached), 0);
          return () => window.clearTimeout(timer);
        }
      }
    } catch {
      // Ignore cache parse/storage failures
    }

    const controller = new AbortController();

    const fetchArt = async () => {
      try {
        const res = await fetch(
          `/api/song-artworks?countries=us,gb,in,es,mx&limit=${REQUEST_LIMIT}`,
          { signal: controller.signal, cache: 'force-cache' }
        );
        const json = await res.json().catch(() => null);
        const list = Array.isArray(json?.artworks) ? (json.artworks as string[]) : [];
        const shuffled = Array.from(new Set(list)).sort(() => Math.random() - 0.5).slice(0, MAX_ARTWORKS);
        inMemoryCache = { artworks: shuffled, ts: Date.now() };
        setArtworks(shuffled);
        try {
          window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(inMemoryCache));
        } catch {
          // Ignore storage quota errors
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Failed to fetch song artworks:', err);
      }
    };
    fetchArt();
    return () => {
      controller.abort();
    };
  }, [lightMode]);

  const all = artworks.length > 0 ? [...artworks, ...artworks] : [];

  if (lightMode || artworks.length === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(900px 520px at 18% 0%, rgba(255,180,80,0.11) 0%, rgba(0,0,0,0) 65%), radial-gradient(980px 560px at 82% 0%, rgba(110,231,255,0.09) 0%, rgba(0,0,0,0) 66%), linear-gradient(to bottom, rgba(10,10,12,0.6) 0%, rgba(10,10,12,0.82) 100%)',
        }}
      />
    );
  }

  return (
    <>
      <style jsx global>{`
        @keyframes scrollSongArtworks {
          0% { transform: translateY(0); }
          100% { transform: translateY(-50%); }
        }
        .song-art-scroll {
          animation: scrollSongArtworks 125s linear infinite;
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
              'radial-gradient(900px 520px at 20% 0%, rgba(255,180,80,0.18) 0%, rgba(0,0,0,0) 65%), radial-gradient(980px 560px at 80% 0%, rgba(110,231,255,0.14) 0%, rgba(0,0,0,0) 66%), linear-gradient(to bottom, rgba(10,10,12,0.5) 0%, rgba(10,10,12,0.68) 55%, rgba(10,10,12,0.86) 100%)',
            zIndex: 1,
          }}
        />
        <div
          className="song-art-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: '3px',
            opacity: 0.42,
          }}
        >
          {all.map((art, index) => (
            <div key={index} style={{ aspectRatio: '2/3', overflow: 'hidden' }}>
              <img
                src={art}
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
