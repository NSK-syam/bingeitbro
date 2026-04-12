'use client';

import { useState } from 'react';
import { getSupabaseAccessToken } from '@/lib/supabase-rest';
import { getNewReleasesOnStreaming, isTMDBConfigured } from '@/lib/tmdb';

type StatusTone = 'success' | 'error' | 'info';

type StatusMessage = {
  tone: StatusTone;
  text: string;
};

export function AdminPushBroadcastPanel() {
  const [title, setTitle] = useState('New on streaming this week');
  const [body, setBody] = useState('Fresh releases just landed on BiB. Open the app to see what is new.');
  const [url, setUrl] = useState('/movies');
  const [loadingPreset, setLoadingPreset] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const handleLoadReleasePreset = async () => {
    setLoadingPreset(true);
    setStatus(null);
    try {
      const releases = await getNewReleasesOnStreaming();
      const featured = releases.slice(0, 3).map((release) => release.title);
      if (featured.length === 0) {
        setStatus({
          tone: 'info',
          text: 'No recent streaming releases were returned right now.',
        });
        return;
      }

      const extraCount = Math.max(0, releases.length - featured.length);
      setTitle('Fresh streaming releases on BiB');
      setBody(
        `Now streaming: ${featured.join(', ')}${extraCount > 0 ? `, and ${extraCount} more.` : '.'}`.slice(0, 240),
      );
      setUrl('/movies');
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to load release preset.',
      });
    } finally {
      setLoadingPreset(false);
    }
  };

  const handleSend = async () => {
    const accessToken = getSupabaseAccessToken();
    if (!accessToken) {
      setStatus({
        tone: 'error',
        text: 'Sign in first so the server can verify admin access.',
      });
      return;
    }

    setSending(true);
    setStatus(null);
    try {
      const response = await fetch('/api/admin/push-broadcast', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          url,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || 'Failed to send push notification.');
      }

      setStatus({
        tone: 'success',
        text: 'Broadcast push sent.',
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Failed to send push notification.',
      });
    } finally {
      setSending(false);
    }
  };

  const statusClasses = status?.tone === 'error'
    ? 'border-red-400/25 bg-red-500/10 text-red-200'
    : status?.tone === 'success'
      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
      : 'border-sky-400/25 bg-sky-500/10 text-sky-100';

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-[var(--bg-card)] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Admin push</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--text-primary)]">Broadcast a release notification</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
            Send a push alert to subscribed devices when you want to highlight new releases or a curated update.
          </p>
        </div>
        {isTMDBConfigured() && (
          <button
            type="button"
            onClick={() => void handleLoadReleasePreset()}
            disabled={loadingPreset || sending}
            className="rounded-full border border-white/10 bg-[var(--bg-secondary)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-white/20 disabled:opacity-60"
          >
            {loadingPreset ? 'Loading releases...' : 'Use latest OTT releases'}
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">Title</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value.slice(0, 120))}
            className="rounded-xl border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            placeholder="New on BiB this week"
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">Body</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 240))}
            rows={3}
            className="rounded-xl border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            placeholder="Fresh releases just landed on BiB."
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium text-[var(--text-primary)]">Open URL</span>
          <input
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value.slice(0, 240))}
            className="rounded-xl border border-white/10 bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            placeholder="/movies"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || !title.trim() || !body.trim()}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--bg-primary)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {sending ? 'Sending...' : 'Send push broadcast'}
        </button>
        <p className="text-xs text-[var(--text-muted)]">
          Only allowlisted admins can send broadcasts. Configure `ADMIN_USER_IDS` or `ADMIN_EMAILS` on the server.
        </p>
      </div>

      {status && (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${statusClasses}`}>
          {status.text}
        </div>
      )}
    </section>
  );
}
