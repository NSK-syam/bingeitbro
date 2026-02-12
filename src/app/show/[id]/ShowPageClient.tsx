'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SendToFriendModal } from '@/components/SendToFriendModal';
import { WatchlistButton } from '@/components/WatchlistButton';
import { WatchedButton } from '@/components/WatchedButton';
import { useAuth } from '@/components/AuthProvider';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import { getImageUrl, getLanguageName, tmdbWatchProvidersToOttLinks } from '@/lib/tmdb';
import type { OTTLink, Recommendation } from '@/types';
import { TrailerSection } from '@/components';

interface ShowPageClientProps {
  id: string;
}

type TMDBTVDetailsAny = {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  original_language: string;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
};

export default function ShowPageClient({ id }: ShowPageClientProps) {
  const searchParams = useSearchParams();
  const backUrl = '/shows';
  const { user } = useAuth();

  const [resolvedId, setResolvedId] = useState(id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [show, setShow] = useState<Recommendation | null>(null);
  const [ottLinks, setOttLinks] = useState<OTTLink[]>([]);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendRecommendationId, setSendRecommendationId] = useState<string | null>(null);
  const [tmdbTrailerId, setTmdbTrailerId] = useState<number | null>(null);

  useEffect(() => {
    if (id === 'fallback' && typeof window !== 'undefined') {
      const fromPath = window.location.pathname.replace(/^\/show\/?/, '').trim();
      if (fromPath && fromPath !== 'fallback') setResolvedId(fromPath);
      else if (fromPath === 'fallback') {
        setError(true);
        setLoading(false);
      }
    }
  }, [id]);

  const isUuid = useMemo(
    () => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolvedId),
    [resolvedId],
  );

  useEffect(() => {
    if (resolvedId === 'fallback') return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    void (async () => {
      try {
        // If this is a UUID, fetch from Supabase recommendations (series only).
        if (isUuid) {
          if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
          const supabase = createClient();
          const { data, error } = await supabase.from('recommendations').select('*').eq('id', resolvedId).single();
          if (error) throw error;
          if (!data) throw new Error('Not found');

          const rec = data as any;
          const mapped: Recommendation = {
            id: rec.id,
            title: rec.title,
            originalTitle: rec.original_title ?? undefined,
            year: rec.year,
            type: rec.type,
            poster: rec.poster,
            backdrop: rec.backdrop,
            genres: Array.isArray(rec.genres) ? rec.genres : [],
            language: rec.language ?? '',
            duration: rec.duration ?? undefined,
            rating: rec.rating ?? undefined,
            personalNote: rec.personal_note ?? '',
            mood: rec.mood ?? [],
            watchWith: rec.watch_with ?? undefined,
            ottLinks: (rec.ott_links ?? []) as OTTLink[],
            recommendedBy: { id: rec.user_id, name: 'User', avatar: '🎬' },
            addedOn: rec.created_at,
          };

          if (!cancelled) {
            setShow(mapped);
            setOttLinks(mapped.ottLinks || []);
            const rawTmdb = (rec as any)?.tmdb_id;
            const num = typeof rawTmdb === 'number' ? rawTmdb : Number(String(rawTmdb || ''));
            setTmdbTrailerId(Number.isFinite(num) && num > 0 ? num : null);
          }
          return;
        }

        // TMDB tv id: "tmdbtv-123" or "123"
        const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
        if (!apiKey) throw new Error('TMDB API not configured');
        const raw = resolvedId.startsWith('tmdbtv-') ? resolvedId.replace('tmdbtv-', '') : resolvedId;
        if (!/^\d+$/.test(raw)) throw new Error('Invalid id');
        const tmdbId = raw;

        const [tvRes, providersRes] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}`),
          fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/watch/providers?api_key=${apiKey}`),
        ]);
        if (!tvRes.ok) throw new Error('Not found');
        const tv = (await tvRes.json()) as TMDBTVDetailsAny;
        const providers = providersRes.ok ? await providersRes.json() : null;

        const year = tv.first_air_date ? new Date(tv.first_air_date).getFullYear() : new Date().getFullYear();
        const links = tmdbWatchProvidersToOttLinks(providers, tv.name, Number(tmdbId), 'tv');

        const mapped: Recommendation = {
          id: `tmdbtv-${tv.id}`,
          title: tv.name,
          originalTitle: tv.original_name && tv.original_name !== tv.name ? tv.original_name : undefined,
          year,
          type: 'series',
          poster: getImageUrl(tv.poster_path),
          backdrop: getImageUrl(tv.backdrop_path, 'original'),
          genres: (tv.genres || []).map((g) => g.name),
          language: getLanguageName(tv.original_language),
          duration: '',
          rating: tv.vote_average ? Math.round(tv.vote_average * 10) / 10 : undefined,
          personalNote: tv.overview || '',
          mood: [],
          watchWith: undefined,
          ottLinks: links,
          recommendedBy: { id: 'tmdb', name: 'TMDB', avatar: '📺' },
          addedOn: new Date().toISOString(),
        };

        if (!cancelled) {
          setShow(mapped);
          setOttLinks(links);
          setTmdbTrailerId(Number(tmdbId));
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolvedId, isUuid]);

  const ensureRecommendationId = async (): Promise<string | null> => {
    if (!user || !show) return null;
    if (isUuid) return show.id;
    if (!isSupabaseConfigured()) return null;
    const supabase = createClient();

    const tmdbId = show.id.startsWith('tmdbtv-') ? Number(show.id.replace('tmdbtv-', '')) : null;
    if (!tmdbId || Number.isNaN(tmdbId)) return null;

    const { data: existing } = await supabase
      .from('recommendations')
      .select('id')
      .eq('user_id', user.id)
      .eq('type', 'series')
      .eq('tmdb_id', tmdbId)
      .limit(1);
    if (Array.isArray(existing) && existing[0]?.id) return existing[0].id as string;

    const { data: inserted, error } = await supabase
      .from('recommendations')
      .insert({
        user_id: user.id,
        title: show.title,
        original_title: show.originalTitle && show.originalTitle !== show.title ? show.originalTitle : null,
        year: show.year ?? new Date().getFullYear(),
        type: 'series',
        poster: show.poster,
        backdrop: show.backdrop || null,
        genres: Array.isArray(show.genres) ? show.genres : [],
        language: show.language || '',
        duration: show.duration || null,
        rating: show.rating ?? null,
        personal_note: 'Recommended',
        mood: [],
        watch_with: null,
        ott_links: show.ottLinks || [],
        tmdb_id: tmdbId,
      })
      .select('id')
      .single();

    if (error || !inserted?.id) return null;
    return inserted.id as string;
  };

  const title = show?.title ?? 'Show';
  const poster = show?.poster ?? '';
  const backdrop = show?.backdrop || poster;
  const year = show?.year ?? undefined;
  const getPreferredOttUrl = (platform: string, url: string) => {
    const lower = (platform || '').toLowerCase();
    if (lower.includes('prime') || lower.includes('amazon')) {
      if (url?.includes('primevideo.com')) {
        return url.replace('https://www.primevideo.com', 'https://app.primevideo.com');
      }
      return `https://app.primevideo.com/search?phrase=${encodeURIComponent(title)}`;
    }
    return url;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !show) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">😕</div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Show not found</h1>
        <Link href={backUrl} className="text-[var(--accent)] hover:underline">
          Back to Shows
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0">
          <img src={backdrop} alt="" className="w-full h-full object-cover opacity-40 blur-sm scale-105" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/55 to-black/85" />
      </div>

      <header className="relative z-10 sticky top-0 bg-[var(--bg-primary)]/70 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <Link href={backUrl} className="text-[var(--accent)] hover:underline flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>

          <div className="flex items-center gap-2">
            <WatchedButton movieId={show.id} />
            <WatchlistButton movieId={show.id} title={show.title} poster={show.poster} />
            <button
              type="button"
              className="px-3 py-2 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-semibold"
              onClick={async () => {
                const recId = await ensureRecommendationId();
                if (!recId) return;
                setSendRecommendationId(recId);
                setSendModalOpen(true);
              }}
              title={user ? 'Send to friend' : 'Sign in to send'}
              disabled={!user}
            >
              Send
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Series</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{title}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {year ?? '—'} • {show.language || '—'} {show.rating ? `• ${Number(show.rating).toFixed(1)} ★` : ''}
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[220px_minmax(0,1.8fr)_minmax(0,0.8fr)] items-start">
          <div className="relative">
            <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/20">
              <img src={poster} alt={`${title} poster`} className="w-full h-auto object-cover" />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-[var(--bg-card)] border border-white/10 rounded-2xl p-4">
              <div className="text-lg font-semibold text-[var(--text-primary)]">Context</div>
              <p className="mt-3 text-sm text-[var(--text-secondary)] leading-relaxed">
                {show.personalNote || 'No description available for this title yet.'}
              </p>
            </div>

            {tmdbTrailerId ? (
              <TrailerSection tmdbId={tmdbTrailerId} mediaType="tv" title={title} />
            ) : null}
          </div>

          <div className="bg-[var(--bg-card)] border border-white/10 rounded-2xl p-4">
            <div className="text-lg font-semibold text-[var(--text-primary)]">Where to watch</div>
            {ottLinks.length === 0 ? (
              <div className="mt-2 text-sm text-[var(--text-muted)]">
                No streaming info found. Try searching on JustWatch.
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {ottLinks.slice(0, 8).map((l) => (
                  <a
                    key={`${l.platform}-${l.url}`}
                    href={getPreferredOttUrl(l.platform, l.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--bg-secondary)] border border-white/10 hover:bg-[var(--bg-card-hover)] transition-colors"
                  >
                    {l.logoPath ? (
                      <img src={`https://image.tmdb.org/t/p/w92${l.logoPath}`} alt={l.platform} className="h-4 w-4 object-contain" />
                    ) : null}
                    <span className="text-sm text-[var(--text-primary)]">{l.platform}</span>
                    <span className="text-xs text-[var(--text-muted)]">{l.availableIn || ''}</span>
                  </a>
                ))}
              </div>
            )}
            <div className="mt-4">
              <a
                href={`https://www.justwatch.com/${(searchParams.get('region') || 'us').toLowerCase()}/search?q=${encodeURIComponent(title)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[var(--accent)] hover:underline text-sm"
              >
                Search on JustWatch
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>
      </main>

      {sendModalOpen && sendRecommendationId && (
        <SendToFriendModal
          isOpen={sendModalOpen}
          onClose={() => setSendModalOpen(false)}
          movieId={sendRecommendationId}
          movieTitle={title}
          moviePoster={poster}
          movieYear={year}
          recommendationId={sendRecommendationId}
        />
      )}
    </div>
  );
}
