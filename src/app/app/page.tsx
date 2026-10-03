'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useWatchlist } from '@/hooks';
import { AppButton } from '@/components/app/AppButton';
import { PosterRow } from '@/components/app/PosterRow';
import { PosterTile } from '@/components/app/PosterTile';
import { EmptyState } from '@/components/app/ScreenHeader';
import { PlayIcon } from '@/components/app/icons';
import { useHomeData, type HomeItem, type SectionState } from '@/components/app/home/useHomeData';
import {
  FriendAvatar,
  HeroPoster,
  OfflineBanner,
  RowSkeleton,
  ScheduleCard,
  SectionMessage,
} from '@/components/app/home/HomeParts';
import { APP_ME, APP_PICKS, RECOMMEND_SHEET_QUERY } from '@/lib/native/app-routes';
import { impactLight } from '@/lib/native/haptics';

const RECOMMEND_HREF = `/app?${RECOMMEND_SHEET_QUERY}`;

function itemsOf(state: SectionState): HomeItem[] {
  return state.status === 'ready' || state.status === 'cached' ? state.items : [];
}

/** "Couldn't refresh" note shown above saved items after a failed request. */
function StaleNote({ state, what, onRetry }: { state: SectionState; what: string; onRetry: () => void }) {
  if (state.status !== 'cached' || state.reason !== 'error') return null;
  return <SectionMessage text={`Couldn't refresh. Showing ${what} saved on this phone.`} onRetry={onRetry} />;
}

function SaveButton({ item }: { item: HomeItem }) {
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const movieId = item.movieId;
  const saved = movieId ? isInWatchlist(movieId) : false;
  if (!movieId) return null;
  return (
    <AppButton
      variant="secondary"
      aria-pressed={saved}
      onClick={() => {
        toggleWatchlist(movieId, item.title, item.poster ?? undefined);
        void impactLight();
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      {saved ? 'Saved' : 'Save'}
    </AppButton>
  );
}

function Hero({ state, onRetry }: { state: SectionState; onRetry: () => void }) {
  if (state.status === 'loading') {
    return <div className="aspect-[5/6] w-full animate-pulse rounded-[22px] bg-[var(--app-surface)]" aria-hidden="true" />;
  }
  if (state.status === 'error') {
    return <EmptyState title="Couldn't load your picks" body="Check your connection and try again." action={<AppButton variant="secondary" onClick={onRetry}>Retry</AppButton>} />;
  }
  const items = itemsOf(state);
  // Latest unread pick first, else the latest pick.
  const hero = items.find((i) => i.unread) ?? items[0];
  if (!hero && state.status === 'cached') {
    return <EmptyState title="Nothing saved on this phone yet" body="Your friends' picks will show here when you're back online." />;
  }
  if (!hero) {
    return (
      <EmptyState
        title="No picks yet"
        body="When a friend recommends a movie to you, it shows up here. Start by sending one."
        action={<AppButton href={RECOMMEND_HREF}>Recommend a movie</AppButton>}
      />
    );
  }
  return (
    <div className="flex flex-col">
      {state.status === 'cached' && state.reason === 'error' ? (
        <div className="-mx-5 mb-3 md:mx-0"><StaleNote state={state} what="picks" onRetry={onRetry} /></div>
      ) : null}
      <div className="mb-3 flex items-center gap-2">
        {hero.from ? <FriendAvatar name={hero.from.name} avatar={hero.from.avatar} /> : null}
        <span className="text-[14px] text-[var(--app-muted)]">
          <b className="text-[var(--app-text)]">{hero.from?.name ?? 'A friend'}</b> picked this for you
        </span>
      </div>
      <HeroPoster item={hero} />
      {hero.note ? (
        <p className="relative mx-3.5 -mt-6 mb-0 rounded-[18px] bg-[var(--app-surface)] px-4 py-3.5 text-[15px] leading-snug">
          &ldquo;{hero.note}&rdquo;
        </p>
      ) : null}
      <h2 className="mb-0 mt-3.5 text-[22px] font-semibold leading-tight">
        {hero.title}
        {hero.year ? <span className="ml-2 text-[15px] font-normal text-[var(--app-muted)]">{hero.year}</span> : null}
      </h2>
      <div className="mt-3 flex gap-2.5">
        {hero.href ? (
          <AppButton href={hero.href} className="flex-1">
            <PlayIcon size={18} />
            Where to watch
          </AppButton>
        ) : null}
        <SaveButton item={hero} />
      </div>
    </div>
  );
}

function FriendsRow({ state, onRetry }: { state: SectionState; onRetry: () => void }) {
  const items = itemsOf(state);
  const unread = items.filter((i) => i.unread).length;
  if (state.status === 'ready' && items.length === 0) return null;
  return (
    <PosterRow
      title="From friends"
      action={{ label: unread > 0 ? `${unread} new` : 'See all', href: APP_PICKS }}
      message={
        state.status === 'error' ? <SectionMessage text="Couldn't load friend picks." onRetry={onRetry} />
          : state.status === 'cached' && items.length === 0 ? <SectionMessage text="Nothing saved on this phone yet." />
            : null
      }
    >
      {state.status === 'loading' ? <RowSkeleton /> : null}
      {items.slice(0, 12).map((item) => (
        <PosterTile
          key={item.id}
          title={item.title}
          poster={item.poster}
          href={item.href ?? undefined}
          badge={item.from ? <FriendAvatar name={item.from.name} avatar={item.from.avatar} size={24} /> : undefined}
        />
      ))}
    </PosterRow>
  );
}

function Tonight({ state, onRetry }: { state: SectionState; onRetry: () => void }) {
  const items = itemsOf(state).slice(0, 3);
  return (
    <section aria-labelledby="home-tonight" className="mt-7 md:mt-0">
      <div className="mb-3 flex items-baseline justify-between px-5 md:px-0">
        <h2 id="home-tonight" className="m-0 text-[19px] font-semibold">Coming up</h2>
      </div>
      <div className="flex flex-col gap-2.5 px-5 md:px-0">
        {state.status === 'loading' ? <div className="h-[108px] animate-pulse rounded-[18px] bg-[var(--app-surface)]" aria-hidden="true" /> : null}
        {state.status === 'error' ? <SectionMessage text="Couldn't load your schedule." onRetry={onRetry} /> : null}
        <StaleNote state={state} what="your schedule" onRetry={onRetry} />
        {(state.status === 'ready' || state.status === 'cached') && items.length === 0 ? (
          <SectionMessage text="No movie nights planned. Schedule one from any title." />
        ) : null}
        {items.map((item) => <ScheduleCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

function TrendingRow({ state, onRetry }: { state: SectionState; onRetry: () => void }) {
  const items = itemsOf(state);
  if (state.status === 'cached') return null;
  if (state.status === 'ready' && items.length === 0) return null;
  return (
    <PosterRow
      title="Trending today"
      message={state.status === 'error' ? <SectionMessage text="Couldn't load trending titles." onRetry={onRetry} /> : null}
    >
      {state.status === 'loading' ? <RowSkeleton /> : null}
      {items.map((item, index) => (
        <PosterTile
          key={item.id}
          title={item.title}
          poster={item.poster}
          href={item.href ?? undefined}
          badge={
            <span className="app-display rounded-md bg-[var(--app-ground)] px-1.5 text-[18px] leading-tight text-[var(--app-text)]" aria-hidden="true">
              {index + 1}
            </span>
          }
        />
      ))}
    </PosterRow>
  );
}

function HomeContent({ userId, name }: { userId: string; name: string }) {
  const { picks, tonight, trending, offline, reload } = useHomeData(userId);
  const showOffline =
    offline ||
    [picks, tonight].some((section) => section.status === 'cached' && section.reason === 'offline');

  return (
    <div className="mx-auto max-w-[1100px]">
      <header className="flex items-center justify-between px-5 pb-2 pt-3">
        <span className="app-display text-[30px] text-[var(--app-accent)]" aria-label="BingeItBro">bib</span>
        <Link href={APP_ME} aria-label="Your profile" className="no-underline">
          <FriendAvatar name={name} size={44} />
        </Link>
      </header>
      {showOffline ? <OfflineBanner /> : null}

      <div className="mt-3 md:grid md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:items-start md:gap-8 md:px-5">
        <div className="px-5 md:px-0">
          <Hero state={picks} onRetry={reload} />
        </div>
        <Tonight state={tonight} onRetry={reload} />
      </div>

      <FriendsRow state={picks} onRetry={reload} />
      <TrendingRow state={trending} onRetry={reload} />
      <p className="mx-5 mt-8 text-[12px] text-[#8a8a94]">
        Movie data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
    </div>
  );
}

export default function AppHomePage() {
  const { user } = useAuth();
  if (!user) return null; // The shell redirects signed-out users to Welcome.
  const name = (user.user_metadata?.full_name as string | undefined) || user.email || 'You';
  // Keyed by account: switching accounts remounts Home, so nothing from the previous one survives.
  return <HomeContent key={user.id} userId={user.id} name={name} />;
}
