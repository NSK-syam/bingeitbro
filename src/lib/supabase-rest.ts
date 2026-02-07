/**
 * Token-based Supabase REST requests. Use this when createClient() is slow or times out
 * (e.g. cold start). Reads the session token from localStorage and calls the REST API directly.
 */

import type { DBUser } from './supabase';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const supabaseProjectRef = (() => {
  if (!supabaseUrl) return '';
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
})();

export function getSupabaseAccessToken(): string | null {
  if (typeof window === 'undefined' || !supabaseProjectRef) return null;
  const raw = window.localStorage.getItem(`sb-${supabaseProjectRef}-auth-token`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.access_token === 'string' ? parsed.access_token.trim() : null;
  } catch {
    return null;
  }
}

const DEFAULT_TIMEOUT_MS = 25000;

export async function supabaseRestRequest<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
  accessToken?: string | null,
): Promise<T> {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase is not configured.');
  }
  const token = (accessToken ?? getSupabaseAccessToken() ?? supabaseAnonKey).trim();
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...rest,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${token}`,
        ...headers,
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message?: string }).message || response.statusText)
          : response.statusText || 'Request failed.';
      throw new Error(message);
    }

    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface FriendshipRow {
  id: string;
  friend_id: string;
}

export interface FriendForSelect extends DBUser {
  friendshipId?: string;
}

/**
 * Fetch a single user by ID (for profile page). Uses token-based REST so RLS sees the session.
 * Returns null if not found or on error.
 */
export async function fetchProfileUser(userId: string): Promise<DBUser | null> {
  const token = getSupabaseAccessToken();
  const params = new URLSearchParams({ select: '*', id: `eq.${userId}` });
  try {
    const rows = await supabaseRestRequest<(DBUser & { created_at?: string })[]>(
      `users?${params.toString()}`,
      { method: 'GET', timeoutMs: 15000 },
      token ?? undefined,
    );
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email ?? '',
      name: row.name ?? '',
      username: row.username ?? '',
      avatar: row.avatar ?? '🎬',
      created_at: row.created_at ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the current user's friends list using token-based REST (same approach as Manage Friends).
 * More reliable than the Supabase client join when the project is cold or slow.
 */
export async function fetchFriendsList(userId: string): Promise<FriendForSelect[]> {
  const token = getSupabaseAccessToken();
  const friendsParams = new URLSearchParams({
    select: 'id,friend_id',
    user_id: `eq.${userId}`,
  });
  const friendships = await supabaseRestRequest<FriendshipRow[]>(
    `friends?${friendsParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  if (!friendships || friendships.length === 0) return [];

  const friendIds = friendships.map((f) => f.friend_id);
  const usersParams = new URLSearchParams({
    select: 'id,name,username,avatar,email,created_at',
    id: `in.(${friendIds.join(',')})`,
  });
  const users = await supabaseRestRequest<(DBUser & { created_at?: string })[]>(
    `users?${usersParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  if (!users) return [];

  return users.map((u) => {
    const row = friendships.find((f) => f.friend_id === u.id);
    return {
      id: u.id,
      email: u.email ?? '',
      name: u.name ?? '',
      username: u.username ?? '',
      avatar: u.avatar ?? '🎬',
      created_at: u.created_at ?? '',
      friendshipId: row?.id,
    };
  });
}

export interface FriendRecommendationRow {
  sender_id: string;
  recipient_id: string;
  recommendation_id: string | null;
  tmdb_id: number | null;
  movie_title: string;
  movie_poster: string;
  movie_year: number | null;
  personal_message: string;
}

/** Flat row from friend_recommendations (no embed). */
interface ReceivedRecRow {
  id: string;
  sender_id: string;
  movie_title: string;
  movie_poster: string;
  movie_year?: number;
  personal_message: string;
  is_read: boolean;
  is_watched?: boolean;
  watched_at?: string | null;
  created_at: string;
  tmdb_id: number | null;
  recommendation_id: string | null;
}

/** Received recommendation with sender info (for modal). */
export interface ReceivedRecommendationRow {
  id: string;
  sender_id: string;
  movie_title: string;
  movie_poster: string;
  movie_year?: number;
  personal_message: string;
  is_read: boolean;
  is_watched?: boolean;
  watched_at?: string | null;
  created_at: string;
  tmdb_id: number | null;
  recommendation_id: string | null;
  sender: { id: string; name: string; avatar?: string; email?: string } | null;
}

/**
 * Fetch received friend recommendations (for the modal list). Two-step fetch so it works without embed.
 */
export async function getReceivedFriendRecommendations(
  userId: string,
): Promise<ReceivedRecommendationRow[]> {
  const token = getSupabaseAccessToken();
  const buildParams = (includeWatched: boolean) =>
    new URLSearchParams({
      recipient_id: `eq.${userId}`,
      select: includeWatched
        ? 'id,sender_id,movie_title,movie_poster,movie_year,personal_message,is_read,is_watched,watched_at,created_at,tmdb_id,recommendation_id'
        : 'id,sender_id,movie_title,movie_poster,movie_year,personal_message,is_read,created_at,tmdb_id,recommendation_id',
      order: 'created_at.desc',
    });

  let rows: ReceivedRecRow[] = [];
  try {
    rows = await supabaseRestRequest<ReceivedRecRow[]>(
      `friend_recommendations?${buildParams(true).toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('is_watched') || message.includes('watched_at') || message.includes('schema cache')) {
      rows = await supabaseRestRequest<ReceivedRecRow[]>(
        `friend_recommendations?${buildParams(false).toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    } else {
      throw err;
    }
  }
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return [];

  const senderIds = [...new Set(list.map((r) => r.sender_id))];
  const usersParams = new URLSearchParams({
    id: `in.(${senderIds.join(',')})`,
    select: 'id,name,avatar,email',
  });
  const users = await supabaseRestRequest<{ id: string; name: string; avatar?: string; email?: string }[]>(
    `users?${usersParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const userMap = new Map(
    (Array.isArray(users) ? users : []).map((u) => [u.id, u]),
  );
  return list.map((r) => ({
    ...r,
    sender: userMap.get(r.sender_id) ?? null,
  }));
}

/**
 * Fetch the most recent friend recommendations for notifications (small payload).
 */
export async function getRecentFriendRecommendations(
  userId: string,
  limit: number = 5,
): Promise<ReceivedRecommendationRow[]> {
  const token = getSupabaseAccessToken();
  type RecentRecRow = {
    id: string;
    sender_id: string;
    movie_title: string;
    created_at: string;
    tmdb_id: number | null;
    recommendation_id: string | null;
  };
  const params = new URLSearchParams({
    recipient_id: `eq.${userId}`,
    select: 'id,sender_id,movie_title,created_at,tmdb_id,recommendation_id',
    order: 'created_at.desc',
    limit: String(limit),
  });

  const rows = await supabaseRestRequest<RecentRecRow[]>(
    `friend_recommendations?${params.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );

  if (!rows || rows.length === 0) return [];

  const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)));
  const usersParams = new URLSearchParams({
    select: 'id,name,avatar,email',
    id: `in.(${senderIds.join(',')})`,
  });
  let users: Array<{ id: string; name?: string; avatar?: string; email?: string }> = [];
  try {
    users = await supabaseRestRequest<typeof users>(
      `users?${usersParams.toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
  } catch {
    users = [];
  }

  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((rec) => ({
    id: rec.id,
    sender_id: rec.sender_id,
    movie_title: rec.movie_title,
    movie_poster: '',
    movie_year: undefined,
    personal_message: '',
    is_read: false,
    is_watched: false,
    watched_at: null,
    created_at: rec.created_at,
    tmdb_id: rec.tmdb_id,
    recommendation_id: rec.recommendation_id,
    sender: (() => {
      const sender = byId.get(rec.sender_id);
      if (!sender) return null;
      return {
        id: sender.id,
        name: sender.name || 'Unknown',
        avatar: sender.avatar,
        email: sender.email,
      };
    })(),
  }));
}

export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string },
): Promise<void> {
  const token = getSupabaseAccessToken();
  const payload = {
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
  };
  const params = new URLSearchParams({ on_conflict: 'endpoint' });
  await supabaseRestRequest(
    `push_subscriptions?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    token,
  );
}

/**
 * Mark a single friend recommendation as read (PATCH). Token-based.
 */
export async function markFriendRecommendationRead(recId: string): Promise<void> {
  const token = getSupabaseAccessToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/friend_recommendations?id=eq.${recId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token ?? supabaseAnonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ is_read: true }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error('Failed to mark as read');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Mark a friend recommendation as watched (PATCH). Token-based.
 */
export async function markFriendRecommendationWatched(recId: string): Promise<void> {
  const token = getSupabaseAccessToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/friend_recommendations?id=eq.${recId}`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token ?? supabaseAnonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ is_watched: true, watched_at: new Date().toISOString(), is_read: true }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error('Failed to mark as watched');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Mark multiple friend recommendations as read (PATCH). Token-based.
 */
export async function markFriendRecommendationsRead(recIds: string[]): Promise<void> {
  if (recIds.length === 0) return;
  const token = getSupabaseAccessToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/friend_recommendations?id=in.(${recIds.join(',')})`,
      {
        method: 'PATCH',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token ?? supabaseAnonKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ is_read: true }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error('Failed to mark as read');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get count of unread friend recommendations for the current user (for badge).
 */
export async function getFriendRecommendationsUnreadCount(
  userId: string,
): Promise<number> {
  const token = getSupabaseAccessToken();
  const params = new URLSearchParams({
    recipient_id: `eq.${userId}`,
    is_read: 'eq.false',
    select: 'id',
  });
  const controller = new AbortController();
  const timeoutMs = 10000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/friend_recommendations?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token ?? supabaseAnonKey}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
        signal: controller.signal,
      },
    );
    const range = response.headers.get('Content-Range');
    if (range) {
      const match = range.match(/\/(\d+)$/);
      if (match) return Math.min(parseInt(match[1], 10), 99);
    }
    return 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Flat row from friend_recommendations for sent list (no embed). */
interface SentRecRow {
  id: string;
  recipient_id: string;
  movie_title: string;
  movie_poster: string;
  movie_year?: number;
  personal_message: string;
  is_read: boolean;
  is_watched?: boolean;
  watched_at?: string | null;
  created_at: string;
  tmdb_id: number | null;
  recommendation_id: string | null;
}

/** Sent recommendation with recipient info (for modal). */
export interface SentRecommendationRow {
  id: string;
  recipient_id: string;
  movie_title: string;
  movie_poster: string;
  movie_year?: number;
  personal_message: string;
  is_read: boolean;
  is_watched?: boolean;
  watched_at?: string | null;
  created_at: string;
  tmdb_id: number | null;
  recommendation_id: string | null;
  recipient: { id: string; name: string; avatar?: string; email?: string } | null;
}

/**
 * Fetch sent friend recommendations (for the modal list).
 */
export async function getSentFriendRecommendations(
  userId: string,
): Promise<SentRecommendationRow[]> {
  const token = getSupabaseAccessToken();
  const buildParams = (includeWatched: boolean) =>
    new URLSearchParams({
      sender_id: `eq.${userId}`,
      select: includeWatched
        ? 'id,recipient_id,movie_title,movie_poster,movie_year,personal_message,is_read,is_watched,watched_at,created_at,tmdb_id,recommendation_id'
        : 'id,recipient_id,movie_title,movie_poster,movie_year,personal_message,is_read,created_at,tmdb_id,recommendation_id',
      order: 'created_at.desc',
    });

  let rows: SentRecRow[] = [];
  try {
    rows = await supabaseRestRequest<SentRecRow[]>(
      `friend_recommendations?${buildParams(true).toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('is_watched') || message.includes('watched_at') || message.includes('schema cache')) {
      rows = await supabaseRestRequest<SentRecRow[]>(
        `friend_recommendations?${buildParams(false).toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    } else {
      throw err;
    }
  }
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return [];

  const recipientIds = [...new Set(list.map((r) => r.recipient_id))];
  const usersParams = new URLSearchParams({
    id: `in.(${recipientIds.join(',')})`,
    select: 'id,name,avatar,email',
  });
  const users = await supabaseRestRequest<{ id: string; name: string; avatar?: string; email?: string }[]>(
    `users?${usersParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const userMap = new Map(
    (Array.isArray(users) ? users : []).map((u) => [u.id, u]),
  );
  return list.map((r) => ({
    ...r,
    recipient: userMap.get(r.recipient_id) ?? null,
  }));
}

/**
 * Returns recipient IDs that already have this movie recommended by the sender.
 * Use before send to avoid 409 and only send to friends who don't have it yet.
 */
export async function getAlreadyRecommendedRecipientIds(
  senderId: string,
  recipientIds: string[],
  movie: { tmdbId: number | null; recommendationId: string | null },
): Promise<Set<string>> {
  if (recipientIds.length === 0) return new Set();
  const token = getSupabaseAccessToken();
  const params = new URLSearchParams({
    select: 'recipient_id,tmdb_id,recommendation_id',
    sender_id: `eq.${senderId}`,
    recipient_id: `in.(${recipientIds.join(',')})`,
  });
  try {
    const rows = await supabaseRestRequest<{ recipient_id: string; tmdb_id: number | null; recommendation_id: string | null }[]>(
      `friend_recommendations?${params.toString()}`,
      { method: 'GET', timeoutMs: 10000 },
      token ?? undefined,
    );
    const set = new Set<string>();
    const arr = Array.isArray(rows) ? rows : [];
    for (const r of arr) {
      const sameMovie =
        (movie.tmdbId != null && r.tmdb_id === movie.tmdbId) ||
        (movie.recommendationId != null && r.recommendation_id === movie.recommendationId) ||
        (movie.tmdbId == null && movie.recommendationId == null && r.tmdb_id == null && r.recommendation_id == null);
      if (sameMovie) set.add(r.recipient_id);
    }
    return set;
  } catch {
    return new Set();
  }
}

/**
 * Insert friend recommendations via REST (same token-based approach as fetch).
 * Avoids createClient() hanging on cold start.
 */
export async function sendFriendRecommendations(
  rows: FriendRecommendationRow[],
): Promise<void> {
  const token = getSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  const controller = new AbortController();
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-friend-recommendations?apikey=${supabaseAnonKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ access_token: token, recommendations: rows }),
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (response.ok) return;

    const code =
      typeof data === 'object' && data !== null && 'code' in data
        ? String((data as { code?: string }).code)
        : '';
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message?: string }).message)
        : typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error?: string }).error)
          : response.statusText;
    if (code === '23505') {
      throw new Error('DUPLICATE');
    }
    throw new Error(message || 'Request failed');
  } catch (err) {
    if (err instanceof Error && err.message === 'DUPLICATE') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
