'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthModal, BibSplash, Header, MovieBackground, useAuth } from '@/components';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';
import { trackFunnelEvent } from '@/lib/funnel';

type Hub = 'movies' | 'shows' | 'songs';

function readDefaultHub(): Hub | null {
  const raw = (safeLocalStorageGet('bib-default-hub') || '').trim();
  if (raw === 'movies' || raw === 'shows' || raw === 'songs') return raw;
  return null;
}

export default function HomeGate() {
  const router = useRouter();
  const { user, loading, signInWithGoogle } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [ctaError, setCtaError] = useState('');

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
    if (!defaultHub) {
      safeLocalStorageSet('bib-default-hub', hubToOpen);
    }
    router.replace(`/${hubToOpen}`);
  }, [mounted, loading, user, defaultHub, router]);

  useEffect(() => {
    if (!mounted) return;
    if (user) return;
    trackFunnelEvent('landing_view', { page: 'home_gate' });
  }, [mounted, user]);

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

  // Public marketing home.
  if (!mounted || loading || !user) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
        <MovieBackground />
        <BibSplash />

        <Header searchMode="off" onLoginClick={() => openAuth('login', 'header')} />

        <AuthModal
          isOpen={showAuth}
          initialMode={authMode}
          onClose={() => setShowAuth(false)}
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <section className="bib-guest-hero">
            <div className="bib-guest-grid">
              <div className="bib-guest-copy">
                <span className="bib-guest-kicker">BiB · Binge it bro</span>
                <h1 className="bib-guest-title">
                  Find your next watch in 30 seconds, using friend taste not random feeds.
                </h1>
                <p className="bib-guest-subtitle">
                  BiB turns your group chat taste into watch picks. Save good recommendations, skip bad scroll loops, and binge with confidence.
                </p>
                <div className="bib-guest-trust-note" role="note" aria-label="Platform policy">
                  <span className="bib-guest-trust-note__badge">Recommendations only</span>
                  <p>
                    BiB does not host or stream movies, shows, or songs. We only help you discover picks and point you to legal OTT or official platforms.
                  </p>
                </div>
                <div className="bib-guest-actions">
                  <button
                    type="button"
                    onClick={() => void continueWithGoogle('hero_primary')}
                    className="bib-guest-primary"
                    disabled={googleBusy}
                  >
                    {googleBusy ? 'Connecting...' : 'Continue with Google'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth('signup', 'hero_email_signup')}
                    className="bib-guest-secondary"
                  >
                    Use email instead
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuth('login', 'hero_signin')}
                    className="bib-guest-secondary"
                  >
                    Already a member? Sign in
                  </button>
                </div>
                {ctaError ? (
                  <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm max-w-xl">
                    {ctaError}
                  </div>
                ) : null}
                <div className="bib-guest-badges">
                  <span>100+ members already signed in</span>
                  <span>No third-party tracking pixels</span>
                  <span>Works best in under 30 seconds with Google sign-in</span>
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
              <h3>Browse first, sign in on intent</h3>
              <p>You only sign in when you want to save, share, follow friends, or set reminders.</p>
            </div>
            <div className="bib-guest-step">
              <h3>One-tap onboarding</h3>
              <p>Google gets you in fast. Email signup stays available if you prefer manual setup.</p>
            </div>
            <div className="bib-guest-step">
              <h3>Private by design</h3>
              <p>No ad network trackers. No spam feed. Just recommendations from people you trust.</p>
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
