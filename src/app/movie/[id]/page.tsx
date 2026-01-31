'use client';

import { Recommendation } from '@/types';
import data from '@/data/recommendations.json';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { use, useState } from 'react';
import { WatchedButton } from '@/components/WatchedButton';
import { ReactionBar } from '@/components/ReactionBar';
import { useWatched } from '@/hooks';

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
  const recommendations = data.recommendations as Recommendation[];
  const movie = recommendations.find((r) => r.id === id);
  const { isWatched } = useWatched();

  if (!movie) {
    notFound();
  }

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
          href="/"
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
            {/* Watched Button - below poster */}
            <div className="mt-4 flex justify-center">
              <WatchedButton movieId={id} size="lg" showLabel />
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

            {/* Reactions */}
            <div className="mb-6">
              <p className="text-sm text-[var(--text-muted)] mb-3">How did this make you feel?</p>
              <ReactionBar movieId={id} />
            </div>
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
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-6">
            Where to watch
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ottLinks.map((link) => (
              <a
                key={link.platform}
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
        </div>

        {/* Back to all */}
        <div className="mt-12 text-center pb-16">
          <Link
            href="/"
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
            Back to all recommendations
          </Link>
        </div>
      </div>
    </div>
  );
}
