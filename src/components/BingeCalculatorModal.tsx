'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type TimeUnit = 'day' | 'week' | 'month' | 'year';

const UNIT_TO_DAYS: Record<TimeUnit, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

type TvSuggestion = {
  id: number;
  name: string;
  first_air_date?: string;
  poster_path?: string | null;
};

type SearchTvResponse = { results?: unknown };

type TvDetails = {
  id: number;
  name: string;
  number_of_episodes: number;
  episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number | null } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function toString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(toNumber).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '';
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function getYearFromDate(date?: string) {
  if (!date) return '';
  const year = new Date(date).getFullYear();
  return Number.isFinite(year) ? String(year) : '';
}

export function BingeCalculatorModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<TvSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selected, setSelected] = useState<TvDetails | null>(null);
  const [detailsError, setDetailsError] = useState('');

  const [timeAmount, setTimeAmount] = useState(7);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('day');

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apiKey = (process.env.NEXT_PUBLIC_TMDB_API_KEY || '').trim();

  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Click outside to close suggestions
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setSuggestionOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isOpen]);

  // Debounced suggestion search (TV)
  useEffect(() => {
    if (!isOpen) return;
    if (!apiKey) {
      setSuggestions([]);
      setSuggestionOpen(false);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionOpen(false);
      return;
    }

    let cancelled = false;
    setLoadingSuggestions(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(q)}&page=1&include_adult=false`
        );
        const data = (await res.json()) as SearchTvResponse;
        const list: TvSuggestion[] = Array.isArray(data?.results)
          ? (data.results as unknown[]).slice(0, 8).flatMap((r) => {
              if (!isRecord(r)) return [];
              const id = toNumber(r.id);
              const name = toString(r.name);
              if (!id || !name) return [];
              const first_air_date = toString(r.first_air_date) ?? undefined;
              const poster_path = toString(r.poster_path) ?? null;
              return [{ id, name, first_air_date, poster_path }];
            })
          : [];
        if (!cancelled) {
          setSuggestions(list);
          setSuggestionOpen(list.length > 0);
          setSelectedIndex(-1);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setSuggestionOpen(false);
        }
      } finally {
        if (!cancelled) setLoadingSuggestions(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [apiKey, isOpen, query]);

  const selectSuggestion = async (s: TvSuggestion) => {
    setDetailsError('');
    setSelected(null);
    setSuggestionOpen(false);
    setQuery(s.name);
    if (!apiKey) {
      setDetailsError('TMDB API key missing. Add NEXT_PUBLIC_TMDB_API_KEY.');
      return;
    }
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${s.id}?api_key=${apiKey}`);
      const raw = (await res.json()) as unknown;
      if (!isRecord(raw)) {
        setDetailsError('Could not load show details. Try another show.');
        return;
      }
      const id = toNumber(raw.id);
      const name = toString(raw.name);
      const episodes = toNumber(raw.number_of_episodes);
      if (!id || !name || !episodes || episodes <= 0) {
        setDetailsError('Could not load show details. Try another show.');
        return;
      }
      const episode_run_time = toNumberArray(raw.episode_run_time);
      const last_episode_to_air_raw = isRecord(raw.last_episode_to_air) ? raw.last_episode_to_air : null;
      const lastRuntime = last_episode_to_air_raw ? toNumber(last_episode_to_air_raw.runtime) : null;
      setSelected({
        id,
        name,
        number_of_episodes: episodes,
        episode_run_time,
        last_episode_to_air: lastRuntime ? { runtime: lastRuntime } : null,
      });
    } catch {
      setDetailsError('Could not load show details. Try again.');
    }
  };

  const avgRuntimeMin = useMemo(() => {
    if (!selected) return 0;
    const runtimes = (selected.episode_run_time ?? []).filter((n) => Number.isFinite(n) && n > 0) as number[];
    if (runtimes.length > 0) {
      const sum = runtimes.reduce((a, b) => a + b, 0);
      return Math.round(sum / runtimes.length);
    }
    const last = selected.last_episode_to_air?.runtime;
    if (typeof last === 'number' && Number.isFinite(last) && last > 0) return Math.round(last);
    return 45; // safe-ish default when TMDB does not provide runtime
  }, [selected]);

  const calc = useMemo(() => {
    if (!selected) return null;
    const episodes = selected.number_of_episodes;
    const totalMin = episodes * avgRuntimeMin;
    const totalHours = totalMin / 60;
    const totalDaysNonstop = totalHours / 24;

    const days = clampInt(timeAmount, 1, 3650) * UNIT_TO_DAYS[timeUnit];
    const availableHours = days * 24;

    const can = totalHours <= availableHours;
    const episodesPerDay = episodes / days;
    const hoursPerDay = totalHours / days;

    return {
      episodes,
      totalHours,
      totalDaysNonstop,
      days,
      availableHours,
      can,
      episodesPerDay,
      hoursPerDay,
    };
  }, [avgRuntimeMin, selected, timeAmount, timeUnit]);

  const timeLabel = `${timeAmount} ${timeUnit}${timeAmount === 1 ? '' : 's'}`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={rootRef}
        className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto bg-[var(--bg-card)] rounded-2xl p-6 shadow-2xl border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)]">Can I Binge?</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Pick a show and a time window. We will estimate the pace.
          </p>
        </div>

        {!apiKey && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            Missing `NEXT_PUBLIC_TMDB_API_KEY`.
          </div>
        )}

        <div className="mt-6">
          <label className="text-sm font-medium text-[var(--text-primary)]">Search a show</label>
          <div className="relative mt-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
                setDetailsError('');
              }}
              onFocus={() => {
                if (suggestions.length > 0) setSuggestionOpen(true);
              }}
              onKeyDown={(e) => {
                if (!suggestionOpen || suggestions.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setSelectedIndex((i) => Math.max(i - 1, -1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const idx = selectedIndex >= 0 ? selectedIndex : 0;
                  const s = suggestions[idx];
                  if (s) void selectSuggestion(s);
                } else if (e.key === 'Escape') {
                  setSuggestionOpen(false);
                }
              }}
              placeholder="Type a TV show name..."
              className="w-full px-4 py-3 text-sm bg-[var(--bg-secondary)] border border-white/10 rounded-xl text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/50 transition-all"
            />

            {suggestionOpen && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--bg-card)] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                {loadingSuggestions ? (
                  <div className="px-4 py-3 text-sm text-[var(--text-muted)]">Searching...</div>
                ) : (
                  suggestions.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void selectSuggestion(s)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between transition-colors ${
                        idx === selectedIndex
                          ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
                      }`}
                    >
                      <span className="truncate text-sm">{s.name}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-3 flex-shrink-0">
                        {getYearFromDate(s.first_air_date)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {detailsError && (
            <div className="mt-3 text-sm text-red-300">{detailsError}</div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Time window</label>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="h-10 w-10 rounded-xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                onClick={() => setTimeAmount((v) => clampInt(v - 1, 1, 3650))}
              >
                -
              </button>
              <input
                value={timeAmount}
                onChange={(e) => setTimeAmount(clampInt(Number(e.target.value || 1), 1, 3650))}
                inputMode="numeric"
                className="flex-1 h-10 px-3 rounded-xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/60"
              />
              <select
                value={timeUnit}
                onChange={(e) => setTimeUnit(e.target.value as TimeUnit)}
                className="h-10 px-3 rounded-xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/60"
              >
                <option value="day">days</option>
                <option value="week">weeks</option>
                <option value="month">months</option>
                <option value="year">years</option>
              </select>
              <button
                type="button"
                className="h-10 w-10 rounded-xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] hover:bg-[var(--bg-card)]"
                onClick={() => setTimeAmount((v) => clampInt(v + 1, 1, 3650))}
              >
                +
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                { label: '1 day', amount: 1, unit: 'day' as const },
                { label: '1 week', amount: 1, unit: 'week' as const },
                { label: '1 month', amount: 1, unit: 'month' as const },
                { label: '3 months', amount: 3, unit: 'month' as const },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    setTimeAmount(p.amount);
                    setTimeUnit(p.unit);
                  }}
                  className="px-3 py-2 rounded-full text-xs bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-secondary)] hover:bg-[var(--bg-card)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-[var(--text-primary)]">Estimate</label>
            <div className="mt-2 rounded-xl bg-[var(--bg-secondary)]/70 border border-white/10 p-4">
              {!selected ? (
                <p className="text-sm text-[var(--text-muted)]">Select a show to see the binge plan.</p>
              ) : !calc ? null : (
                <div className="space-y-2">
                  <div className="text-sm text-[var(--text-secondary)]">
                    <span className="text-[var(--text-primary)] font-semibold">{selected.name}</span>
                    <span className="text-[var(--text-muted)]"> · {calc.episodes} episodes</span>
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Avg runtime: {avgRuntimeMin} min. Total: {formatNumber(calc.totalHours, 1)} hours.
                  </div>
                  <div className={`mt-2 rounded-lg px-3 py-2 text-sm border ${
                    calc.can
                      ? 'border-green-500/30 bg-green-500/10 text-green-200'
                      : 'border-red-500/30 bg-red-500/10 text-red-200'
                  }`}>
                    {calc.can ? (
                      <>
                        Yes, you can binge it in {timeLabel}. You will need about{' '}
                        <span className="font-semibold">{formatNumber(calc.episodesPerDay, 1)}</span> episodes per day
                        ({formatNumber(calc.hoursPerDay, 1)} hours/day).
                      </>
                    ) : (
                      <>
                        No. You would need to watch non stop for at least{' '}
                        <span className="font-semibold">{formatNumber(calc.totalDaysNonstop, 1)}</span> days.
                      </>
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    This is an estimate using TMDB metadata and average runtime. Episodes vary.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
