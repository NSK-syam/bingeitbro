export function getWatchReminderOpenPath(movieId: string): string {
  const raw = String(movieId || '').trim();
  if (!raw) return '/movies';

  if (raw.startsWith('show::')) {
    const showId = raw.slice('show::'.length).trim();
    if (!showId) return '/shows';
    return `/show/${encodeURIComponent(showId)}`;
  }

  if (raw.startsWith('tmdbtv-')) {
    return `/show/${encodeURIComponent(raw)}`;
  }

  return `/movie/${encodeURIComponent(raw)}`;
}
