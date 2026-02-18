'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthModal } from '@/components/AuthModal';
import { BibSplash } from '@/components/BibSplash';
import { Header } from '@/components/Header';
import { HelpBotWidget } from '@/components/HelpBotWidget';
import { HubTabs } from '@/components/HubTabs';
import { SongBackground } from '@/components/SongBackground';
import { useAuth } from '@/components/AuthProvider';
import { RADIO_STATIONS, type RadioStation } from '@/data/radio-stations';
import { safeLocalStorageGet, safeLocalStorageSet } from '@/lib/safe-storage';

const LAST_STATION_KEY = 'bib-radio-last-station';
const LAST_VOLUME_KEY = 'bib-radio-volume';
const FAVORITES_KEY = 'bib-radio-favorites';

function parseFavorites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => typeof x === 'string');
  } catch {
    return [];
  }
}

export default function RadioHome() {
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [query, setQuery] = useState('');
  const [genreFilter, setGenreFilter] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [selectedStationId, setSelectedStationId] = useState(RADIO_STATIONS[0]?.id ?? '');
  const [pendingAutoPlayId, setPendingAutoPlayId] = useState<string | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [streamError, setStreamError] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const savedStation = (safeLocalStorageGet(LAST_STATION_KEY) || '').trim();
    if (savedStation && RADIO_STATIONS.some((s) => s.id === savedStation)) {
      setSelectedStationId(savedStation);
    }

    const savedVolume = Number(safeLocalStorageGet(LAST_VOLUME_KEY) || '');
    if (!Number.isNaN(savedVolume) && savedVolume >= 0 && savedVolume <= 1) {
      setVolume(savedVolume);
    }

    setFavoriteIds(parseFavorites(safeLocalStorageGet(FAVORITES_KEY)));
  }, []);

  useEffect(() => {
    if (!selectedStationId) return;
    safeLocalStorageSet(LAST_STATION_KEY, selectedStationId);
  }, [selectedStationId]);

  useEffect(() => {
    safeLocalStorageSet(LAST_VOLUME_KEY, String(volume));
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    safeLocalStorageSet(FAVORITES_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  const selectedStation = useMemo(
    () => RADIO_STATIONS.find((station) => station.id === selectedStationId) ?? null,
    [selectedStationId]
  );

  const genres = useMemo(() => {
    const values = Array.from(new Set(RADIO_STATIONS.map((station) => station.genre))).sort();
    return ['all', ...values];
  }, []);

  const countries = useMemo(() => {
    const values = Array.from(new Set(RADIO_STATIONS.map((station) => station.country))).sort();
    return ['all', ...values];
  }, []);

  const filteredStations = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result = RADIO_STATIONS.filter((station) => {
      if (genreFilter !== 'all' && station.genre !== genreFilter) return false;
      if (countryFilter !== 'all' && station.country !== countryFilter) return false;
      if (!q) return true;

      const haystack = [
        station.name,
        station.genre,
        station.country,
        station.language,
        station.description,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });

    return result.sort((a, b) => {
      const favA = favoriteIds.includes(a.id) ? 1 : 0;
      const favB = favoriteIds.includes(b.id) ? 1 : 0;
      if (favA !== favB) return favB - favA;
      return a.name.localeCompare(b.name);
    });
  }, [query, genreFilter, countryFilter, favoriteIds]);

  const pauseCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  const playCurrent = useCallback(async () => {
    if (!selectedStation) return;
    const audio = audioRef.current;
    if (!audio) return;

    setStreamError('');
    setIsBuffering(true);

    try {
      audio.volume = volume;
      const maybePromise = audio.play();
      if (maybePromise) {
        await maybePromise;
      }
      setIsPlaying(true);
      setIsBuffering(false);
    } catch {
      setIsPlaying(false);
      setIsBuffering(false);
      setStreamError('Playback was blocked or the stream is unavailable. Please try another station.');
    }
  }, [selectedStation, volume]);

  const stopCurrent = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setIsBuffering(false);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.load();
    setIsPlaying(false);
    setIsBuffering(false);
    setStreamError('');
  }, [selectedStationId]);

  useEffect(() => {
    if (!pendingAutoPlayId) return;
    if (pendingAutoPlayId !== selectedStationId) return;

    setPendingAutoPlayId(null);
    void playCurrent();
  }, [pendingAutoPlayId, selectedStationId, playCurrent]);

  const handlePlayStation = (stationId: string) => {
    setPendingAutoPlayId(stationId);
    setSelectedStationId(stationId);
  };

  const toggleFavorite = (stationId: string) => {
    setFavoriteIds((prev) => {
      if (prev.includes(stationId)) {
        return prev.filter((id) => id !== stationId);
      }
      return [...prev, stationId];
    });
  };

  const renderStationCard = (station: RadioStation) => {
    const isSelected = station.id === selectedStationId;
    const isFavorite = favoriteIds.includes(station.id);

    return (
      <div
        key={station.id}
        className={`rounded-2xl border p-4 transition-colors ${
          isSelected
            ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10'
            : 'border-white/10 bg-[var(--bg-secondary)]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{station.name}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {station.genre} • {station.country} • {station.bitrate}
            </p>
          </div>
          <button
            type="button"
            onClick={() => toggleFavorite(station.id)}
            className="px-2 py-1 rounded-lg text-xs border border-white/15 hover:border-white/35 text-[var(--text-secondary)]"
          >
            {isFavorite ? 'Saved' : 'Save'}
          </button>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mt-3">{station.description}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handlePlayStation(station.id)}
            className="px-3 py-1.5 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Play
          </button>

          <button
            type="button"
            onClick={() => setSelectedStationId(station.id)}
            className="px-3 py-1.5 rounded-full border border-white/15 text-sm text-[var(--text-secondary)] hover:border-white/35"
          >
            Select
          </button>

          <a
            href={station.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-full border border-white/15 text-sm text-[var(--text-secondary)] hover:border-white/35"
          >
            Website
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen relative">
      <BibSplash enabled={!user && showAuthModal} />
      <SongBackground />

      <Header searchMode="off" onLoginClick={() => setShowAuthModal(true)} />
      {user && <HubTabs placement="center" />}
      {user && <HelpBotWidget />}

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-16">
        {!user ? (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Radio</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">
                Live radio streams for every mood.
              </h1>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Pick a station, press play, and keep browsing BiB while audio continues in the background tab.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <section className="lg:col-span-1 bg-[var(--bg-card)] border border-white/10 rounded-3xl p-4 sm:p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Now Playing</p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                  {selectedStation?.name ?? 'No station selected'}
                </h2>
                {selectedStation && (
                  <p className="text-sm text-[var(--text-secondary)] mt-2">{selectedStation.description}</p>
                )}

                <div className="mt-5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void playCurrent()}
                    disabled={!selectedStation || isBuffering}
                    className="px-4 py-2 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                  >
                    {isBuffering ? 'Loading...' : 'Play'}
                  </button>
                  <button
                    type="button"
                    onClick={pauseCurrent}
                    disabled={!isPlaying}
                    className="px-4 py-2 rounded-full border border-white/15 text-sm text-[var(--text-secondary)] hover:border-white/35 disabled:opacity-60"
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={stopCurrent}
                    className="px-4 py-2 rounded-full border border-white/15 text-sm text-[var(--text-secondary)] hover:border-white/35"
                  >
                    Stop
                  </button>
                </div>

                <div className="mt-5">
                  <label className="text-xs text-[var(--text-muted)]">Volume</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full mt-2"
                  />
                </div>

                <p className="text-xs text-[var(--text-muted)] mt-4">
                  {isPlaying ? 'Status: playing' : 'Status: idle'}
                </p>

                {streamError && (
                  <div className="mt-4 p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
                    {streamError}
                  </div>
                )}

                {selectedStation && (
                  <audio
                    ref={audioRef}
                    src={selectedStation.streamUrl}
                    preload="none"
                    onCanPlay={() => setIsBuffering(false)}
                    onPlaying={() => {
                      setIsPlaying(true);
                      setIsBuffering(false);
                      setStreamError('');
                    }}
                    onPause={() => setIsPlaying(false)}
                    onError={() => {
                      setIsPlaying(false);
                      setIsBuffering(false);
                      setStreamError('Unable to load this stream right now. Please choose another station.');
                    }}
                  />
                )}

                <p className="text-[11px] text-[var(--text-muted)] mt-4">
                  Station availability can vary by region and broadcaster uptime.
                </p>
              </section>

              <section className="lg:col-span-2 bg-[var(--bg-card)] border border-white/10 rounded-3xl p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-3">
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Search</label>
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search station, genre, country"
                      className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Genre</label>
                    <select
                      value={genreFilter}
                      onChange={(e) => setGenreFilter(e.target.value)}
                      className="w-full px-3 py-3 rounded-2xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50"
                    >
                      {genres.map((genre) => (
                        <option key={genre} value={genre}>
                          {genre === 'all' ? 'All genres' : genre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Country</label>
                    <select
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                      className="w-full px-3 py-3 rounded-2xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50"
                    >
                      {countries.map((country) => (
                        <option key={country} value={country}>
                          {country === 'all' ? 'All countries' : country}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Results</label>
                    <div className="w-full px-3 py-3 rounded-2xl bg-[var(--bg-secondary)] border border-white/10 text-sm text-[var(--text-secondary)]">
                      {filteredStations.length} station{filteredStations.length === 1 ? '' : 's'}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredStations.length === 0 ? (
                    <div className="md:col-span-2 p-4 rounded-2xl border border-white/10 bg-[var(--bg-secondary)] text-sm text-[var(--text-secondary)]">
                      No stations match these filters. Try clearing one filter.
                    </div>
                  ) : (
                    filteredStations.map(renderStationCard)
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
