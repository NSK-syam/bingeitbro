'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { AuthModal } from '@/components/AuthModal';
import { AppleSignInButton } from '@/components/native/AppleSignInButton';
import { AppButton } from '@/components/app/AppButton';
import { posterTint, posterUrl } from '@/components/app/PosterTile';
import { buildTmdbV3Url, fetchTmdbWithProxy } from '@/lib/tmdb-fetch';

type CollagePoster = { id: string; title: string; poster: string | null };

const FALLBACK_TITLES = [
  'Dune Part Two', 'Kantara', 'Past Lives', 'RRR', 'Aavesham', 'Pushpa 2',
  'Stree 2', 'Devara', 'Oppenheimer', 'Jawan', 'Premalu', 'Laapataa Ladies',
];

/** This week's trending posters for the background collage; tinted placeholders until loaded. */
function usePosterCollage(): CollagePoster[] {
  const [posters, setPosters] = useState<CollagePoster[]>(
    FALLBACK_TITLES.map((title, i) => ({ id: `f${i}`, title, poster: null })),
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchTmdbWithProxy(buildTmdbV3Url('trending/movie/week', { language: 'en-US' }));
        if (!res.ok) return;
        const json = (await res.json()) as { results?: { id: number; title?: string; poster_path?: string | null }[] };
        const list = (json.results ?? []).filter((m) => m.poster_path).slice(0, 12);
        if (!cancelled && list.length >= 8) {
          setPosters(list.map((m) => ({ id: String(m.id), title: m.title ?? '', poster: m.poster_path ?? null })));
        }
      } catch {
        // Keep the tinted placeholders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return posters;
}

/** One collage poster; falls back to the tinted title tile if the image fails. */
function CollageTile({ poster }: { poster: CollagePoster }) {
  const src = posterUrl(poster.poster, 'w185');
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative flex aspect-[2/3] items-end overflow-hidden rounded-[10px] p-2" style={{ background: posterTint(poster.title) }}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="app-poster-title text-[15px] text-white">{poster.title}</span>
      )}
    </span>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    </svg>
  );
}

/**
 * Welcome (signed out). Sign in with Apple first on iOS, then Google, then email (the existing
 * email sign-in/sign-up dialog, reused as-is). After sign-in the app shell forwards to `next`.
 */
export default function AppWelcomePage() {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const posters = usePosterCollage();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const onApple = async () => {
    setError(null);
    setBusy('apple');
    const { error: appleError, canceled } = await signInWithApple();
    setBusy(null);
    if (appleError && !canceled) setError(appleError.message || 'Sign in with Apple failed. Try again.');
  };

  const onGoogle = async () => {
    setError(null);
    setBusy('google');
    const { error: googleError } = await signInWithGoogle();
    setBusy(null);
    if (googleError) setError(googleError.message || 'Google sign-in failed. Try again.');
  };

  return (
    // The shell adds safe-area + 16px padding around <main>; subtract it so Welcome fits one screen.
    <div className="relative min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-16px)] overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-10 -top-8 grid w-[calc(100%+80px)] -rotate-6 grid-cols-4 gap-2.5 opacity-55 md:grid-cols-6"
      >
        {posters.map((p) => <CollageTile key={p.id} poster={p} />)}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(11,11,14,0)_18%,rgba(11,11,14,0.85)_42%,#0b0b0e_58%)]"
      />

      <div className="relative mx-auto flex min-h-[inherit] max-w-[520px] flex-col justify-end gap-3 px-6 pb-6">
        <div className="flex flex-col gap-3">
          <span className="app-display text-[34px] text-[var(--app-accent)]" aria-hidden="true">bib</span>
          <h1 className="app-display m-0 text-[44px] leading-[0.98]">Movie picks from friends, not algorithms.</h1>
          <p className="mb-3 mt-0 text-[16px] leading-relaxed text-[var(--app-muted)]">
            Send a movie to a friend, see what they loved, and plan movie night together.
          </p>

          {error ? (
            <p role="alert" className="m-0 rounded-[14px] bg-[#3a1a1a] px-4 py-3 text-[14px] text-[var(--app-danger)]">
              {error}
            </p>
          ) : null}

          <AppleSignInButton appearance="white" onClick={onApple} disabled={busy !== null} className="min-h-[54px] rounded-2xl" />
          <AppButton variant="secondary" block onClick={onGoogle} disabled={busy !== null} className="min-h-[54px] rounded-2xl text-[16px]">
            <GoogleMark />
            {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
          </AppButton>
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            disabled={busy !== null}
            className="min-h-11 border-0 bg-transparent p-3 text-[15px] text-[var(--app-text)] disabled:opacity-50"
          >
            Use email instead
          </button>
          <p className="m-0 text-center text-[12px] text-[#8a8a94]">
            By continuing you agree to the{' '}
            <Link href="/terms" className="text-[#c9c9d1]">Terms</Link> and{' '}
            <Link href="/privacy" className="text-[#c9c9d1]">Privacy Policy</Link>.
          </p>
        </div>
      </div>

      <AuthModal isOpen={emailOpen} onClose={() => setEmailOpen(false)} initialMode="login" />
    </div>
  );
}
