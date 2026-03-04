'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdDisplayUnit, AuthModal, BibSplash, Header, MovieBackground, useAuth } from '@/components';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';
import { trackFunnelEvent } from '@/lib/funnel';
import { buildTmdbV3Url, fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

type Hub = 'movies' | 'shows' | 'songs';
type PreviewTab = 'movies' | 'shows' | 'friends';

type PreviewCard = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  subtitle: string;
  badge: string;
  reason: string;
  accent: string;
};

type FriendPreviewRow = {
  keyRef: string;
  friend: string;
  action: string;
  title: string;
  note: string;
};

const moviePreview: PreviewCard[] = [
  {
    tmdbId: 693134,
    mediaType: 'movie',
    title: 'Dune: Part Two',
    subtitle: 'Sci-fi · 2024',
    badge: 'Trending Movie',
    reason: 'Friends who liked Arrival and Interstellar keep saving this.',
    accent: 'from-amber-500/25 to-orange-500/10',
  },
  {
    tmdbId: 872585,
    mediaType: 'movie',
    title: 'Oppenheimer',
    subtitle: 'Drama · 2023',
    badge: 'Popular Pick',
    reason: 'High rewatch chatter and weekend watchlist saves.',
    accent: 'from-slate-400/20 to-slate-800/10',
  },
  {
    tmdbId: 940721,
    mediaType: 'movie',
    title: 'Godzilla Minus One',
    subtitle: 'Action · 2023',
    badge: 'Friend Buzz',
    reason: 'Keeps showing up in group chats as a must-watch.',
    accent: 'from-emerald-400/20 to-emerald-900/10',
  },
  {
    tmdbId: 569094,
    mediaType: 'movie',
    title: 'Spider-Man: Across the Spider-Verse',
    subtitle: 'Animation · 2023',
    badge: 'Mood Pick',
    reason: 'Strong ratings from friends who like visual-heavy films.',
    accent: 'from-fuchsia-500/20 to-indigo-500/10',
  },
];

const showPreview: PreviewCard[] = [
  {
    tmdbId: 136315,
    mediaType: 'tv',
    title: 'The Bear',
    subtitle: 'Comedy-Drama · Series',
    badge: 'Trending Show',
    reason: 'Short episodes, high completion rate, easy weekend binge.',
    accent: 'from-red-500/20 to-orange-600/10',
  },
  {
    tmdbId: 126308,
    mediaType: 'tv',
    title: 'Shogun',
    subtitle: 'Drama · Series',
    badge: 'Hot Right Now',
    reason: 'Friends are recommending it for story + production quality.',
    accent: 'from-zinc-300/20 to-zinc-800/10',
  },
  {
    tmdbId: 95396,
    mediaType: 'tv',
    title: 'Severance',
    subtitle: 'Thriller · Series',
    badge: 'Rewatch Favorite',
    reason: 'Often saved when users want a “smart mystery” show.',
    accent: 'from-cyan-400/20 to-blue-700/10',
  },
  {
    tmdbId: 94997,
    mediaType: 'tv',
    title: 'House of the Dragon',
    subtitle: 'Fantasy · Series',
    badge: 'Group Watch',
    reason: 'Common pick when friends want to watch the same show weekly.',
    accent: 'from-rose-500/20 to-red-900/10',
  },
];

const friendPreview: FriendPreviewRow[] = [
  {
    keyRef: 'movie-693134',
    friend: 'Arjun',
    action: 'recommended',
    title: 'Dune: Part Two',
    note: '“Watch on a big screen. Worth it.”',
  },
  {
    keyRef: 'tv-136315',
    friend: 'Maya',
    action: 'saved',
    title: 'The Bear',
    note: 'Added to weekend shortlist.',
  },
  {
    keyRef: 'movie-940721',
    friend: 'Ravi',
    action: 'watched',
    title: 'Godzilla Minus One',
    note: 'Rated 4.5 and shared with the group.',
  },
  {
    keyRef: 'tv-95396',
    friend: 'Neha',
    action: 'nudged',
    title: 'Severance',
    note: 'Reminder set for Friday night.',
  },
];

const landingStructuredDataJson = JSON.stringify([
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'BiB - Binge it bro',
    alternateName: 'BiB',
    url: 'https://bingeitbro.com',
    description:
      'Friend-powered movie and TV recommendation app to save picks, track watchlists, and decide what to watch faster.',
    inLanguage: 'en',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'BiB - Binge it bro',
    applicationCategory: 'EntertainmentApplication',
    operatingSystem: 'Web',
    url: 'https://bingeitbro.com',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Movie and TV discovery',
      'Friend recommendations',
      'Watchlist saves',
      'Watch reminders',
      'Google sign-in and email signup',
    ],
  },
]);

function readDefaultHub(): Hub | null {
  const raw = (safeLocalStorageGet('bib-default-hub') || '').trim();
  if (raw === 'movies' || raw === 'shows' || raw === 'songs') return raw;
  return null;
}

function PreviewCards({
  cards,
  posterPaths,
  onLockedActionClick,
}: {
  cards: PreviewCard[];
  posterPaths: Record<string, string>;
  onLockedActionClick: (action: string) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((card, idx) => (
        <article
          key={card.title}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-[rgba(12,12,16,0.9)] p-4"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${card.accent}`} aria-hidden="true" />
          <div className="relative">
            <div className="flex items-start gap-3">
              <div className="relative h-[132px] w-[88px] shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/35">
                {posterPaths[`${card.mediaType}-${card.tmdbId}`] ? (
                  <Image
                    src={posterPaths[`${card.mediaType}-${card.tmdbId}`]}
                    alt={`${card.title} poster`}
                    fill
                    sizes="88px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center p-2 text-center text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                    Poster loading
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-zinc-200">
                  {card.badge}
                </p>
                <h3 className="mt-3 text-lg font-semibold text-white">{card.title}</h3>
                <p className="text-sm text-zinc-300">{card.subtitle}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-center min-w-[62px]">
                <div className="text-xs text-zinc-400">Rank</div>
                <div className="text-lg font-semibold text-white">#{idx + 1}</div>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-zinc-200">{card.reason}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onLockedActionClick('save_to_watchlist')}
                className="rounded-full border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/15"
              >
                Save to watchlist (locked)
              </button>
              <button
                type="button"
                onClick={() => onLockedActionClick('mark_watched')}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-white/10"
              >
                Mark watched (locked)
              </button>
              <button
                type="button"
                onClick={() => onLockedActionClick('share_with_friend')}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-white/10"
              >
                Share with friend (locked)
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FriendsPreview({
  posterPaths,
  onLockedActionClick,
}: {
  posterPaths: Record<string, string>;
  onLockedActionClick: (action: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border border-white/10 bg-[rgba(12,12,16,0.9)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-amber-300">Friends feed preview</p>
            <h3 className="mt-1 text-lg font-semibold text-white">What your friends are watching</h3>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
            Sign in to follow friends
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {friendPreview.map((row) => (
            <div key={`${row.friend}-${row.title}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/35">
                    {posterPaths[row.keyRef] ? (
                      <Image
                        src={posterPaths[row.keyRef]}
                        alt={`${row.title} poster`}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200">
                      <span className="font-semibold text-white">{row.friend}</span>
                      {' '}
                      {row.action}
                      {' '}
                      <span className="font-semibold text-white">{row.title}</span>
                    </p>
                    <p className="mt-1 text-sm text-zinc-400">{row.note}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onLockedActionClick('friend_interaction')}
                  className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
                >
                  Reply (locked)
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-[rgba(12,12,16,0.9)] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-amber-300">Unlocked after sign in</p>
          <ul className="mt-3 space-y-2 text-sm text-zinc-200">
            <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Save recommendations to your watchlist</li>
            <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Follow friends and see their picks</li>
            <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Create group watches with friends</li>
            <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Schedule watch reminders</li>
            <li className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">Share picks back to friends</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[rgba(12,12,16,0.9)] p-4">
          <p className="text-sm font-medium text-white">Try the UI (preview mode)</p>
          <p className="mt-1 text-sm text-zinc-400">
            Buttons work as a demo and will ask you to sign in only when you try to use locked features.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onLockedActionClick('follow_friend')}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 hover:bg-white/10"
            >
              Follow (locked)
            </button>
            <button
              type="button"
              onClick={() => onLockedActionClick('send_nudge')}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 hover:bg-white/10"
            >
              Nudge (locked)
            </button>
            <button
              type="button"
              onClick={() => onLockedActionClick('create_group_watch')}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 hover:bg-white/10"
            >
              Group watch (locked)
            </button>
            <button
              type="button"
              onClick={() => onLockedActionClick('add_friend')}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-100 hover:bg-white/10"
            >
              Add friend (locked)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeGate() {
  const router = useRouter();
  const { user, loading, signInWithGoogle } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [ctaError, setCtaError] = useState('');
  const [previewTab, setPreviewTab] = useState<PreviewTab>('movies');
  const [previewPosterPaths, setPreviewPosterPaths] = useState<Record<string, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const defaultHub = useMemo(() => (mounted ? readDefaultHub() : null), [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (loading) return;
    if (!user) return;
    const hubToOpen = defaultHub ?? 'movies';
    if (!defaultHub) safeLocalStorageSet('bib-default-hub', hubToOpen);
    router.replace(`/${hubToOpen}`);
  }, [mounted, loading, user, defaultHub, router]);

  useEffect(() => {
    if (!mounted || user) return;
    trackFunnelEvent('landing_view', { page: 'home_gate_v2' });
  }, [mounted, user]);

  useEffect(() => {
    if (!mounted) return;
    const controller = new AbortController();
    let cancelled = false;
    const allPreview = [...moviePreview, ...showPreview];

    void (async () => {
      try {
        const responses = await Promise.all(
          allPreview.map(async (item) => {
            const endpoint = item.mediaType === 'tv' ? 'tv' : 'movie';
            const url = buildTmdbV3Url(`/3/${endpoint}/${item.tmdbId}`);
            const response = await fetchTmdbWithProxy(url, { signal: controller.signal });
            if (!response.ok) return null;
            const data = (await response.json()) as { poster_path?: string | null };
            if (!data.poster_path) return null;
            return {
              key: `${item.mediaType}-${item.tmdbId}`,
              src: `https://image.tmdb.org/t/p/w342${data.poster_path}`,
            };
          }),
        );

        if (cancelled) return;

        const next: Record<string, string> = {};
        for (const item of responses) {
          if (!item) continue;
          next[item.key] = item.src;
        }
        setPreviewPosterPaths(next);
      } catch {
        // Keep preview usable without posters if poster fetch fails.
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [mounted]);

  const openAuth = (mode: 'login' | 'signup', source: string) => {
    setCtaError('');
    setAuthMode(mode);
    setShowAuth(true);
    trackFunnelEvent('auth_modal_open', { mode, source });
  };

  const continueWithGoogle = async (source: string) => {
    setCtaError('');
    setGoogleBusy(true);
    trackFunnelEvent('oauth_start', { source, location: 'landing' });
    const { error } = await signInWithGoogle();
    if (error) {
      setGoogleBusy(false);
      setCtaError(error.message);
      trackFunnelEvent('oauth_error', { source, location: 'landing', message: error.message.slice(0, 120) });
      return;
    }
    trackFunnelEvent('oauth_redirect_started', { source, location: 'landing' });
    window.setTimeout(() => setGoogleBusy(false), 4000);
  };

  const handlePreviewTab = (tab: PreviewTab) => {
    setPreviewTab(tab);
    trackFunnelEvent('preview_tab_switch', { tab });
  };

  const handleLockedAction = (action: string) => {
    trackFunnelEvent('preview_locked_action_click', { action, tab: previewTab });
    openAuth('signup', `preview_${action}`);
  };

  if (!mounted) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
        <MovieBackground />
        <BibSplash />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
        <MovieBackground />
        <BibSplash />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: landingStructuredDataJson }}
        />

        <Header searchMode="off" onLoginClick={() => openAuth('login', 'header')} />

        <AuthModal
          isOpen={showAuth}
          initialMode={authMode}
          onClose={() => setShowAuth(false)}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <section className="rounded-3xl border border-white/10 bg-[rgba(10,10,14,0.78)] p-5 sm:p-7 lg:p-8 backdrop-blur-md">
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-amber-300">BiB · Binge it bro</p>
                  <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight text-white">
                    Friend-powered movie and show recommendations.
                  </h1>
                  <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-300">
                    BiB helps you save recommendations from friends, browse trending movies and shows, create group watch plans, and schedule what to watch faster.
                  </p>
                </div>

                <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-amber-200">What this website is</p>
                  <p className="mt-2 text-sm leading-6 text-amber-100">
                    BiB is a discovery and watchlist app. It does not host or stream content. It helps users find picks and track them.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Preview</p>
                    <p className="mt-1 text-sm text-white">Trending movies & shows</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Friends</p>
                    <p className="mt-1 text-sm text-white">Recommendations feed</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Groups</p>
                    <p className="mt-1 text-sm text-white">Group watch planning</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Schedule</p>
                    <p className="mt-1 text-sm text-white">Watch reminders & timing</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-400">Unlock</p>
                    <p className="mt-1 text-sm text-white">Save, follow, groups, schedule</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[rgba(8,8,12,0.9)] p-5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Sign in options</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Start with one account</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  You can preview the interface below. Sign in only when you want to save picks, follow friends, create groups, or schedule watch reminders.
                </p>

                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    onClick={() => void continueWithGoogle('hero_primary')}
                    className="bib-guest-primary w-full"
                    disabled={googleBusy}
                  >
                    {googleBusy ? 'Connecting...' : 'Continue with Google'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth('signup', 'hero_email_signup')}
                    className="bib-guest-secondary w-full"
                  >
                    Sign up with email
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth('login', 'hero_signin')}
                    className="bib-guest-secondary w-full"
                  >
                    Already a member? Sign in
                  </button>
                </div>

                {ctaError ? (
                  <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                    {ctaError}
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2 text-xs text-zinc-300">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">100+ signed in users</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Fast Google sign-in</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Email signup available</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-7 rounded-3xl border border-white/10 bg-[rgba(10,10,14,0.76)] p-5 sm:p-6 lg:p-7 backdrop-blur-md">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Preview the app</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-semibold text-white">
                  Browse trending and friend features before signing in
                </h2>
                <p className="mt-2 text-sm text-zinc-300">
                  You can look around here. Trying locked actions (save, group watch, schedule) opens sign-in.
                </p>
              </div>

              <div className="inline-flex rounded-2xl border border-white/10 bg-black/25 p-1">
                {(['movies', 'shows', 'friends'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => handlePreviewTab(tab)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
                      previewTab === tab
                        ? 'bg-white text-black'
                        : 'text-zinc-200 hover:bg-white/10'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-4 grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-amber-300">Group watch teaser</p>
                  <p className="mt-2 text-sm text-zinc-200">
                    Create a group watch room, invite friends, and keep everyone on the same movie or show plan.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleLockedAction('group_watch_teaser')}
                    className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
                  >
                    Create group watch (locked)
                  </button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-amber-300">Schedule teaser</p>
                  <p className="mt-2 text-sm text-zinc-200">
                    Schedule a watch time, set reminders, and nudge friends when it is time to start.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleLockedAction('schedule_watch_teaser')}
                    className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-100 hover:bg-white/5"
                  >
                    Schedule watch (locked)
                  </button>
                </div>
              </div>

              {previewTab === 'movies' ? (
                <PreviewCards cards={moviePreview} posterPaths={previewPosterPaths} onLockedActionClick={handleLockedAction} />
              ) : null}
              {previewTab === 'shows' ? (
                <PreviewCards cards={showPreview} posterPaths={previewPosterPaths} onLockedActionClick={handleLockedAction} />
              ) : null}
              {previewTab === 'friends' ? (
                <FriendsPreview posterPaths={previewPosterPaths} onLockedActionClick={handleLockedAction} />
              ) : null}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm text-zinc-200">
                <span className="font-semibold text-white">Preview mode:</span>
                {' '}
                titles and friend activity shown here are a demo to show the product flow. Sign in to save picks, follow friends, create groups, and schedule watch reminders.
              </p>
            </div>
          </section>

          <div className="mt-8">
            <AdDisplayUnit className="mx-auto max-w-3xl" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <p className="text-sm text-[var(--text-muted)]">Redirecting...</p>
    </div>
  );
}
