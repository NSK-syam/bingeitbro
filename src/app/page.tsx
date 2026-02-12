'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthModal, BibSplash, Header, MovieBackground, useAuth } from '@/components';

type Hub = 'movies' | 'shows' | 'songs';

function readDefaultHub(): Hub | null {
  if (typeof window === 'undefined') return null;
  const raw = (window.localStorage.getItem('bib-default-hub') || '').trim();
  if (raw === 'movies' || raw === 'shows' || raw === 'songs') return raw;
  return null;
}

export default function HomeGate() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => setMounted(true), []);

  const defaultHub = useMemo(() => (mounted ? readDefaultHub() : null), [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (loading) return;
    if (!user) return;
    const hubToOpen = defaultHub ?? 'movies';
    if (!defaultHub) {
      window.localStorage.setItem('bib-default-hub', hubToOpen);
    }
    router.replace(`/${hubToOpen}`);
  }, [mounted, loading, user, defaultHub, router]);

  // Public marketing home.
  if (!mounted || loading || !user) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
        <MovieBackground />
        <BibSplash />

        <Header searchMode="off" onLoginClick={() => setShowAuth(true)} />

        <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <section className="bib-guest-hero">
            <div className="bib-guest-grid">
              <div className="bib-guest-copy">
                <span className="bib-guest-kicker">BiB · Binge it bro</span>
                <h1 className="bib-guest-title">
                  Your movie night, curated by people who actually know you.
                </h1>
                <p className="bib-guest-subtitle">
                  Skip the endless scroll. BiB is where friends drop their best picks and you binge with confidence.
                </p>
                <div className="bib-guest-actions">
                  <Link href="/signup" className="bib-guest-primary">
                    Join BiB
                  </Link>
                  <button
                    type="button"
                    onClick={() => setShowAuth(true)}
                    className="bib-guest-secondary"
                  >
                    Sign in
                  </button>
                </div>
                <div className="bib-guest-badges">
                  <span>🚫 No algorithms</span>
                  <span>👥 Friends only</span>
                  <span>🎬 Built for binges</span>
                </div>
              </div>

              <div className="bib-guest-clapper">
                <div className="bib-guest-clapper-top">
                  <div className="bib-guest-clapper-stripes" />
                </div>
                <div className="bib-guest-clapper-body">
                  <div className="bib-guest-clapper-row">
                    <span>SCENE</span>
                    <strong>WELCOME</strong>
                  </div>
                  <div className="bib-guest-clapper-row">
                    <span>TAKE</span>
                    <strong>01</strong>
                  </div>
                  <div className="bib-guest-clapper-title">BiB</div>
                  <div className="bib-guest-clapper-tagline">Binge it bro</div>
                </div>
              </div>
            </div>
          </section>

          <section className="bib-guest-steps">
            <div className="bib-guest-step">
              <h3>Share your taste</h3>
              <p>Drop what you actually loved. Your friends see what’s real.</p>
            </div>
            <div className="bib-guest-step">
              <h3>Follow the vibe</h3>
              <p>Discover picks by language, mood, and the people you trust.</p>
            </div>
            <div className="bib-guest-step">
              <h3>Start the binge</h3>
              <p>Pick a rec, hit play, and let the night unfold.</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  // Signed in: redirect effect will route to default hub.
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center px-4">
      <p className="text-sm text-[var(--text-muted)]">Redirecting...</p>
    </div>
  );
}
