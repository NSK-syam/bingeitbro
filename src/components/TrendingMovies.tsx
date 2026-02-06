'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SendToFriendModal } from './SendToFriendModal';
import { useAuth } from './AuthProvider';

interface TrendingMovie {
  id: number;
  title: string;
  original_title: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date: string;
  overview: string;
  original_language: string;
  popularity: number;
  adult?: boolean;
}

const LANGUAGES = [
  { name: 'English', code: 'en', flag: '🇺🇸' },
  { name: 'Hindi', code: 'hi', flag: '🇮🇳' },
  { name: 'Telugu', code: 'te', flag: '🎬' },
  { name: 'Tamil', code: 'ta', flag: '🎭' },
  { name: 'Malayalam', code: 'ml', flag: '🌴' },
  { name: 'Korean', code: 'ko', flag: '🇰🇷' },
  { name: 'Japanese', code: 'ja', flag: '🇯🇵' },
  { name: 'Chinese', code: 'zh', flag: '🇨🇳' },
  { name: 'French', code: 'fr', flag: '🇫🇷' },
  { name: 'Spanish', code: 'es', flag: '🇪🇸' },
];
interface TrendingMoviesProps {
  searchQuery?: string;
}

export function TrendingMovies({ searchQuery = '' }: TrendingMoviesProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [movies, setMovies] = useState<TrendingMovie[]>([]);
  const [comingSoonByLang, setComingSoonByLang] = useState<Record<string, TrendingMovie[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendModalMovie, setSendModalMovie] = useState<TrendingMovie | null>(null);

  // Get language from URL or default to empty
  const selectedLang = searchParams.get('lang') || '';

  useEffect(() => {
    const controller = new AbortController();

    async function loadMovies() {
      const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
      if (!apiKey) {
        setError('API key missing');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        let allMovies: TrendingMovie[] = [];
        let allUpcoming: TrendingMovie[] = [];

        // If there's a search query, use the search API instead of discover
        if (searchQuery && searchQuery.trim()) {
          const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(searchQuery)}&page=1&include_adult=false`;
          const response = await fetch(searchUrl, { signal: controller.signal });
          const data = await response.json();

          allMovies = (data.results || []).filter((movie: TrendingMovie) => movie.poster_path && movie.vote_average > 0);

          // Don't fetch upcoming movies when searching
          setComingSoonByLang({});
        } else {
          // Original discover logic when no search query
          // Get date ranges
          const today = new Date().toISOString().split('T')[0];
          const sixMonthsFromNow = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          // Base URLs for released and upcoming movies
          // Sort by release date (newest first), require minimum votes for quality
          const releasedBaseUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=primary_release_date.desc&primary_release_date.lte=${today}&vote_count.gte=10`;
          const upcomingBaseUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&sort_by=primary_release_date.asc&primary_release_date.gte=${today}&primary_release_date.lte=${sixMonthsFromNow}`;

          const pagesToFetch = [1, 2, 3, 4, 5];

          if (selectedLang) {
            // Fetch for selected language
            const [releasedResponses, upcomingResponses] = await Promise.all([
              Promise.all(pagesToFetch.map(page =>
                fetch(`${releasedBaseUrl}&with_original_language=${selectedLang}&page=${page}`, { signal: controller.signal })
              )),
              Promise.all([1, 2].map(page =>
                fetch(`${upcomingBaseUrl}&with_original_language=${selectedLang}&page=${page}`, { signal: controller.signal })
              ))
            ]);

            const releasedData = await Promise.all(releasedResponses.map(r => r.json()));
            const upcomingData = await Promise.all(upcomingResponses.map(r => r.json()));

            allMovies = releasedData.flatMap(d => d.results || []);
            allUpcoming = upcomingData.flatMap(d => d.results || []);
          } else {
            // Fetch for ALL languages
            const langCodes = LANGUAGES.map(l => l.code);
            const releasedPromises: Promise<Response>[] = [];
            const upcomingPromises: Promise<Response>[] = [];

            for (const lang of langCodes) {
              for (const page of pagesToFetch) {
                releasedPromises.push(
                  fetch(`${releasedBaseUrl}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
              // Fetch 2 pages of upcoming per language
              for (const page of [1, 2]) {
                upcomingPromises.push(
                  fetch(`${upcomingBaseUrl}&with_original_language=${lang}&page=${page}`, { signal: controller.signal })
                );
              }
            }

            const [releasedResponses, upcomingResponses] = await Promise.all([
              Promise.all(releasedPromises),
              Promise.all(upcomingPromises)
            ]);

            const releasedData = await Promise.all(releasedResponses.map(r => r.json()));
            const upcomingData = await Promise.all(upcomingResponses.map(r => r.json()));

            allMovies = releasedData.flatMap(d => d.results || []);
            allUpcoming = upcomingData.flatMap(d => d.results || []);

            // Sort released movies by date (newest first)
            allMovies.sort((a, b) =>
              new Date(b.release_date || '1900-01-01').getTime() -
              new Date(a.release_date || '1900-01-01').getTime()
            );
          }

          // Filter out movies without posters
          // For released movies, also filter out those with 0 rating (not yet rated)
          allMovies = allMovies.filter(movie => movie.poster_path && movie.vote_average > 0);
          // For upcoming movies, keep them even with 0 rating (they're not released yet)
          allUpcoming = allUpcoming.filter(movie => movie.poster_path);

          // Group upcoming movies by language
          const upcomingByLang: Record<string, TrendingMovie[]> = {};
          for (const movie of allUpcoming) {
            const lang = movie.original_language;
            if (!upcomingByLang[lang]) {
              upcomingByLang[lang] = [];
            }
            upcomingByLang[lang].push(movie);
          }

          // Sort each language's movies by release date (soonest first)
          for (const lang in upcomingByLang) {
            upcomingByLang[lang].sort((a, b) =>
              new Date(a.release_date || '2099-01-01').getTime() -
              new Date(b.release_date || '2099-01-01').getTime()
            );
          }

          setComingSoonByLang(upcomingByLang);
        }

        setMovies(allMovies);

        if (allMovies.length === 0) {
          setError('No results');
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError('Failed to fetch');
        }
      }

      setLoading(false);
    }

    loadMovies();

    return () => controller.abort();
  }, [selectedLang, searchQuery]);

  const handleLanguageClick = (code: string) => {
    if (selectedLang === code) {
      // Clear the filter
      router.push('/', { scroll: false });
    } else {
      // Set the filter
      router.push(`/?lang=${code}`, { scroll: false });
    }
  };

  const getLangInfo = (code: string) => {
    return LANGUAGES.find(l => l.code === code) || { name: code.toUpperCase(), flag: '🌐' };
  };

  const currentLang = selectedLang ? getLangInfo(selectedLang) : null;


  return (
    <div>
      {/* Language filters */}
      <div className="bg-[var(--bg-secondary)] rounded-2xl p-4 mb-6 border border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] w-20">Filter by:</span>
          {selectedLang && (
            <button
              onClick={() => router.push('/', { scroll: false })}
              className="px-3 py-1.5 text-xs rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
            >
              Clear
            </button>
          )}
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageClick(lang.code)}
              className={`px-3 py-1.5 text-sm rounded-full transition-all flex items-center gap-1.5 ${selectedLang === lang.code
                ? 'bg-[var(--accent)] text-[var(--bg-primary)] font-medium'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
                }`}
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Coming Soon Sections - Only show when a language is selected */}
      {!loading && selectedLang && Object.keys(comingSoonByLang).length > 0 && (
        <div className="mb-10 space-y-8">
          {LANGUAGES.filter(lang =>
            comingSoonByLang[lang.code]?.length > 0 &&
            selectedLang === lang.code
          ).map((lang) => (
            <div key={`coming-soon-${lang.code}`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <span className="text-purple-400">🎬 Coming Soon</span>
                  <span className="text-[var(--text-muted)]">•</span>
                  <span>{lang.flag} {lang.name}</span>
                </h3>
                <span className="text-xs text-[var(--text-muted)]">
                  {comingSoonByLang[lang.code]?.length || 0} upcoming
                </span>
              </div>

              {/* Horizontal Scrolling Container */}
              <div className="relative">
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-[var(--bg-card)] scrollbar-track-transparent">
                  {comingSoonByLang[lang.code]?.map((movie) => {
                    const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
                    const formattedDate = releaseDate
                      ? releaseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                      : 'TBA';

                    return (
                      <Link
                        key={`upcoming-${movie.id}`}
                        href={`/movie/tmdb-${movie.id}?from=${lang.code}`}
                        scroll={false}
                        className="group flex-shrink-0 w-36 sm:w-40 bg-[var(--bg-card)] rounded-xl overflow-hidden card-hover"
                      >
                        <div className="relative aspect-[2/3] overflow-hidden">
                          {movie.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                              alt={movie.title}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[var(--bg-secondary)] flex items-center justify-center">
                              <span className="text-3xl">🎬</span>
                            </div>
                          )}

                          <div className="absolute inset-0 bg-gradient-to-t from-purple-900/90 via-transparent to-transparent" />

                          {/* Coming Soon Badge */}
                          <div className="absolute top-2 left-2 right-2">
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-purple-500 rounded text-white">
                              COMING SOON
                            </span>
                          </div>

                          {/* Release Date */}
                          <div className="absolute bottom-2 left-2 right-2">
                            <div className="flex items-center gap-1 text-white">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-xs font-semibold">{formattedDate}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-2">
                          <h4 className="font-medium text-[var(--text-primary)] line-clamp-1 group-hover:text-purple-400 transition-colors text-sm">
                            {movie.title}
                          </h4>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {/* Scroll fade effect */}
                <div className="absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-[var(--bg-primary)] to-transparent pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Section title */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          {searchQuery ? (
            <>
              🔍 <span>Search: "{searchQuery}"</span>
            </>
          ) : currentLang ? (
            <>
              {currentLang.flag}
              <span>{currentLang.name} Movies</span>
            </>
          ) : (
            <>
              🔥 <span>Latest & Trending</span>
            </>
          )}
        </h3>
        <span className="text-sm text-[var(--text-muted)]">
          {loading ? '...' : `${movies.length} movies`}
        </span>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-center py-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : movies.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {movies.map((movie) => {
            const langInfo = getLangInfo(movie.original_language);
            return (
              <Link
                key={movie.id}
                href={`/movie/tmdb-${movie.id}${selectedLang ? `?from=${selectedLang}` : ''}`}
                scroll={false}
                className="group block bg-[var(--bg-card)] rounded-xl overflow-hidden card-hover"
              >
                <div className="relative aspect-[2/3] overflow-hidden">
                  {movie.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                      alt={movie.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--bg-secondary)] flex items-center justify-center">
                      <span className="text-4xl">🎬</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent opacity-80" />

                  {movie.vote_average > 0 && (
                    <div className="absolute top-3 right-3">
                      <span className="flex items-center gap-1 px-2 py-1 text-xs font-bold bg-[var(--accent)]/90 backdrop-blur-sm rounded-md text-[var(--bg-primary)]">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {movie.vote_average.toFixed(1)}
                      </span>
                    </div>
                  )}

                  <div className="absolute top-3 left-3 flex flex-col gap-1">
                    <span className="px-2 py-1 text-xs font-medium bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-md text-[var(--text-secondary)]">
                      {langInfo.flag}
                    </span>
                    {movie.adult && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600/90 backdrop-blur-sm rounded-md text-white">
                        18+
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3">
                  <h4 className="font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors text-sm">
                    {movie.title}
                  </h4>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {movie.release_date?.split('-')[0] || 'TBA'} • {langInfo.name}
                  </p>
                  {/* Send to Friend button - only for authenticated users */}
                  {user && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSendModalMovie(movie);
                      }}
                      className="mt-2 w-full text-xs px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 transition-all bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                      title="Send to friend"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      Send
                    </button>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🎬</div>
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            No movies found
          </h3>
          <p className="text-[var(--text-secondary)]">
            Try selecting a different language
          </p>
        </div>
      )}

      {/* Send to Friend Modal */}
      {sendModalMovie && (
        <SendToFriendModal
          isOpen={!!sendModalMovie}
          onClose={() => setSendModalMovie(null)}
          movieId={`tmdb-${sendModalMovie.id}`}
          movieTitle={sendModalMovie.title}
          moviePoster={sendModalMovie.poster_path ? `https://image.tmdb.org/t/p/w300${sendModalMovie.poster_path}` : ''}
          movieYear={parseInt(sendModalMovie.release_date?.split('-')[0] || '0')}
          tmdbId={String(sendModalMovie.id)}
        />
      )}
    </div>
  );
}
