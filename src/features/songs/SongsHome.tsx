'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthModal } from '@/components/AuthModal';
import { BibSplash } from '@/components/BibSplash';
import { Header } from '@/components/Header';
import { HelpBotWidget } from '@/components/HelpBotWidget';
import { HubTabs } from '@/components/HubTabs';
import { SongBackground } from '@/components/SongBackground';
import { StarRating } from '@/components/StarRating';
import { useAuth } from '@/components/AuthProvider';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

type PlaylistRow = {
  id: string;
  user_id: string;
  platform: string;
  url: string;
  title: string | null;
  created_at: string;
  users?: { id: string; name: string; username?: string | null; avatar?: string | null } | null;
};

type RatingRow = {
  profile_user_id: string;
  rater_id: string;
  rating: number;
};

function detectPlatform(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('spotify.com')) return 'Spotify';
    if (host.includes('music.youtube.com')) return 'YouTube Music';
    if (host.includes('youtube.com')) return 'YouTube';
    if (host.includes('music.apple.com')) return 'Apple Music';
    if (host.includes('soundcloud.com')) return 'SoundCloud';
    return 'Link';
  } catch {
    return 'Link';
  }
}

export default function SongsHome() {
  const { user, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [ratingSaving, setRatingSaving] = useState<Record<string, boolean>>({});
  const [ratingError, setRatingError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSchemaMissing(false);
    setRatingError('');

    if (!isSupabaseConfigured()) {
      setLoading(false);
      setLoadError('Supabase is not configured.');
      return;
    }

    const supabase = createClient();
    let nextPlaylists: PlaylistRow[] = [];
    try {
      const { data, error } = await supabase
        .from('song_playlists')
        .select('id,user_id,platform,url,title,created_at,users(id,name,username,avatar)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const raw = Array.isArray(data) ? (data as any[]) : [];
      nextPlaylists = raw.map((r) => {
        const rel = (r as any).users;
        const u = Array.isArray(rel) ? rel[0] : rel;
        return {
          id: String(r.id),
          user_id: String(r.user_id),
          platform: String(r.platform || ''),
          url: String(r.url || ''),
          title: r.title != null ? String(r.title) : null,
          created_at: String(r.created_at || ''),
          users: u
            ? {
                id: String(u.id),
                name: String(u.name || 'User'),
                username: u.username != null ? String(u.username) : null,
                avatar: u.avatar != null ? String(u.avatar) : null,
              }
            : null,
        } as PlaylistRow;
      });
      setPlaylists(nextPlaylists);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/song_playlists|does not exist|schema cache/i.test(msg)) {
        setSchemaMissing(true);
      } else {
        setLoadError(msg || 'Failed to load playlists');
      }
      setPlaylists([]);
      setRatings([]);
      setLoading(false);
      return;
    }

    try {
      const userIds = Array.from(new Set(nextPlaylists.map((p) => p.user_id)));
      if (userIds.length === 0) {
        setRatings([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('song_profile_ratings')
        .select('profile_user_id,rater_id,rating')
        .in('profile_user_id', userIds);
      if (error) throw error;
      setRatings((data as RatingRow[]) ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/song_profile_ratings|does not exist|schema cache/i.test(msg)) {
        setSchemaMissing(true);
      } else {
        setLoadError(msg || 'Failed to load ratings');
      }
      setRatings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grouped = useMemo(() => {
    const byUser = new Map<string, { user: PlaylistRow['users']; items: PlaylistRow[] }>();
    for (const p of playlists) {
      const bucket = byUser.get(p.user_id) ?? { user: p.users ?? null, items: [] };
      bucket.user = bucket.user ?? p.users ?? null;
      bucket.items.push(p);
      byUser.set(p.user_id, bucket);
    }
    return Array.from(byUser.entries()).map(([userId, b]) => ({ userId, ...b }));
  }, [playlists]);

  const ratingByUser = useMemo(() => {
    const out: Record<string, { avg: number; count: number; mine: number }> = {};
    const bucket = new Map<string, { sum: number; count: number; mine: number }>();
    for (const r of ratings) {
      if (!r.profile_user_id) continue;
      const b = bucket.get(r.profile_user_id) ?? { sum: 0, count: 0, mine: 0 };
      const n = typeof r.rating === 'number' ? r.rating : 0;
      if (n < 1 || n > 5) continue;
      b.sum += n;
      b.count += 1;
      if (user?.id && r.rater_id === user.id) b.mine = n;
      bucket.set(r.profile_user_id, b);
    }
    for (const g of grouped) {
      const b = bucket.get(g.userId) ?? { sum: 0, count: 0, mine: 0 };
      out[g.userId] = { avg: b.count > 0 ? b.sum / b.count : 0, count: b.count, mine: b.mine };
    }
    return out;
  }, [ratings, grouped, user?.id]);

  const handleAddPlaylist = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    const url = playlistUrl.trim();
    if (!url) return;

    setSaving(true);
    setSaveError('');
    try {
      if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
      const supabase = createClient();
      const platform = detectPlatform(url);
      const title = playlistTitle.trim() || null;
      const { error } = await supabase.from('song_playlists').insert({
        user_id: user.id,
        platform,
        url,
        title,
        is_public: true,
      });
      if (error) throw error;
      setPlaylistUrl('');
      setPlaylistTitle('');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    if (!user) return;
    setSaving(true);
    setSaveError('');
    try {
      const supabase = createClient();
      const { error } = await supabase.from('song_playlists').delete().eq('id', playlistId).eq('user_id', user.id);
      if (error) throw error;
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg || 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const rateUser = async (profileUserId: string, value: number) => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (user.id === profileUserId) return;
    setRatingError('');
    setRatingSaving((prev) => ({ ...prev, [profileUserId]: true }));
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('song_profile_ratings')
        .upsert({ profile_user_id: profileUserId, rater_id: user.id, rating: value }, { onConflict: 'profile_user_id,rater_id' });
      if (error) throw error;
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRatingError(msg || 'Failed to save rating');
    } finally {
      setRatingSaving((prev) => ({ ...prev, [profileUserId]: false }));
    }
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
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Songs</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-[var(--text-primary)]">Drop your playlist. Let the crowd rate it.</h1>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Add Spotify, YouTube Music, Apple Music, or any playlist link. Links are public.
              </p>
            </div>

            {schemaMissing && (
              <div className="mt-8 bg-[var(--bg-card)] border border-yellow-400/20 rounded-2xl p-4 text-sm text-yellow-200">
                Songs database tables are not created yet. Run `supabase-songs-schema.sql` in Supabase, then refresh.
              </div>
            )}

            {loadError && (
              <div className="mt-8 bg-[var(--bg-card)] border border-red-500/20 rounded-2xl p-4 text-sm text-red-300">
                {loadError}
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="lg:col-span-1 bg-[var(--bg-card)] border border-white/10 rounded-3xl p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">Add Playlist Link</div>
                <div className="text-xs text-[var(--text-muted)]">Public on your profile card</div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Playlist URL</label>
                <input
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://open.spotify.com/playlist/..."
                  className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
                />
                <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                  Detected: <span className="text-[var(--text-secondary)]">{detectPlatform(playlistUrl.trim())}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Title (optional)</label>
                <input
                  value={playlistTitle}
                  onChange={(e) => setPlaylistTitle(e.target.value)}
                  placeholder="Late-night drive"
                  className="w-full px-4 py-3 rounded-2xl bg-[var(--bg-secondary)] border border-white/10 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]/50"
                />
              </div>

              {saveError && <div className="text-sm text-red-300">{saveError}</div>}

              <button
                type="button"
                onClick={handleAddPlaylist}
                disabled={saving || schemaMissing || !playlistUrl.trim()}
                className="w-full px-4 py-3 rounded-2xl bg-[var(--accent)] text-[var(--bg-primary)] font-semibold disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Publish link'}
              </button>

              {user && (
                <div className="pt-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)] mb-2">Your links</div>
                  <div className="space-y-2">
                    {playlists.filter((p) => p.user_id === user.id).length === 0 ? (
                      <div className="text-sm text-[var(--text-muted)]">No links yet.</div>
                    ) : (
                      playlists
                        .filter((p) => p.user_id === user.id)
                        .map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-3 bg-[var(--bg-secondary)] border border-white/10 rounded-2xl px-3 py-2">
                            <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0">
                              <div className="text-sm text-[var(--text-primary)] truncate">{p.title || p.platform}</div>
                              <div className="text-[10px] text-[var(--text-muted)] truncate">{p.url}</div>
                            </a>
                            <button
                              type="button"
                              onClick={() => handleDeletePlaylist(p.id)}
                              className="h-9 w-9 rounded-full bg-black/30 border border-white/10 text-white/80 hover:text-white hover:bg-black/40"
                              title="Delete"
                            >
                              ×
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="lg:col-span-2 bg-[var(--bg-card)] border border-white/10 rounded-3xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[var(--text-primary)]">Public Playlists</div>
                <div className="text-xs text-[var(--text-muted)]">Tap a link to listen. Rate the profile.</div>
              </div>
              <button
                type="button"
                onClick={() => refresh()}
                disabled={loading}
                className="px-3 py-2 rounded-full bg-[var(--bg-secondary)] border border-white/10 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-60"
              >
                Refresh
              </button>
            </div>

            {ratingError && (
              <div className="mt-3 text-sm text-red-300">{ratingError}</div>
            )}

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading ? (
                <div className="md:col-span-2 flex items-center justify-center py-14">
                  <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : grouped.length === 0 ? (
                <div className="md:col-span-2 text-sm text-[var(--text-muted)] py-10 text-center">
                  No playlists published yet.
                </div>
              ) : (
                grouped.map((g) => {
                  const u = g.user;
                  const name = u?.name || 'User';
                  const avatar = u?.avatar || '';
                  const stats = ratingByUser[g.userId] ?? { avg: 0, count: 0, mine: 0 };
                  const isMe = Boolean(user?.id && user.id === g.userId);
                  return (
                    <div key={g.userId} className="bg-[var(--bg-secondary)] border border-white/10 rounded-3xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-11 w-11 rounded-2xl bg-black/25 border border-white/10 grid place-items-center text-xl">
                            {avatar}
                          </div>
                          <div className="min-w-0">
                            <div className="text-base font-semibold text-[var(--text-primary)] truncate">
                              {name}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate">
                              {u?.username ? `@${u.username}` : 'Public playlists'}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-[var(--text-muted)]">Profile rating</div>
                          <div className="mt-1 flex items-center justify-end gap-2">
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              {stats.count > 0 ? stats.avg.toFixed(1) : '—'}
                            </div>
                            <div className="text-xs text-[var(--text-muted)]">
                              {stats.count > 0 ? `(${stats.count})` : ''}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-[var(--text-muted)]">
                          {isMe ? 'People can rate you here' : 'Rate this profile'}
                        </div>
                        <div className="mt-1">
                          <StarRating
                            value={isMe ? stats.avg : stats.mine}
                            onChange={isMe ? undefined : (v) => void rateUser(g.userId, v)}
                            disabled={isMe || Boolean(ratingSaving[g.userId]) || schemaMissing}
                            size="md"
                          />
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        {g.items.map((p) => (
                          <a
                            key={p.id}
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block bg-black/20 border border-white/10 rounded-2xl px-3 py-2 hover:bg-black/25 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm text-[var(--text-primary)] truncate">
                                  {p.title || p.platform}
                                </div>
                                <div className="text-[10px] text-[var(--text-muted)] truncate">
                                  {p.platform}
                                </div>
                              </div>
                              <span className="text-[var(--accent)] text-sm"></span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })
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
