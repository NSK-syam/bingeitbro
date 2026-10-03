'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PosterTile, posterTint, posterUrl } from '../PosterTile';
import { ChevronRightIcon, PlayIcon } from '../icons';
import type { HomeItem } from './useHomeData';

/** Friend avatar: their emoji avatar if set, else an initial on a tinted circle. */
export function FriendAvatar({ name, avatar, size = 26 }: { name: string; avatar?: string | null; size?: number }) {
  const emoji = avatar && !/^https?:/i.test(avatar) && avatar.length <= 8 ? avatar : null;
  return (
    <span
      aria-hidden="true"
      className="inline-flex flex-none items-center justify-center rounded-full font-bold text-[var(--app-on-accent)]"
      style={{ width: size, height: size, fontSize: Math.round(size * (emoji ? 0.6 : 0.42)), background: emoji ? 'var(--app-raised)' : '#c7b8ff' }}
    >
      {emoji ?? (name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/** "Tonight · 9:00 PM", "Tomorrow · 8:30 PM", "Sat 12 Oct · 7:00 PM". */
export function formatWhen(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(when) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `${when.getHours() >= 17 ? 'Tonight' : 'Today'} · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  return `${when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

/** Large hero poster for the latest friend pick; fluid width, fixed aspect ratio. */
export function HeroPoster({ item }: { item: HomeItem }) {
  const src = posterUrl(item.poster, 'w780');
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const meta = [item.year].filter(Boolean).join(' · ');
  const body = (
    <span
      className="relative flex aspect-[5/6] w-full flex-col justify-end overflow-hidden rounded-[22px] p-5"
      style={{ background: posterTint(item.title) }}
    >
      {showImage ? (
        <img
          src={src as string}
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="app-poster-title relative line-clamp-3 break-words text-[clamp(36px,13vw,60px)] text-[#fce7c8]" aria-hidden="true">
          {item.title}
        </span>
      )}
      {meta ? (
        <span className="absolute left-4 top-4 rounded-full bg-[var(--app-ground)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--app-accent)]">
          {meta}
        </span>
      ) : null}
    </span>
  );
  return item.href ? (
    <Link href={item.href} aria-label={item.title} className="block text-inherit no-underline">{body}</Link>
  ) : (
    <span role="img" aria-label={item.title} className="block">{body}</span>
  );
}

/** One scheduled watch in the Coming up section. */
export function ScheduleCard({ item }: { item: HomeItem }) {
  const content = (
    <>
      <PosterTile title={item.title} poster={item.poster} size="thumb" caption={false} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[13px] font-semibold text-[var(--app-accent)]">{formatWhen(item.at)}</span>
        <span className="truncate text-[17px] font-semibold">{item.title}</span>
        <span className="text-[13px] text-[var(--app-muted)]">Scheduled watch</span>
      </span>
      <ChevronRightIcon size={18} className="flex-none text-[#8a8a94]" />
    </>
  );
  const className = 'flex items-center gap-3.5 rounded-[18px] bg-[var(--app-surface)] p-3 text-[var(--app-text)] no-underline';
  return item.href ? <Link href={item.href} className={className}>{content}</Link> : <div className={className}>{content}</div>;
}

/** Grey placeholder blocks while a section loads (reserves layout, no spinner). */
export function RowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} aria-hidden="true" className="h-[168px] w-28 flex-none animate-pulse rounded-[10px] bg-[var(--app-surface)]" />
      ))}
    </>
  );
}

export function SectionMessage({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="mx-5 flex items-center justify-between gap-3 rounded-[14px] bg-[var(--app-surface)] px-4 py-3 text-[14px] text-[var(--app-muted)]">
      <span>{text}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="min-h-11 rounded-[10px] border-0 bg-[var(--app-raised)] px-3 text-[14px] font-semibold text-[var(--app-text)]">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function OfflineBanner() {
  return (
    <div role="status" className="mx-5 mt-4 flex items-center gap-2.5 rounded-[14px] bg-[#2a2110] px-3.5 py-3 text-[14px] text-[#fcd58a]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 1l22 22M16.7 11.1A11 11 0 0 1 19 12.6M5 12.6a11 11 0 0 1 5.2-2.5M10.7 5A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.7-2.9M8.5 16.1a5 5 0 0 1 7 0M12 20h.01" />
      </svg>
      You&apos;re offline. Showing what&apos;s saved on this phone.
    </div>
  );
}

export { PlayIcon };
