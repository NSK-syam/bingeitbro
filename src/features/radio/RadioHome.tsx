'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  useEffect(() => {
    const savedStation = (safeLocalStorageGet(LAST_STATION_KEY) || '').trim();
    if (savedStation && RADIO_STATIONS.some((s) => s.id === savedStation)) {
      setSelectedStationId(savedStation);
    }
    setFavoriteIds(parseFavorites(safeLocalStorageGet(FAVORITES_KEY)));
  }, []);

  useEffect(() => {
    if (!selectedStationId) return;
    safeLocalStorageSet(LAST_STATION_KEY, selectedStationId);
  }, [selectedStationId]);

  useEffect(() => {
    safeLocalStorageSet(FAVORITES_KEY, JSON.stringify(favoriteIds));
  }, [favoriteIds]);

  const selectedStation = useMemo(
    () => RADIO_STATIONS.find((station) => station.id === selectedStationId) ?? null,
    [selectedStationId],
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
              {station.genre} • {station.country} • {station.language}
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
          <a
            href={station.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setSelectedStationId(station.id)}
            className="px-3 py-1.5 rounded-full bg-[var(--accent)] text-[var(--bg-primary)] text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Open station
          </a>

          <button
            type="button"
            onClick={() => setSelectedStationId(station.id)}
            className="px-3 py-1.5 rounded-full border border-white/15 text-sm text-[var(--text-secondary)] hover:border-white/35"
          >
            Select
          </button>
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
                Discover stations and open them on official websites.
              </h1>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                BiB only provides station discovery and external links. We do not host, retransmit, or record audio.
              </p>
            </div>

            <section className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
              <p className="font-semibold">Radio compliance notice</p>
              <p className="mt-1 text-amber-100/90">
                Playback happens on third-party station websites under their own terms, licenses, and regional rules.
              </p>
            </section>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <section className="lg:col-span-1 bg-[var(--bg-card)] border border-white/10 rounded-3xl p-4 sm:p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Featured Station</p>
                <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">
                  {selectedStation?.name ?? 'No station selected'}
                </h2>
                {selectedStation && (
                  <p className="text-sm text-[var(--text-secondary)] mt-2">{selectedStation.description}</p>
                )}

                {selectedStation && (
                  <a
                    href={selectedStation.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] hover:opacity-90"
                  >
                    Open station website
                  </a>
                )}

                <p className="text-[11px] text-[var(--text-muted)] mt-4">
                  BiB does not stream audio directly. Station availability and rights are managed by each broadcaster.
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
