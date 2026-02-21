'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useState } from 'react';
import { AuthModal } from '@/components/AuthModal';
import { BibSplash } from '@/components/BibSplash';
import { CountryToggle } from '@/components/CountryToggle';
import { Header } from '@/components/Header';
import { HubTabs } from '@/components/HubTabs';
import { MovieCalendarSpotlightPopup } from '@/components/MovieCalendarSpotlightPopup';
import { ShowBackground } from '@/components/ShowBackground';
import { AdDisplayUnit } from '@/components/AdDisplayUnit';
import { useAuth } from '@/components/AuthProvider';
import { useCountry } from '@/hooks';

const SubmitRecommendation = dynamic(
  () => import('@/components/SubmitRecommendation').then((mod) => mod.SubmitRecommendation),
  { ssr: false }
);

const TrendingShows = dynamic(
  () => import('@/components/TrendingShows').then((mod) => mod.TrendingShows),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
);

export default function ShowsHome() {
  const { user, loading: authLoading } = useAuth();
  const [country, setCountry] = useCountry();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const hero = useMemo(() => {
    const name =
      (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.full_name ||
      (user?.user_metadata as { full_name?: string; name?: string } | undefined)?.name ||
      user?.email?.split('@')[0] ||
      '';
    return `Shows, seasons, and receipts${name ? `, ${name}` : ''}.`;
  }, [user]);

  const onSuccess = useCallback(() => {
    // Keep it simple for now (Trending shows is live; user-created picks appear on profiles).
  }, []);

  return (
    <div className="min-h-screen relative">
      <BibSplash enabled={!user && showAuthModal} />
      <ShowBackground />

      <Header
        searchMode="tv"
        onSearch={setSearchQuery}
        onLoginClick={() => setShowAuthModal(true)}
        onAddClick={() => setShowSubmitModal(true)}
      />
      {user && <HubTabs placement="center" />}

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      <SubmitRecommendation
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSuccess={onSuccess}
        defaultType="series"
      />
      {user && <MovieCalendarSpotlightPopup userId={user.id} mediaType="tv" />}

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
        {!user ? (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Shows</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">{hero}</h1>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Trending across languages, plus your friends&apos; picks. Add a show to your profile or send it directly to a friend.
              </p>
            </div>

            <div className="mt-6">
              <AdDisplayUnit className="max-w-3xl" />
            </div>

            <div className="mt-8 bg-[var(--bg-card)] border border-white/10 rounded-3xl p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-[var(--text-primary)]">Latest & Trending</div>
                  <div className="text-xs text-[var(--text-muted)]">{searchQuery ? `Results for "${searchQuery}"` : 'Popular shows worldwide'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-xs text-[var(--text-muted)]">Country</span>
                    <CountryToggle value={country} onChange={setCountry} />
                  </div>
                  <button
                    type="button"
                    onClick={() => (user ? setShowSubmitModal(true) : setShowAuthModal(true))}
                    className="px-4 py-2 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] font-semibold hover:opacity-90 transition-opacity"
                    disabled={authLoading}
                    title={user ? 'Share a show' : 'Sign in to share'}
                  >
                    + Share
                  </button>
                </div>
              </div>
              <div className="mt-3 sm:hidden">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">Country</span>
                  <CountryToggle value={country} onChange={setCountry} />
                </div>
              </div>
              <div className="mt-5">
                <TrendingShows searchQuery={searchQuery} country={country} />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
