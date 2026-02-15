'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { AuthModal } from '@/components/AuthModal';
import { getTriviaLeaderboard, submitTriviaAttempt, type TriviaLanguage, type TriviaLeaderboardEntry } from '@/lib/supabase-rest';

type WeeklyTriviaQuestion = {
  id: string;
  tmdbId: number;
  title: string;
  year: number;
  poster: string | null;
  question: string;
  options: string[];
  correctIndex: number;
};

type WeeklyTriviaPayload = {
  weekKey: string;
  language: TriviaLanguage;
  languageLabel: string;
  questions: WeeklyTriviaQuestion[];
};

const LANGS: Array<{ code: TriviaLanguage; label: string; glow: string }> = [
  { code: 'en', label: 'English', glow: 'from-sky-400/60 to-indigo-500/60' },
  { code: 'te', label: 'Telugu', glow: 'from-amber-400/60 to-orange-500/60' },
  { code: 'hi', label: 'Hindi', glow: 'from-rose-400/60 to-pink-500/60' },
  { code: 'ta', label: 'Tamil', glow: 'from-emerald-400/60 to-teal-500/60' },
];

function formatMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function medal(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

export default function TriviaPage() {
  const { user } = useAuth();

  const [lang, setLang] = useState<TriviaLanguage>('en');
  const [weekly, setWeekly] = useState<WeeklyTriviaPayload | null>(null);
  const [loadingWeekly, setLoadingWeekly] = useState(false);
  const [weeklyError, setWeeklyError] = useState('');

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<TriviaLeaderboardEntry[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [boardError, setBoardError] = useState('');

  const [showAuthModal, setShowAuthModal] = useState(false);

  const tickerRef = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const activeLangMeta = useMemo(() => LANGS.find((l) => l.code === lang) ?? LANGS[0]!, [lang]);

  const inProgress = startedAt !== null && finishedAt === null && weekly?.questions?.length;
  const durationMs = useMemo(() => {
    if (!startedAt) return 0;
    const end = finishedAt ?? now;
    return Math.max(0, end - startedAt);
  }, [startedAt, finishedAt, now]);

  const score = useMemo(() => {
    if (!weekly) return 0;
    let s = 0;
    for (let i = 0; i < weekly.questions.length; i += 1) {
      const q = weekly.questions[i]!;
      const a = answers[i];
      if (typeof a === 'number' && a === q.correctIndex) s += 1;
    }
    return s;
  }, [weekly, answers]);

  const top3 = leaderboard.slice(0, 3);

  useEffect(() => {
    if (!inProgress) {
      if (tickerRef.current) {
        window.clearInterval(tickerRef.current);
        tickerRef.current = null;
      }
      return;
    }
    if (tickerRef.current) return;
    tickerRef.current = window.setInterval(() => setNow(Date.now()), 200);
    return () => {
      if (tickerRef.current) window.clearInterval(tickerRef.current);
      tickerRef.current = null;
    };
  }, [inProgress]);

  const resetRun = () => {
    setStartedAt(null);
    setFinishedAt(null);
    setCurrentIndex(0);
    setAnswers([]);
    setSubmitting(false);
    setSubmitError('');
    setSubmittedId(null);
  };

  const loadWeekly = async (nextLang = lang) => {
    setLoadingWeekly(true);
    setWeeklyError('');
    setWeekly(null);
    resetRun();
    try {
      const res = await fetch(`/api/trivia/weekly?lang=${encodeURIComponent(nextLang)}`, { method: 'GET' });
      const json = (await res.json()) as WeeklyTriviaPayload & { error?: string };
      if (!res.ok || !json || typeof json !== 'object') {
        throw new Error(json?.error || 'Failed to load weekly trivia.');
      }
      if (!Array.isArray(json.questions) || json.questions.length !== 10) {
        throw new Error('Trivia set is not ready. Try again in a moment.');
      }
      setWeekly(json);
    } catch (e) {
      setWeeklyError(e instanceof Error ? e.message : 'Failed to load weekly trivia.');
    } finally {
      setLoadingWeekly(false);
    }
  };

  const loadBoard = async (weekKey: string, language: TriviaLanguage) => {
    if (!user) return;
    setLoadingBoard(true);
    setBoardError('');
    try {
      const rows = await getTriviaLeaderboard({ weekKey, language });
      setLeaderboard(rows);
    } catch (e) {
      setLeaderboard([]);
      setBoardError(e instanceof Error ? e.message : 'Failed to load leaderboard.');
    } finally {
      setLoadingBoard(false);
    }
  };

  useEffect(() => {
    // Load questions whenever language changes.
    void loadWeekly(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  useEffect(() => {
    if (!weekly || !user) return;
    void loadBoard(weekly.weekKey, weekly.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekly?.weekKey, weekly?.language, user?.id]);

  const start = () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (!weekly) return;
    setStartedAt(Date.now());
    setFinishedAt(null);
    setCurrentIndex(0);
    setAnswers(new Array(weekly.questions.length).fill(-1));
    setSubmitError('');
    setSubmittedId(null);
  };

  const pickOption = (idx: number) => {
    if (!weekly) return;
    if (!inProgress) return;
    const next = answers.slice();
    next[currentIndex] = idx;
    setAnswers(next);
  };

  const nextQuestion = () => {
    if (!weekly) return;
    if (currentIndex < weekly.questions.length - 1) {
      setCurrentIndex((n) => n + 1);
      return;
    }
    setFinishedAt(Date.now());
  };

  const prevQuestion = () => {
    setCurrentIndex((n) => Math.max(0, n - 1));
  };

  const submit = async () => {
    if (!user || !weekly) {
      setShowAuthModal(true);
      return;
    }
    if (!finishedAt || !startedAt) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const id = await submitTriviaAttempt({
        weekKey: weekly.weekKey,
        language: weekly.language,
        score,
        durationMs: Math.max(1, Math.floor(finishedAt - startedAt)),
      });
      setSubmittedId(id);
      await loadBoard(weekly.weekKey, weekly.language);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit.');
    } finally {
      setSubmitting(false);
    }
  };

  const q = weekly?.questions?.[currentIndex] ?? null;
  const answered = typeof answers[currentIndex] === 'number' && answers[currentIndex] >= 0;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-[var(--text-muted)]">Weekly Trivia</p>
              <h1 className="text-3xl sm:text-4xl font-extrabold">
                BiB Film Brainfight
                <span className="ml-2 text-sm font-semibold text-[var(--text-muted)]">({activeLangMeta.label})</span>
              </h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                10 questions, picked fresh every week. Years: 2000 to 2026. Rank by score, then fastest time.
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 rounded-full bg-[var(--bg-secondary)] border border-white/10 text-sm hover:bg-[var(--bg-card)] transition-colors"
            >
              Back
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                className={[
                  'h-10 px-4 rounded-full border backdrop-blur-xl transition-all select-none',
                  'text-sm font-semibold',
                  lang === l.code
                    ? `bg-gradient-to-r ${l.glow} text-[#0b0d12] border-white/20 shadow-[0_14px_40px_rgba(0,0,0,0.35)]`
                    : 'bg-[var(--bg-secondary)]/70 text-[var(--text-primary)] border-white/10 hover:border-white/20 hover:bg-[var(--bg-card)]',
                ].join(' ')}
              >
                {l.label}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadWeekly(lang)}
                disabled={loadingWeekly}
                className="h-10 px-4 rounded-full bg-[var(--bg-secondary)] border border-white/10 text-sm font-semibold hover:bg-[var(--bg-card)] transition-colors disabled:opacity-60"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={start}
                disabled={loadingWeekly || !weekly}
                className={[
                  'h-10 px-5 rounded-full font-extrabold text-sm transition-all',
                  'border border-white/10 shadow-[0_12px_40px_rgba(0,0,0,0.35)]',
                  `bg-gradient-to-r ${activeLangMeta.glow} text-[#0b0d12]`,
                  'hover:brightness-110 active:scale-[0.99] disabled:opacity-60',
                ].join(' ')}
              >
                Start
              </button>
            </div>
          </div>
        </div>

        {weeklyError && (
          <div className="mt-6 p-4 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200">
            {weeklyError}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Quiz */}
          <div className="lg:col-span-7">
            <div className="rounded-3xl border border-white/10 bg-[var(--bg-card)]/75 backdrop-blur-xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="p-5 sm:p-6 border-b border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {weekly ? `Week: ${weekly.weekKey}` : 'Loading weekly set...'}
                    </p>
                    <p className="text-sm font-semibold mt-1">
                      {weekly ? `${weekly.languageLabel} cinema set` : ' '}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--text-muted)]">Timer</p>
                    <p className="text-lg font-extrabold tabular-nums">
                      {inProgress || finishedAt ? formatMs(durationMs) : '--:--'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 h-2 rounded-full bg-black/30 overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${activeLangMeta.glow}`}
                    style={{
                      width: weekly ? `${Math.min(100, ((currentIndex) / weekly.questions.length) * 100)}%` : '0%',
                    }}
                  />
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {loadingWeekly || !weekly ? (
                  <div className="py-16 text-center text-[var(--text-muted)]">
                    <div className="inline-flex items-center gap-3">
                      <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                      Loading weekly trivia...
                    </div>
                  </div>
                ) : finishedAt ? (
                  <div className="py-8">
                    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
                      <p className="text-[11px] uppercase tracking-[0.35em] text-[var(--text-muted)]">Result</p>
                      <div className="mt-2 flex items-end justify-between gap-4">
                        <div>
                          <p className="text-3xl font-extrabold">{score}/10</p>
                          <p className="text-sm text-[var(--text-muted)] mt-1">
                            Time: <span className="font-semibold text-[var(--text-primary)]">{formatMs(durationMs)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={resetRun}
                            className="h-10 px-4 rounded-full bg-[var(--bg-secondary)] border border-white/10 text-sm font-semibold hover:bg-[var(--bg-card)] transition-colors"
                          >
                            Try again
                          </button>
                          <button
                            type="button"
                            onClick={submit}
                            disabled={submitting || !!submittedId}
                            className={[
                              'h-10 px-5 rounded-full font-extrabold text-sm transition-all',
                              `bg-gradient-to-r ${activeLangMeta.glow} text-[#0b0d12]`,
                              'border border-white/10 hover:brightness-110 disabled:opacity-60',
                            ].join(' ')}
                          >
                            {submittedId ? 'Submitted' : submitting ? 'Submitting...' : 'Submit to leaderboard'}
                          </button>
                        </div>
                      </div>
                      {submitError && (
                        <div className="mt-4 text-sm text-red-200 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                          {submitError}
                        </div>
                      )}
                      {!user && (
                        <p className="mt-4 text-xs text-[var(--text-muted)]">
                          Sign in to appear on the leaderboard.
                        </p>
                      )}
                    </div>
                  </div>
                ) : !startedAt ? (
                  <div className="py-16 text-center">
                    <div className="mx-auto max-w-md">
                      <div className={`h-20 w-20 mx-auto rounded-3xl bg-gradient-to-br ${activeLangMeta.glow} shadow-[0_30px_80px_rgba(0,0,0,0.4)] flex items-center justify-center text-3xl`}>
                        🎬
                      </div>
                      <h2 className="mt-5 text-2xl font-extrabold">Ready for this week&apos;s 10?</h2>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        Hit Start. Finish fast. Flex on the leaderboard.
                      </p>
                      <button
                        type="button"
                        onClick={start}
                        className={[
                          'mt-6 h-11 px-6 rounded-full font-extrabold text-sm transition-all',
                          `bg-gradient-to-r ${activeLangMeta.glow} text-[#0b0d12]`,
                          'border border-white/10 shadow-[0_14px_40px_rgba(0,0,0,0.35)] hover:brightness-110 active:scale-[0.99]',
                        ].join(' ')}
                      >
                        Start weekly trivia
                      </button>
                      {!user && (
                        <p className="mt-4 text-xs text-[var(--text-muted)]">
                          You can play without logging in, but you need to sign in to rank.
                        </p>
                      )}
                    </div>
                  </div>
                ) : q ? (
                  <div>
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-24 rounded-2xl overflow-hidden bg-black/30 border border-white/10 flex-shrink-0">
                        {q.poster ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={q.poster} alt={q.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">🎞️</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-[var(--text-muted)]">
                          Question {currentIndex + 1} of {weekly.questions.length}
                        </p>
                        <h3 className="mt-1 text-xl sm:text-2xl font-extrabold leading-snug">{q.question}</h3>
                        <p className="mt-2 text-sm text-[var(--text-muted)]">
                          Movie: <span className="text-[var(--text-primary)] font-semibold">{q.title}</span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt, idx) => {
                        const selected = answers[currentIndex] === idx;
                        return (
                          <button
                            key={`${q.id}:${idx}`}
                            type="button"
                            onClick={() => pickOption(idx)}
                            className={[
                              'p-4 rounded-2xl text-left border transition-all',
                              'bg-black/20 hover:bg-black/28',
                              selected ? `border-white/30 ring-2 ring-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]` : 'border-white/10 hover:border-white/20',
                            ].join(' ')}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-semibold">{opt}</span>
                              {selected ? (
                                <span className={`px-2 py-1 rounded-full text-[10px] font-extrabold bg-gradient-to-r ${activeLangMeta.glow} text-[#0b0d12]`}>
                                  Selected
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-6 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={prevQuestion}
                        disabled={currentIndex === 0}
                        className="h-10 px-4 rounded-full bg-[var(--bg-secondary)] border border-white/10 text-sm font-semibold hover:bg-[var(--bg-card)] transition-colors disabled:opacity-50"
                      >
                        Back
                      </button>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums">
                        {answered ? 'Answer locked in.' : 'Pick an option to continue.'}
                      </div>
                      <button
                        type="button"
                        onClick={nextQuestion}
                        disabled={!answered}
                        className={[
                          'h-10 px-5 rounded-full font-extrabold text-sm transition-all',
                          `bg-gradient-to-r ${activeLangMeta.glow} text-[#0b0d12]`,
                          'border border-white/10 hover:brightness-110 disabled:opacity-60',
                        ].join(' ')}
                      >
                        {currentIndex === weekly.questions.length - 1 ? 'Finish' : 'Next'}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="lg:col-span-5">
            <div className="rounded-3xl border border-white/10 bg-[var(--bg-card)]/60 backdrop-blur-xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
              <div className="p-5 sm:p-6 border-b border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-[var(--text-muted)]">Leaderboard</p>
                    <h2 className="text-xl font-extrabold mt-1">This week&apos;s fastest minds</h2>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {weekly ? `${weekly.weekKey} · ${weekly.languageLabel}` : ' '}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => weekly && user && void loadBoard(weekly.weekKey, weekly.language)}
                    disabled={!weekly || !user || loadingBoard}
                    className="h-9 px-4 rounded-full bg-[var(--bg-secondary)] border border-white/10 text-sm font-semibold hover:bg-[var(--bg-card)] transition-colors disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {!user ? (
                  <div className="text-sm text-[var(--text-muted)]">
                    Sign in to see the leaderboard and to rank.
                  </div>
                ) : loadingBoard ? (
                  <div className="py-10 text-center text-[var(--text-muted)]">
                    <div className="inline-flex items-center gap-3">
                      <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                      Loading leaderboard...
                    </div>
                  </div>
                ) : boardError ? (
                  <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                    {boardError}
                    <p className="text-xs text-red-200/80 mt-2">
                      Run the Supabase trivia SQL to enable leaderboard RPCs.
                    </p>
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="text-sm text-[var(--text-muted)]">
                    No attempts yet. Be the first this week.
                  </div>
                ) : (
                  <>
                    {/* Winner panel */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {top3.map((entry, idx) => (
                        <div
                          key={entry.userId}
                          className={[
                            'rounded-2xl border border-white/10 bg-black/25 p-4 relative overflow-hidden',
                            idx === 0 ? 'sm:col-span-3' : '',
                          ].join(' ')}
                        >
                          <div className={`absolute -top-20 -right-24 h-52 w-52 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${activeLangMeta.glow}`} />
                          <div className="relative flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-black/35 border border-white/10 flex items-center justify-center text-lg">
                              {entry.avatar ?? entry.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold truncate">
                                {medal(idx + 1)} {entry.name}
                              </p>
                              <p className="text-xs text-[var(--text-muted)] truncate">
                                @{entry.username ?? 'user'} · {entry.score}/10 · {formatMs(entry.durationMs)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                      <div className="max-h-[420px] overflow-y-auto">
                        {leaderboard.map((entry, i) => (
                          <div
                            key={`${entry.userId}:${entry.createdAt}`}
                            className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 bg-black/10"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-7 text-xs font-extrabold text-[var(--text-muted)] tabular-nums">
                                {i + 1}
                              </div>
                              <div className="w-9 h-9 rounded-full bg-black/35 border border-white/10 flex items-center justify-center text-sm">
                                {entry.avatar ?? entry.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate">{entry.name}</p>
                                <p className="text-xs text-[var(--text-muted)] truncate">@{entry.username ?? 'user'}</p>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-extrabold tabular-nums">{entry.score}/10</p>
                              <p className="text-xs text-[var(--text-muted)] tabular-nums">{formatMs(entry.durationMs)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="mt-4 text-xs text-[var(--text-muted)]">
              Tip: This week&apos;s quiz updates automatically every week. Want more question types later (cast, directors, taglines)? We can add them.
            </div>
          </div>
        </div>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}

