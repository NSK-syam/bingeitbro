'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { SendToFriendModal } from '@/components/SendToFriendModal';
import { WatchlistPlusButton } from '@/components/WatchlistPlusButton';
import { useAuth } from '@/components/AuthProvider';
import { useIosReviewMode } from '@/hooks/useIosReviewMode';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';
import type { AdminRecommendation, AdminRecommendationGroup } from '@/data/admin-recommendations';

type AdminRecommendationsShelfProps = {
  title: string;
  kicker?: string;
  description: string;
  groups: AdminRecommendationGroup[];
  ctaHref?: string;
  ctaLabel?: string;
};

const getProviderLogoUrl = (logoPath?: string) =>
  logoPath ? `https://image.tmdb.org/t/p/w92${logoPath}` : '';

type SendModalPayload = {
  movieId: string;
  movieTitle: string;
  moviePoster: string;
  movieYear?: number;
  tmdbId?: string;
  recommendationId?: string;
};

export function AdminRecommendationsShelf({
  title,
  kicker = 'Admin picks',
  description,
  groups,
  ctaHref,
  ctaLabel = 'Open full library',
}: AdminRecommendationsShelfProps) {
  const [languageFilter, setLanguageFilter] = useState('all');
  const [ottFilter, setOttFilter] = useState('all');
  const [sendModalPayload, setSendModalPayload] = useState<SendModalPayload | null>(null);
  const [sendingCardId, setSendingCardId] = useState<string | null>(null);
  const { user } = useAuth();
  const iosReviewMode = useIosReviewMode();

  const items = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .sort((a, b) => (b.year - a.year) || a.title.localeCompare(b.title)),
    [groups]
  );

  const languages = useMemo(
    () => Array.from(new Set(items.map((item) => item.language))).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  const ottPlatforms = useMemo(
    () =>
      Array.from(
        new Set(
          items.flatMap((item) =>
            item.ottLinks.map((link) => link.platform.trim()).filter(Boolean)
          )
        )
      ).sort((a, b) => a.localeCompare(b)),
    [items]
  );

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (languageFilter !== 'all' && item.language !== languageFilter) return false;
        if (ottFilter !== 'all' && !item.ottLinks.some((link) => link.platform === ottFilter)) return false;
        return true;
      }),
    [items, languageFilter, ottFilter]
  );

  const ensureSeriesRecommendationId = useCallback(
    async (item: AdminRecommendation): Promise<string> => {
      if (!user) throw new Error('Not signed in');
      if (!isSupabaseConfigured()) throw new Error('Server is not configured');

      const tmdbId = item.id.startsWith('tmdbtv-') ? Number(item.id.replace('tmdbtv-', '')) : NaN;
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) {
        throw new Error('Invalid series id');
      }

      const supabase = createClient();

      const { data: existing } = await supabase
        .from('recommendations')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'series')
        .eq('tmdb_id', tmdbId)
        .limit(1);

      if (Array.isArray(existing) && existing[0]?.id) {
        return existing[0].id as string;
      }

      const { data: inserted, error } = await supabase
        .from('recommendations')
        .insert({
          user_id: user.id,
          title: item.title,
          original_title: null,
          year: item.year ?? new Date().getFullYear(),
          type: 'series',
          poster: item.poster,
          backdrop: item.backdrop || null,
          genres: Array.isArray(item.genres) ? item.genres : [],
          language: item.language || '',
          duration: item.duration || null,
          rating: item.rating ?? null,
          personal_note: item.personalNote || 'Recommended',
          mood: Array.isArray(item.mood) ? item.mood : [],
          watch_with: item.watchWith || null,
          ott_links: Array.isArray(item.ottLinks) ? item.ottLinks : [],
          tmdb_id: tmdbId,
        })
        .select('id')
        .single();

      if (error || !inserted?.id) {
        throw new Error(error?.message || 'Failed to create recommendation');
      }

      return inserted.id as string;
    },
    [user]
  );

  const handleSendClick = useCallback(
    async (event: React.MouseEvent, item: AdminRecommendation) => {
      event.preventDefault();
      event.stopPropagation();
      if (!user) return;

      setSendingCardId(item.id);
      try {
        if (item.type === 'series') {
          const recommendationId = await ensureSeriesRecommendationId(item);
          setSendModalPayload({
            movieId: recommendationId,
            movieTitle: item.title,
            moviePoster: item.poster,
            movieYear: item.year,
            recommendationId,
          });
          return;
        }

        if (item.id.startsWith('tmdb-')) {
          const tmdbId = item.id.replace('tmdb-', '');
          setSendModalPayload({
            movieId: item.id,
            movieTitle: item.title,
            moviePoster: item.poster,
            movieYear: item.year,
            tmdbId,
          });
          return;
        }

        setSendModalPayload({
          movieId: item.id,
          movieTitle: item.title,
          moviePoster: item.poster,
          movieYear: item.year,
          recommendationId: item.id,
        });
      } catch (error) {
        console.error('[AdminRecommendationsShelf] Failed to open send modal', error);
      } finally {
        setSendingCardId(null);
      }
    },
    [ensureSeriesRecommendationId, user]
  );

  const renderCard = (item: AdminRecommendation) => {
    const href = item.type === 'series' ? `/show/${item.id}` : `/movie/${item.id}`;
    const ottBadges = item.ottLinks.slice(0, 3);

    return (
      <Link
        key={item.id}
        href={href}
        prefetch={false}
        className="group block w-[56vw] min-w-[176px] max-w-[208px] shrink-0 snap-start rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-amber-200/30 hover:bg-white/[0.05] hover:shadow-[0_24px_54px_rgba(0,0,0,0.28)] sm:w-[240px] sm:max-w-none sm:rounded-[28px] sm:p-3 lg:w-[260px]"
      >
        <div className="relative overflow-hidden rounded-[22px] border border-white/8 bg-[var(--bg-secondary)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-gradient-to-b from-black/28 to-transparent" />
          <div className="relative aspect-[2/3]">
            <Image
              src={item.poster}
              alt={`${item.title} poster`}
              fill
              sizes="(max-width: 640px) 56vw, (max-width: 1024px) 240px, 260px"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.045]"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0a101a] via-[#0a101a]/24 to-transparent" />

            <div className="absolute left-3 top-3 z-20">
              <WatchlistPlusButton movieId={item.id} title={item.title} poster={item.poster} />
            </div>

            {ottBadges.length > 0 ? (
              <div className="absolute bottom-3 right-3 z-20 flex items-center -space-x-2">
                {ottBadges.map((link) => {
                  const logoUrl = getProviderLogoUrl(link.logoPath);
                  if (!logoUrl) return null;

                  return (
                    <div
                      key={`${item.id}-${link.platform}`}
                      title={link.platform}
                      className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-[var(--bg-primary)]/85 sm:h-8 sm:w-8"
                    >
                      <Image
                        src={logoUrl}
                        alt={link.platform}
                        width={20}
                        height={20}
                        className="object-contain"
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            {item.year}
          </span>
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
            {item.language}
          </span>
          {item.franchise ? (
            <span className="max-w-full truncate rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-100">
              {item.franchise} franchise
            </span>
          ) : null}
        </div>

        <h4 className="mt-3 line-clamp-2 text-base font-semibold leading-tight text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)] sm:text-lg">
          {item.title}
        </h4>
        <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[var(--text-secondary)] sm:mt-3 sm:line-clamp-3 sm:text-sm sm:leading-6">
          {item.personalNote}
        </p>
        {user && !iosReviewMode ? (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                void handleSendClick(event, item);
              }}
              disabled={sendingCardId === item.id}
              className="flex-1 text-xs px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              title="Send to friend"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              {sendingCardId === item.id ? 'Preparing...' : 'Send to Friend'}
            </button>
          </div>
        ) : null}
      </Link>
    );
  };

  return (
    <>
      <section className="relative mb-5 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,20,0.98),rgba(7,12,22,0.92))] p-4 shadow-[0_30px_90px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:mb-10 sm:rounded-[34px] sm:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.12),transparent_52%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_48%)]" />

        <div className="relative border-b border-white/8 pb-4 sm:pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
                {kicker}
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">
                {title}
              </h2>
              <p className="mt-3 hidden text-sm leading-7 text-[var(--text-secondary)] sm:block sm:text-[15px]">
                {description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="hidden w-fit items-center gap-2 rounded-full border border-amber-300/18 bg-amber-400/8 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100 sm:inline-flex">
                Latest first
              </div>
              {ctaHref ? (
                <Link
                  href={ctaHref}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-primary)] transition-all hover:border-amber-200/30 hover:bg-white/[0.06] hover:text-amber-100"
                >
                  {ctaLabel}
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5 sm:mt-5 sm:gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
              Filters
            </span>

            <label className="inline-flex min-w-[160px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] sm:min-w-0">
              <span>Language</span>
              <select
                value={languageFilter}
                onChange={(event) => setLanguageFilter(event.target.value)}
                className="bg-transparent text-[var(--text-primary)] outline-none"
              >
                <option value="all" className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                  All
                </option>
                {languages.map((language) => (
                  <option
                    key={language}
                    value={language}
                    className="bg-[var(--bg-primary)] text-[var(--text-primary)]"
                  >
                    {language}
                  </option>
                ))}
              </select>
            </label>

            {ottPlatforms.length > 0 ? (
              <label className="inline-flex min-w-[140px] items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] sm:min-w-0">
                <span>OTT</span>
                <select
                  value={ottFilter}
                  onChange={(event) => setOttFilter(event.target.value)}
                  className="bg-transparent text-[var(--text-primary)] outline-none"
                >
                  <option value="all" className="bg-[var(--bg-primary)] text-[var(--text-primary)]">
                    All
                  </option>
                  {ottPlatforms.map((platform) => (
                    <option
                      key={platform}
                      value={platform}
                      className="bg-[var(--bg-primary)] text-[var(--text-primary)]"
                    >
                      {platform}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              {filteredItems.length} picks
            </span>
          </div>
        </div>

        <div className="relative mt-4 sm:mt-6">
          {filteredItems.length > 0 ? (
            <div className="-mx-1 overflow-x-auto pb-0.5 hide-scrollbar">
              <div className="flex min-w-full items-start snap-x snap-mandatory gap-3 px-1 sm:gap-4">
                {filteredItems.map((item) => renderCard(item))}
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/8 bg-white/[0.02] px-5 py-8 text-center">
              <p className="text-sm font-medium text-[var(--text-primary)]">No picks match these filters.</p>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Reset language or OTT to see the full latest-first list again.
              </p>
            </div>
          )}
        </div>
      </section>

      {sendModalPayload && !iosReviewMode ? (
        <SendToFriendModal
          isOpen={!!sendModalPayload}
          onClose={() => setSendModalPayload(null)}
          movieId={sendModalPayload.movieId}
          movieTitle={sendModalPayload.movieTitle}
          moviePoster={sendModalPayload.moviePoster}
          movieYear={sendModalPayload.movieYear}
          tmdbId={sendModalPayload.tmdbId}
          recommendationId={sendModalPayload.recommendationId}
        />
      ) : null}
    </>
  );
}
