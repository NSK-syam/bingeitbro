'use client';

import Link from 'next/link';
import { useState } from 'react';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Poster sizes per spec: bounded TMDB sizes, never `original`. */
const SIZES = {
  thumb: { width: 72, height: 108, tmdb: 'w185', titleSize: 'text-[13px]' },
  row: { width: 112, height: 168, tmdb: 'w342', titleSize: 'text-[20px]' },
  hero: { width: 350, height: 420, tmdb: 'w780', titleSize: 'text-[56px]' },
} as const;

export type PosterSize = keyof typeof SIZES;

/** Muted tints for designed placeholders (title on a tinted tile). Picked from the title. */
const TINTS = ['#3A2614', '#3D1F14', '#1E3446', '#4A1A1A', '#2B2F17', '#2A1838', '#13303A', '#3A3214'];

export function posterTint(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/**
 * Accepts a TMDB poster path ("/abc.jpg") or a full image.tmdb.org URL and returns a URL at the
 * requested size. Other URLs are returned unchanged; empty input returns null.
 */
export function posterUrl(source: string | null | undefined, tmdbSize: string): string | null {
  const value = String(source ?? '').trim();
  if (!value) return null;
  if (value.startsWith('/')) return `${TMDB_IMAGE_BASE}/${tmdbSize}${value}`;
  const match = /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+(\/.+)$/i.exec(value);
  if (match) return `${TMDB_IMAGE_BASE}/${tmdbSize}${match[1]}`;
  return value;
}

type PosterTileProps = {
  title: string;
  poster?: string | null;
  size?: PosterSize;
  href?: string;
  /** Text caption under the tile so the title stays readable (rows). Default: true for rows. */
  caption?: boolean;
  /** Small overlay in the top-left corner (rank, friend avatar…). */
  badge?: React.ReactNode;
  /** Load eagerly: only for above-the-fold artwork. */
  priority?: boolean;
};

export function PosterTile({ title, poster, size = 'row', href, caption, badge, priority = false }: PosterTileProps) {
  const spec = SIZES[size];
  const src = posterUrl(poster, spec.tmdb);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const showCaption = caption ?? size === 'row';

  const tile = (
    <span
      className="relative flex flex-none flex-col justify-end overflow-hidden rounded-[10px] p-2.5 text-white"
      style={{ width: spec.width, height: spec.height, background: posterTint(title) }}
    >
      {showImage ? (
        // TMDB artwork; dimensions are reserved by the tile so rows don't shift while loading.
        <img
          src={src as string}
          alt=""
          width={spec.width}
          height={spec.height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className={`app-poster-title relative ${spec.titleSize}`} aria-hidden="true">{title}</span>
      )}
      {badge ? <span className="absolute left-2 top-2">{badge}</span> : null}
    </span>
  );

  const body = (
    <span className="flex flex-none flex-col gap-1.5" style={{ width: spec.width }}>
      {tile}
      {showCaption ? (
        <span className="line-clamp-2 text-[13px] leading-tight text-[var(--app-text)]">{title}</span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link href={href} aria-label={title} className="flex-none text-inherit no-underline">
        {body}
      </Link>
    );
  }
  return <span role="img" aria-label={title}>{body}</span>;
}
