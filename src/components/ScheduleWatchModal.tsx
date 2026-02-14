'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchTmdbWithProxy } from '@/lib/tmdb-fetch';
import {
  deleteWatchReminder,
  getUpcomingWatchReminders,
  type WatchReminder,
  upsertWatchReminder,
} from '@/lib/supabase-rest';
import {
  formatLocalDateTimeInput,
  getResolvedTimeZone,
  parseLocalDateTimeInput,
} from '@/lib/local-datetime';

type SearchMovie = {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string | null;
  original_language?: string;
  vote_average?: number;
};

function toYear(value?: string): number | null {
  if (!value) return null;
  const d = new Date(value);
  const y = d.getFullYear();
  return Number.isFinite(y) ? y : null;
}

function defaultInputValue() {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return formatLocalDateTimeInput(nextHour);
}

function toIsoFromInput(value: string): string | null {
  const parsed = parseLocalDateTimeInput(value);
  if (!parsed) return null;
  return parsed.toISOString();
}

function flagFromLanguage(lang?: string) {
  const key = (lang || '').toLowerCase();
  if (key === 'en') return 'EN';
  if (key === 'hi') return 'HI';
  if (key === 'te') return 'TE';
  if (key === 'ta') return 'TA';
  if (key === 'ml') return 'ML';
  if (key === 'kn') return 'KN';
  if (key === 'mr') return 'MR';
  if (key === 'bn') return 'BN';
  if (key === 'es') return 'ES';
  if (key === 'fr') return 'FR';
  if (key === 'ja') return 'JA';
  if (key === 'ko') return 'KO';
  return key ? key.toUpperCase() : 'NA';
}

export function ScheduleWatchModal({
  isOpen,
  onClose,
  onScheduled,
}: {
  isOpen: boolean;
  onClose: () => void;
  onScheduled?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SearchMovie | null>(null);
  const [remindAt, setRemindAt] = useState(defaultInputValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [scheduled, setScheduled] = useState<WatchReminder[]>([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [removingMovieId, setRemovingMovieId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tmdbApiKey = (process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim();
  const userTimeZone = useMemo(() => getResolvedTimeZone(), []);

  const formatScheduleTime = (value: string) =>
    new Date(value).toLocaleString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const loadScheduled = async () => {
    setScheduledLoading(true);
    try {
      const reminders = await getUpcomingWatchReminders();
      const now = Date.now();
      const upcoming = reminders
        .filter((r) => !r.canceledAt && new Date(r.remindAt).getTime() >= now)
        .sort((a, b) => new Date(a.remindAt).getTime() - new Date(b.remindAt).getTime());
      setScheduled(upcoming);
    } catch {
      setScheduled([]);
    } finally {
      setScheduledLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => inputRef.current?.focus(), 0);
    void loadScheduled();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSelected(null);
      setRemindAt(defaultInputValue());
      setSaving(false);
      setLoading(false);
      setError('');
      setSuccess('');
      setHighlightIndex(-1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!tmdbApiKey) {
      setResults([]);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setHighlightIndex(-1);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetchTmdbWithProxy(
          `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(q)}&page=1&include_adult=false`,
        );
        const data = (await response.json().catch(() => ({}))) as { results?: unknown[] };
        const list = Array.isArray(data.results) ? data.results : [];
        const mapped: SearchMovie[] = list
          .slice(0, 10)
          .flatMap((item): SearchMovie[] => {
            if (!item || typeof item !== 'object') return [];
            const row = item as Record<string, unknown>;
            const id = typeof row.id === 'number' ? row.id : Number(row.id);
            const title = typeof row.title === 'string' ? row.title.trim() : '';
            if (!Number.isFinite(id) || !title) return [];
            return [{
              id,
              title,
              release_date: typeof row.release_date === 'string' ? row.release_date : undefined,
              poster_path: typeof row.poster_path === 'string' ? row.poster_path : null,
              original_language: typeof row.original_language === 'string' ? row.original_language : undefined,
              vote_average: typeof row.vote_average === 'number' ? row.vote_average : undefined,
            }];
          });
        if (!cancelled) {
          setResults(mapped);
          setHighlightIndex(mapped.length > 0 ? 0 : -1);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, query, tmdbApiKey]);

  const selectedPoster = useMemo(() => {
    if (!selected?.poster_path) return '';
    return `https://image.tmdb.org/t/p/w300${selected.poster_path}`;
  }, [selected?.poster_path]);

  const handleSelect = (movie: SearchMovie) => {
    setSelected(movie);
    setQuery(movie.title);
    setResults([]);
    setError('');
    setSuccess('');
  };

  const handleSave = async () => {
    if (!selected) {
      setError('Select a movie first.');
      return;
    }
    const remindAtIso = toIsoFromInput(remindAt);
    if (!remindAtIso) {
      setError('Pick a valid reminder time.');
      return;
    }
    if (new Date(remindAtIso).getTime() < Date.now()) {
      setError('Reminder time should be in the future.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await upsertWatchReminder({
        movieId: `tmdb-${selected.id}`,
        movieTitle: selected.title,
        moviePoster: selectedPoster || null,
        movieYear: toYear(selected.release_date),
        remindAt: remindAtIso,
      });
      await loadScheduled();
      onScheduled?.();
      setSuccess(`Scheduled "${selected.title}"`);
      setTimeout(() => onClose(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveScheduled = async (movieId: string) => {
    setRemovingMovieId(movieId);
    setError('');
    setSuccess('');
    try {
      await deleteWatchReminder(movieId);
      await loadScheduled();
      onScheduled?.();
      setSuccess('Removed scheduled reminder.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove reminder.');
    } finally {
      setRemovingMovieId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-cyan-300/20 bg-[var(--bg-card)] p-6 sm:p-7 shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close schedule watch"
        >
          <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200/80">Schedule Watch</p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">Pick a movie and set reminder</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Search a movie, select it, choose date & time, and BiB reminds you to watch.
          </p>
        </div>

        {!tmdbApiKey && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Missing `NEXT_PUBLIC_TMDB_API_KEY`.
          </div>
        )}

        <div className="mt-6">
          <label className="text-sm font-medium text-[var(--text-primary)]">Search movie</label>
          <div className="relative mt-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError('');
                setSuccess('');
              }}
              onKeyDown={(e) => {
                if (results.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightIndex((prev) => Math.max(prev - 1, 0));
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const idx = highlightIndex >= 0 ? highlightIndex : 0;
                  const pick = results[idx];
                  if (pick) handleSelect(pick);
                }
              }}
              placeholder="Search movies..."
              className="w-full rounded-2xl border border-white/10 bg-[var(--bg-secondary)] px-4 py-3 pl-11 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
            />
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          {results.length > 0 && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/80">
              {results.map((movie, idx) => {
                const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w185${movie.poster_path}` : '';
                const year = toYear(movie.release_date);
                return (
                  <button
                    key={movie.id}
                    onClick={() => handleSelect(movie)}
                    className={[
                      'w-full px-3 py-2.5 text-left flex items-center gap-3 border-b border-white/5 last:border-b-0 transition-colors',
                      idx === highlightIndex ? 'bg-cyan-500/20' : 'hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="w-10 h-14 rounded-md overflow-hidden bg-[var(--bg-primary)]/60 flex-shrink-0">
                      {poster ? (
                        <img src={poster} alt={movie.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">🎬</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">{movie.title}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {year ?? 'Unknown'} · {flagFromLanguage(movie.original_language)} · ★ {(movie.vote_average ?? 0).toFixed(1)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)] items-start">
          <div className="w-[140px] aspect-[2/3] rounded-xl overflow-hidden bg-[var(--bg-secondary)]/70 border border-white/10">
            {selectedPoster ? (
              <img src={selectedPoster} alt={selected?.title || 'Selected movie'} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] text-xs">
                <span className="text-2xl mb-2">🎞️</span>
                Select movie
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">Selected movie</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {selected ? selected.title : 'No movie selected yet'}
            </p>
            {selected && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {toYear(selected.release_date) ?? 'Unknown year'} · TMDB #{selected.id}
              </p>
            )}

            <div className="mt-4">
              <label className="text-sm font-medium text-[var(--text-primary)]">Remind me at</label>
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                min={defaultInputValue()}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-[var(--bg-secondary)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
              />
              <p className="mt-2 text-xs text-[var(--text-muted)]">Your timezone: {userTimeZone}</p>
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            {success && <p className="mt-3 text-sm text-emerald-300">{success}</p>}

            <div className="mt-5 flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-white/10 text-sm text-[var(--text-secondary)] hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !selected}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-[#071018] bg-gradient-to-r from-cyan-300 to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Scheduling...' : 'Schedule reminder'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-[var(--bg-secondary)]/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Your scheduled reminders</p>
            <span className="text-xs text-[var(--text-muted)]">
              {scheduledLoading ? 'Loading...' : `${scheduled.length} upcoming`}
            </span>
          </div>

          {!scheduledLoading && scheduled.length === 0 && (
            <p className="mt-2 text-sm text-[var(--text-muted)]">No upcoming reminders yet.</p>
          )}

          {!scheduledLoading && scheduled.length > 0 && (
            <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
              {scheduled.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-[var(--bg-card)]/70 p-2.5"
                >
                  <div className="w-10 h-14 rounded-md overflow-hidden bg-[var(--bg-primary)]/50 flex-shrink-0">
                    {item.moviePoster ? (
                      <img src={item.moviePoster} alt={item.movieTitle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm">🎬</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--text-primary)] truncate">{item.movieTitle}</p>
                    <p className="text-xs text-cyan-200/85 mt-0.5">{formatScheduleTime(item.remindAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveScheduled(item.movieId)}
                    disabled={removingMovieId === item.movieId}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-red-400/35 text-red-300 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {removingMovieId === item.movieId ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
