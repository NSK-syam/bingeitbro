'use client';

import { Recommendation, OTTLink } from '@/types';
import data from '@/data/recommendations.json';
import Link from 'next/link';
import { notFound, useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { WatchedButton } from '@/components/WatchedButton';
import { WatchlistButton } from '@/components/WatchlistButton';
import { useWatched } from '@/hooks';
import { createClient, isSupabaseConfigured, DBRecommendation } from '@/lib/supabase';

interface PageProps {
  params: Promise<{ id: string }>;
}

function PosterImage({ src, alt, title }: { src: string; alt: string; title: string }) {
  const [error, setError] = useState(false);

  const getPlaceholderColor = (str: string) => {
    const colors = ['#e50914', '#00a8e1', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (error) {
    return (
      <div
        className="absolute inset-0 flex flex-col items-center justify-center p-4"
        style={{ backgroundColor: getPlaceholderColor(title) }}
      >
        <span className="text-6xl mb-4">🎬</span>
        <span className="text-white text-lg font-semibold text-center">{title}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
}

function BackdropImage({ src, posterSrc, alt, title }: { src?: string; posterSrc: string; alt: string; title: string }) {
  const [error, setError] = useState(false);

  const getPlaceholderColor = (str: string) => {
    const colors = ['#e50914', '#00a8e1', '#f59e0b', '#8b5cf6', '#ec4899', '#10b981'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  if (error) {
    return (
      <div
        className="absolute inset-0"
        style={{ backgroundColor: getPlaceholderColor(title) }}
      />
    );
  }

  return (
    <img
      src={src || posterSrc}
      alt={alt}
      className={`absolute inset-0 w-full h-full object-cover ${!src ? 'blur-sm scale-110' : ''}`}
      onError={() => setError(true)}
    />
  );
}

export default function MoviePage({ params }: PageProps) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const fromLang = searchParams.get('from');
  const backUrl = fromLang ? `/?lang=${fromLang}` : '/';

  const staticRecommendations = data.recommendations as Recommendation[];
  const { isWatched } = useWatched();

  // State for handling dynamic data
  const [movie, setMovie] = useState<Recommendation | null>(() => {
    // Try to find in static data first
    return staticRecommendations.find((r) => r.id === id) || null;
  });
  const [loading, setLoading] = useState(!movie);
  const [error, setError] = useState(false);
  const [regionNote, setRegionNote] = useState('');

  useEffect(() => {
    // If we already have the movie (from static data), no need to fetch
    if (movie) {
      setLoading(false);
      return;
    }

    const fetchMovie = async () => {
      setLoading(true);
      setError(false);

      try {
        // Check if this is a TMDB movie (id starts with "tmdb-")
        if (id.startsWith('tmdb-')) {
          const tmdbId = id.replace('tmdb-', '');
          const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;

          if (!apiKey) {
            setError(true);
            return;
          }

          // Fetch movie details, watch providers, and release dates in parallel
          const [movieResponse, providersResponse, releaseDatesResponse] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&append_to_response=credits`),
            fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/watch/providers?api_key=${apiKey}`),
            fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${apiKey}`)
          ]);

          if (!movieResponse.ok) {
            setError(true);
            return;
          }

          const tmdbData = await movieResponse.json();
          const providersData = await providersResponse.json();
          const releaseDatesData = await releaseDatesResponse.json();

          // Extract certification from release dates (prioritize IN, then US)
          let certification: string | undefined;
          const releaseResults = releaseDatesData.results || [];
          const indiaRelease = releaseResults.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'IN');
          const usRelease = releaseResults.find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'US');

          if (indiaRelease?.release_dates?.[0]?.certification) {
            certification = indiaRelease.release_dates[0].certification;
          } else if (usRelease?.release_dates?.[0]?.certification) {
            certification = usRelease.release_dates[0].certification;
          } else if (tmdbData.adult) {
            certification = '18+';
          }

          // Map language codes to full names
          const languageMap: Record<string, string> = {
            en: 'English', hi: 'Hindi', te: 'Telugu', ta: 'Tamil',
            ml: 'Malayalam', ko: 'Korean', ja: 'Japanese', zh: 'Chinese',
            fr: 'French', es: 'Spanish', de: 'German', it: 'Italian',
          };

          // Extract watch providers for India (IN) and US
          const ottLinks: OTTLink[] = [];
          const platformsByRegion: Record<string, { regions: string[] }> = {};

          // Direct links to OTT platforms (search URLs)
          const getDirectOttLink = (platformName: string, movieTitle: string): string => {
            const encodedTitle = encodeURIComponent(movieTitle);
            const lowerName = platformName.toLowerCase();

            // Check for platform keywords and return direct links
            if (lowerName.includes('netflix')) {
              return `https://www.netflix.com/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('prime') || lowerName.includes('amazon')) {
              return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodedTitle}`;
            }
            if (lowerName.includes('hotstar') || lowerName.includes('disney')) {
              return `https://www.hotstar.com/in/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('aha')) {
              return `https://www.aha.video/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('youtube')) {
              return `https://www.youtube.com/results?search_query=${encodedTitle}+full+movie`;
            }
            if (lowerName.includes('apple')) {
              return `https://tv.apple.com/search?term=${encodedTitle}`;
            }
            if (lowerName.includes('zee5')) {
              return `https://www.zee5.com/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('sony') || lowerName.includes('sonyliv')) {
              return `https://www.sonyliv.com/search?searchTerm=${encodedTitle}`;
            }
            if (lowerName.includes('jio')) {
              return `https://www.jiocinema.com/search/${encodedTitle}`;
            }
            if (lowerName.includes('hulu')) {
              return `https://www.hulu.com/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('hbo') || lowerName === 'max') {
              return `https://www.max.com/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('peacock')) {
              return `https://www.peacocktv.com/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('paramount')) {
              return `https://www.paramountplus.com/search/?q=${encodedTitle}`;
            }
            if (lowerName.includes('lionsgate')) {
              return `https://www.lionsgateplay.com/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('voot')) {
              return `https://www.voot.com/search?q=${encodedTitle}`;
            }
            if (lowerName.includes('mx player')) {
              return `https://www.mxplayer.in/search?query=${encodedTitle}`;
            }
            if (lowerName.includes('sun nxt')) {
              return `https://www.sunnxt.com/search?query=${encodedTitle}`;
            }
            // Fallback to Google search
            return `https://www.google.com/search?q=${encodedTitle}+watch+online+${encodeURIComponent(platformName)}`;
          };

          const indiaData = providersData.results?.IN;
          const usaData = providersData.results?.US;

          // Filter out ad-supported tiers
          const shouldSkipProvider = (name: string) => {
            const lowerName = name.toLowerCase();
            return lowerName.includes('ads') || lowerName.includes('ad-supported');
          };

          // Process India providers
          if (indiaData) {
            const indiaProviders = [
              ...(indiaData.flatrate || []),
              ...(indiaData.rent || []),
              ...(indiaData.buy || []),
            ];
            for (const provider of indiaProviders) {
              if (shouldSkipProvider(provider.provider_name)) continue;
              if (!platformsByRegion[provider.provider_name]) {
                platformsByRegion[provider.provider_name] = { regions: [] };
              }
              if (!platformsByRegion[provider.provider_name].regions.includes('India')) {
                platformsByRegion[provider.provider_name].regions.push('India');
              }
            }
          }

          // Process USA providers
          if (usaData) {
            const usaProviders = [
              ...(usaData.flatrate || []),
              ...(usaData.rent || []),
              ...(usaData.buy || []),
            ];
            for (const provider of usaProviders) {
              if (shouldSkipProvider(provider.provider_name)) continue;
              if (!platformsByRegion[provider.provider_name]) {
                platformsByRegion[provider.provider_name] = { regions: [] };
              }
              if (!platformsByRegion[provider.provider_name].regions.includes('USA')) {
                platformsByRegion[provider.provider_name].regions.push('USA');
              }
            }
          }

          // Convert to ottLinks array with direct platform links
          for (const [platform, data] of Object.entries(platformsByRegion)) {
            ottLinks.push({
              platform,
              url: getDirectOttLink(platform, tmdbData.title),
              availableIn: data.regions.join(' & '),
            });
          }

          // Check availability status and set region note
          const hasIndia = !!indiaData && (indiaData.flatrate?.length > 0 || indiaData.rent?.length > 0 || indiaData.buy?.length > 0);
          const hasUSA = !!usaData && (usaData.flatrate?.length > 0 || usaData.rent?.length > 0 || usaData.buy?.length > 0);

          if (hasIndia && !hasUSA) {
            setRegionNote('Available in India only - not streaming in USA');
          } else if (!hasIndia && hasUSA) {
            setRegionNote('Available in USA only - not streaming in India');
          } else if (hasIndia && hasUSA) {
            setRegionNote('');
          } else {
            setRegionNote('Not available for streaming in India or USA');
          }

          const mappedRecommendation: Recommendation = {
            id: id,
            title: tmdbData.title,
            originalTitle: tmdbData.original_title !== tmdbData.title ? tmdbData.original_title : undefined,
            year: tmdbData.release_date ? parseInt(tmdbData.release_date.split('-')[0]) : 0,
            type: 'movie',
            poster: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : '',
            backdrop: tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : undefined,
            genres: tmdbData.genres?.map((g: { name: string }) => g.name) || [],
            language: languageMap[tmdbData.original_language] || tmdbData.original_language?.toUpperCase() || 'Unknown',
            duration: tmdbData.runtime ? `${Math.floor(tmdbData.runtime / 60)}h ${tmdbData.runtime % 60}m` : undefined,
            rating: tmdbData.vote_average || undefined,
            certification: certification,
            personalNote: tmdbData.overview || 'No description available.',
            mood: [],
            watchWith: undefined,
            ottLinks: ottLinks,
            recommendedBy: {
              id: 'tmdb',
              name: 'TMDB',
              avatar: '🎬',
            },
            addedOn: tmdbData.release_date || new Date().toISOString(),
          };

          setMovie(mappedRecommendation);
          return;
        }

        // Try Supabase for non-TMDB movies
        if (!isSupabaseConfigured()) {
          setError(true);
          return;
        }

        const supabase = createClient();
        const { data: rec, error: supabaseError } = await supabase
          .from('recommendations')
          .select('*, user:users(*)')
          .eq('id', id)
          .single();

        if (supabaseError || !rec) {
          setError(true);
          return;
        }

        // Transform DB data to Recommendation type
        const mappedRecommendation: Recommendation = {
          id: rec.id,
          title: rec.title,
          originalTitle: rec.original_title,
          year: rec.year,
          type: rec.type,
          poster: rec.poster,
          backdrop: rec.backdrop,
          genres: Array.isArray(rec.genres) ? rec.genres : [],
          language: rec.language ?? '',
          duration: rec.duration,
          rating: rec.rating,
          personalNote: rec.personal_note ?? '',
          mood: rec.mood,
          watchWith: rec.watch_with,
          ottLinks: (rec.ott_links as OTTLink[]) ?? [],
          recommendedBy: {
            id: rec.user?.id || 'unknown',
            name: rec.user?.name || 'Anonymous',
            avatar: rec.user?.avatar || '🎬',
          },
          addedOn: rec.created_at,
        };

        setMovie(mappedRecommendation);
      } catch (err) {
        console.error('Error fetching movie:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchMovie();
  }, [id, movie]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-[var(--accent)] text-xl animate-pulse">Loading amazing recommendation...</div>
      </div>
    );
  }

  if (error || !movie) {
    if (error && !movie) {
      notFound();
    }
  }

  // Safety check for TS
  if (!movie) return null;

  const {
    title,
    originalTitle,
    year,
    type,
    poster,
    backdrop,
    genres,
    language,
    duration,
    rating,
    certification,
    recommendedBy,
    personalNote,
    mood,
    watchWith,
    ottLinks,
    addedOn,
  } = movie;

  const watched = isWatched(id);

  const typeLabels = {
    movie: 'Movie',
    series: 'Series',
    documentary: 'Documentary',
    anime: 'Anime',
  };

  const platformClasses: Record<string, string> = {
    'Netflix': 'platform-netflix',
    'Prime Video': 'platform-prime',
    'Hotstar': 'platform-hotstar',
    'Aha': 'platform-aha',
    'YouTube': 'platform-youtube',
    'Apple TV+': 'platform-apple',
    'Zee5': 'platform-zee5',
    'SonyLiv': 'platform-sonyliv',
    'Jio Cinema': 'platform-jio',
    'Other': 'platform-other',
  };

  const formattedDate = new Date(addedOn).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Backdrop */}
      <div className="relative h-[40vh] sm:h-[50vh] w-full overflow-hidden">
        <BackdropImage
          src={backdrop}
          posterSrc={poster}
          alt={`${title} backdrop`}
          title={title}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-primary)]/80 to-transparent" />

        {/* Back button */}
        <Link
          href={backUrl}
          className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-[var(--bg-primary)]/60 backdrop-blur-sm rounded-full text-sm text-[var(--text-primary)] hover:bg-[var(--bg-primary)]/80 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </Link>

        {/* Watched badge */}
        {watched && (
          <div className="absolute top-6 right-6 flex items-center gap-2 px-4 py-2 bg-green-500 rounded-full text-sm text-white font-medium">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Watched
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 sm:-mt-40 relative z-10">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
          {/* Poster */}
          <div className="flex-shrink-0 w-48 sm:w-64 mx-auto sm:mx-0">
            <div className={`relative aspect-[2/3] rounded-xl overflow-hidden shadow-2xl shadow-black/50 ${watched ? 'ring-4 ring-green-500/50' : ''}`}>
              <PosterImage src={poster} alt={`${title} poster`} title={title} />
            </div>
            {/* Action Buttons - below poster */}
            <div className="mt-4 flex justify-center gap-2">
              <WatchedButton movieId={id} size="lg" showLabel />
              <WatchlistButton movieId={id} title={title} poster={poster} size="lg" showLabel />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            {/* Title */}
            <div className="mb-4">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[var(--text-primary)]">
                {title}
              </h1>
              {originalTitle && (
                <p className="text-lg text-[var(--text-muted)] mt-1">{originalTitle}</p>
              )}
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-sm text-[var(--text-secondary)] mb-6">
              <span className="px-2 py-1 bg-[var(--bg-secondary)] rounded">
                {year}
              </span>
              <span className="px-2 py-1 bg-[var(--bg-secondary)] rounded">
                {typeLabels[type]}
              </span>
              {duration && (
                <span className="px-2 py-1 bg-[var(--bg-secondary)] rounded">
                  {duration}
                </span>
              )}
              <span className="px-2 py-1 bg-[var(--bg-secondary)] rounded">
                {language}
              </span>
              {rating && (
                <span className="flex items-center gap-1 px-2 py-1 bg-[var(--accent)] rounded text-[var(--bg-primary)] font-bold">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  {rating.toFixed(1)}
                </span>
              )}
              {certification && ['NC-17', 'X', '18+'].some(c => certification.toUpperCase() === c) && (
                <span className="px-2 py-1 bg-red-600 rounded text-white font-bold">
                  18+
                </span>
              )}
            </div>

            {/* Genres */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-6">
              {genres.map((genre) => (
                <span
                  key={genre}
                  className="px-3 py-1 text-sm bg-[var(--bg-card)] border border-white/10 rounded-full text-[var(--text-secondary)]"
                >
                  {genre}
                </span>
              ))}
            </div>

            {/* Moods */}
            {mood && mood.length > 0 && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-6">
                {mood.map((m) => (
                  <span key={m} className="mood-tag px-3 py-1 text-sm rounded-full">
                    {m}
                  </span>
                ))}
              </div>
            )}

          </div>
        </div>

        {/* The personal note - the heart of the recommendation */}
        <div className="mt-10 bg-[var(--bg-card)] rounded-2xl p-6 sm:p-8 border border-white/5">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">{recommendedBy.avatar}</span>
            <div>
              <p className="text-[var(--text-primary)] font-medium">
                {recommendedBy.name}&apos;s recommendation
              </p>
              <p className="text-xs text-[var(--text-muted)]">Added {formattedDate}</p>
            </div>
          </div>
          <blockquote className="text-lg sm:text-xl text-[var(--text-primary)] leading-relaxed italic">
            &ldquo;{personalNote}&rdquo;
          </blockquote>
          {watchWith && (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              <span className="text-[var(--accent)]">Best watched:</span> {watchWith}
            </p>
          )}
        </div>

        {/* Where to watch */}
        <div className="mt-8 bg-[var(--bg-card)] rounded-2xl p-6 sm:p-8 border border-white/5">
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-4">
            Where to watch
          </h2>
          {regionNote && (
            <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${regionNote.includes('not streaming in India')
              ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400'
              : regionNote.includes('not streaming in USA')
                ? 'bg-blue-500/10 border border-blue-500/30 text-blue-400'
                : 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
              }`}>
              {regionNote}
            </div>
          )}
          {ottLinks && ottLinks.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {ottLinks.map((link, index) => (
                <a
                  key={`${link.platform}-${index}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 bg-[var(--bg-secondary)] rounded-xl hover:bg-[var(--bg-card-hover)] transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`${platformClasses[link.platform] || 'platform-other'} w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm`}
                    >
                      {link.platform.charAt(0)}
                    </span>
                    <div>
                      <p className="font-medium text-[var(--text-primary)]">
                        {link.platform}
                      </p>
                      {link.availableIn && (
                        <p className="text-xs text-[var(--text-muted)]">
                          {link.availableIn}
                        </p>
                      )}
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-[var(--text-muted)]">
                No streaming info available for India/USA.
              </p>
              <a
                href={`https://www.justwatch.com/in/search?q=${encodeURIComponent(title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-[var(--bg-secondary)] rounded-lg text-[var(--accent)] hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                Search on JustWatch
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
        </div>

        {/* Back to all */}
        <div className="mt-12 text-center pb-16">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--accent)] text-[var(--bg-primary)] font-medium rounded-full hover:bg-[var(--accent-hover)] transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {fromLang ? 'Back to movies' : 'Back to all recommendations'}
          </Link>
        </div>
      </div>
    </div>
  );
}
