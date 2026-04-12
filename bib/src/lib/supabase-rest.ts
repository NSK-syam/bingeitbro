/**
 * Token-based Supabase REST requests. Use this when createClient() is slow or times out
 * (e.g. cold start). Reads the session token from localStorage and calls the REST API directly.
 */

import { createClient, type DBUser } from './supabase';
import { safeLocalStorageGet } from './safe-storage';

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

let cachedSupabaseAccessToken: string | null = null;

function normalizeAccessToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractAccessToken(value: unknown): string | null {
  const direct = normalizeAccessToken(value);
  if (direct) return direct;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractAccessToken(item);
      if (nested) return nested;
    }
    return null;
  }

  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  return (
    extractAccessToken(record.access_token) ||
    extractAccessToken(record.currentSession) ||
    extractAccessToken(record.session) ||
    extractAccessToken(record.data)
  );
}

function readAccessTokenFromStorage(raw: string | null): string | null {
  if (!raw) return null;
  try {
    return extractAccessToken(JSON.parse(raw));
  } catch {
    return normalizeAccessToken(raw);
  }
}

function readSessionStorageToken(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return readAccessTokenFromStorage(window.sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function readStoredSupabaseAccessToken(): string | null {
  if (typeof window === 'undefined' || !supabaseProjectRef) return null;
  const storageKey = `sb-${supabaseProjectRef}-auth-token`;
  return (
    readAccessTokenFromStorage(safeLocalStorageGet(storageKey)) ||
    readSessionStorageToken(storageKey)
  );
}

export function setSupabaseAccessToken(token: string | null | undefined): void {
  cachedSupabaseAccessToken = normalizeAccessToken(token) ?? null;
}

export function getSupabaseAccessToken(): string | null {
  const cached = normalizeAccessToken(cachedSupabaseAccessToken);
  if (cached) return cached;

  const stored = readStoredSupabaseAccessToken();
  if (stored) {
    cachedSupabaseAccessToken = stored;
    return stored;
  }

  return null;
}

export async function resolveSupabaseAccessToken(): Promise<string | null> {
  const immediate = getSupabaseAccessToken();
  if (immediate) return immediate;
  if (typeof window === 'undefined') return null;

  try {
    const { data } = await createClient().auth.getSession();
    const token = normalizeAccessToken(data.session?.access_token);
    if (token) {
      cachedSupabaseAccessToken = token;
    }
    return token;
  } catch {
    return null;
  }
}

const DEFAULT_TIMEOUT_MS = 25000;
let chatThemeSyncUnsupported = false;
let directMessagesOptionalColumnsUnsupported = false;
let watchGroupMessagesOptionalColumnsUnsupported = false;
const DIRECT_MESSAGES_OPTIONAL_COLUMNS_UNSUPPORTED_KEY = supabaseProjectRef
  ? `bib-${supabaseProjectRef}-direct-messages-legacy-schema`
  : 'bib-direct-messages-legacy-schema';
const WATCH_GROUP_MESSAGES_OPTIONAL_COLUMNS_UNSUPPORTED_KEY = supabaseProjectRef
  ? `bib-${supabaseProjectRef}-watch-group-messages-legacy-schema`
  : 'bib-watch-group-messages-legacy-schema';

function hydrateDirectMessagesOptionalColumnsUnsupported(): void {
  if (directMessagesOptionalColumnsUnsupported || typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(DIRECT_MESSAGES_OPTIONAL_COLUMNS_UNSUPPORTED_KEY);
    if (raw === '1') {
      directMessagesOptionalColumnsUnsupported = true;
    }
  } catch {
    // Ignore storage read failures; runtime can still detect and cache in memory.
  }
}

function markDirectMessagesOptionalColumnsUnsupported(): void {
  directMessagesOptionalColumnsUnsupported = true;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DIRECT_MESSAGES_OPTIONAL_COLUMNS_UNSUPPORTED_KEY, '1');
  } catch {
    // Ignore storage write failures; in-memory fallback still prevents repeat errors this session.
  }
}

function hydrateWatchGroupMessagesOptionalColumnsUnsupported(): void {
  if (watchGroupMessagesOptionalColumnsUnsupported || typeof window === 'undefined') return;
  try {
    const raw = window.sessionStorage.getItem(WATCH_GROUP_MESSAGES_OPTIONAL_COLUMNS_UNSUPPORTED_KEY);
    if (raw === '1') {
      watchGroupMessagesOptionalColumnsUnsupported = true;
    }
  } catch {
    // Ignore storage read failures; runtime can still detect and cache in memory.
  }
}

function markWatchGroupMessagesOptionalColumnsUnsupported(): void {
  watchGroupMessagesOptionalColumnsUnsupported = true;
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(WATCH_GROUP_MESSAGES_OPTIONAL_COLUMNS_UNSUPPORTED_KEY, '1');
  } catch {
    // Ignore storage write failures; in-memory fallback still prevents repeat errors this session.
  }
}

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

// ─── Chat Themes ─────────────────────────────────────────────────────────────
export async function getChatTheme(chatId: string): Promise<string | null> {
  if (chatThemeSyncUnsupported || !supabaseUrl || !supabaseAnonKey) return null;
  const url = `${supabaseUrl}/rest/v1/chat_themes?chat_id=eq.${chatId}&select=theme_id`;
  try {
    const response = await fetch(url, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        chatThemeSyncUnsupported = true;
      }
      return null;
    }
    const data = await response.json();
    if (!data || data.length === 0) return null;
    return data[0].theme_id;
  } catch {
    return null;
  }
}

export async function setChatTheme(chatId: string, themeId: string): Promise<void> {
  if (chatThemeSyncUnsupported || !supabaseUrl || !supabaseAnonKey) return;
  const url = `${supabaseUrl}/rest/v1/chat_themes`;

  // Upsert the theme for this chat
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      chat_id: chatId,
      theme_id: themeId,
    }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      chatThemeSyncUnsupported = true;
      return;
    }
    const errorBody = await response.text();
    console.error('Failed to set chat theme:', errorBody);
    throw new Error('Could not synchronize chat theme');
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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
      avatar: row.avatar ?? '',
      theme: row.theme ?? null,
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
      avatar: u.avatar ?? '',
      created_at: u.created_at ?? '',
      friendshipId: row?.id,
    };
  });
}

export interface WatchReminder {
  id: string;
  movieId: string;
  movieTitle: string;
  moviePoster: string | null;
  movieYear: number | null;
  remindAt: string;
  createdAt: string;
  updatedAt: string;
  notifiedAt: string | null;
  canceledAt: string | null;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  sharedMovie?: WatchGroupSharedMovie | null;
  replyToId?: string | null;
  reactions: ChatMessageReaction[];
  createdAt: string;
  mine: boolean;
}

export interface ChatMessageReaction {
  value: string;
  count: number;
  reacted: boolean;
}

export interface DirectMessageThread {
  peerId: string;
  peerName: string;
  peerUsername: string | null;
  peerAvatar: string | null;
  latestMessageId: string;
  latestBody: string;
  latestCreatedAt: string;
  latestFromMe: boolean;
}

type DirectMessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  reply_to_id?: string | null;
  shared_media_type?: 'movie' | 'show' | null;
  shared_tmdb_id?: string | null;
  shared_title?: string | null;
  shared_poster?: string | null;
  shared_release_year?: number | null;
  created_at: string;
};

interface WatchReminderPayload {
  movieId: string;
  movieTitle: string;
  moviePoster?: string | null;
  movieYear?: number | null;
  remindAt: string;
}

async function authedApiRequest<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = 15000,
): Promise<T> {
  const token = await resolveSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const base = typeof window !== 'undefined' ? window.location.origin : '';

  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let data: unknown = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
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
      throw new Error(`Request timed out after ${Math.floor(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getWatchReminderForMovie(movieId: string): Promise<WatchReminder | null> {
  const encoded = encodeURIComponent(movieId);
  const payload = await authedApiRequest<{ reminders?: WatchReminder[] }>(
    `/api/watch-reminders?movieId=${encoded}`,
    { method: 'GET' },
  );
  const reminders = Array.isArray(payload.reminders) ? payload.reminders : [];
  return reminders[0] ?? null;
}

export async function getUpcomingWatchReminders(): Promise<WatchReminder[]> {
  const payload = await authedApiRequest<{ reminders?: WatchReminder[] }>(
    '/api/watch-reminders',
    { method: 'GET' },
  );
  return Array.isArray(payload.reminders) ? payload.reminders : [];
}

export async function upsertWatchReminder(input: WatchReminderPayload): Promise<WatchReminder> {
  const payload = await authedApiRequest<{ reminder?: WatchReminder }>(
    '/api/watch-reminders',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  if (!payload.reminder) {
    throw new Error('Reminder saved but response was empty.');
  }
  return payload.reminder;
}

export async function deleteWatchReminder(movieId: string): Promise<void> {
  await authedApiRequest<{ ok?: boolean }>(
    '/api/watch-reminders',
    {
      method: 'DELETE',
      body: JSON.stringify({ movieId }),
    },
  );
}

export async function requestAccountDeletion(): Promise<void> {
  await authedApiRequest<{ ok?: boolean }>(
    '/api/account/delete',
    { method: 'POST' },
    30000,
  );
}

export interface UserBlockRelationship {
  blockedUserIds: string[];
  blockedByCurrentUser: boolean;
  blockedByTargetUser: boolean;
}

export async function getUserBlockRelationship(targetUserId?: string): Promise<UserBlockRelationship> {
  const query = targetUserId ? `?targetUserId=${encodeURIComponent(targetUserId)}` : '';
  const payload = await authedApiRequest<UserBlockRelationship>(
    `/api/user-blocks${query}`,
    { method: 'GET' },
  );

  return {
    blockedUserIds: Array.isArray(payload.blockedUserIds) ? payload.blockedUserIds : [],
    blockedByCurrentUser: Boolean(payload.blockedByCurrentUser),
    blockedByTargetUser: Boolean(payload.blockedByTargetUser),
  };
}

export async function blockUserById(targetUserId: string): Promise<string[]> {
  const payload = await authedAppRequest<{ blockedUserIds?: string[] }>(
    '/api/user-blocks',
    { targetUserId },
    { method: 'POST' },
  );
  return Array.isArray(payload.blockedUserIds) ? payload.blockedUserIds : [];
}

export async function unblockUserById(targetUserId: string): Promise<string[]> {
  const payload = await authedAppRequest<{ blockedUserIds?: string[] }>(
    '/api/user-blocks',
    { targetUserId },
    { method: 'DELETE' },
  );
  return Array.isArray(payload.blockedUserIds) ? payload.blockedUserIds : [];
}

export type SafetyReportKind = 'user' | 'direct_message' | 'group_message';

export async function submitSafetyReport(input: {
  kind: SafetyReportKind;
  reason: string;
  targetUserId?: string;
  targetMessageId?: string;
  groupId?: string;
  details?: string;
}): Promise<void> {
  await authedAppRequest<{ ok?: boolean }>(
    '/api/reports',
    input,
    { method: 'POST' },
  );
}

export async function pollDueWatchReminders(limit: number = 5): Promise<WatchReminder[]> {
  const payload = await authedApiRequest<{ reminders?: WatchReminder[] }>(
    '/api/watch-reminders/poll',
    {
      method: 'POST',
      body: JSON.stringify({ limit }),
    },
  );
  return Array.isArray(payload.reminders) ? payload.reminders : [];
}

export async function triggerWatchReminderEmailDispatch(
  limit: number = 25,
): Promise<{ processed?: number; sent?: number }> {
  const payload = await authedApiRequest<{ processed?: number; sent?: number }>(
    '/api/watch-reminders/dispatch-emails',
    {
      method: 'POST',
      body: JSON.stringify({ limit }),
    },
  );
  return payload ?? {};
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
  remind_at?: string | null;
}

export interface FriendRecommendationReminder {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  movieId: string;
  movieTitle: string;
  moviePoster: string | null;
  movieYear: number | null;
  remindAt: string;
  isTmdb: boolean;
}

export async function pollDueFriendRecommendationReminders(
  limit: number = 5,
): Promise<FriendRecommendationReminder[]> {
  const payload = await authedApiRequest<{ reminders?: FriendRecommendationReminder[] }>(
    '/api/friend-recommendation-reminders/poll',
    {
      method: 'POST',
      body: JSON.stringify({ limit }),
    },
  );
  return Array.isArray(payload.reminders) ? payload.reminders : [];
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
  remind_at?: string | null;
  created_at: string;
  tmdb_id: string | number | null;
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
  remind_at?: string | null;
  created_at: string;
  tmdb_id: string | number | null;
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
  const buildParams = (includeExtendedColumns: boolean) =>
    new URLSearchParams({
      recipient_id: `eq.${userId}`,
      select: includeExtendedColumns
        ? 'id,sender_id,movie_title,movie_poster,movie_year,personal_message,is_read,is_watched,watched_at,remind_at,created_at,tmdb_id,recommendation_id'
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
    if (
      message.includes('is_watched') ||
      message.includes('watched_at') ||
      message.includes('remind_at') ||
      message.includes('schema cache')
    ) {
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
    tmdb_id: string | number | null;
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
  remind_at?: string | null;
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
  remind_at?: string | null;
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
  const buildParams = (includeExtendedColumns: boolean) =>
    new URLSearchParams({
      sender_id: `eq.${userId}`,
      select: includeExtendedColumns
        ? 'id,recipient_id,movie_title,movie_poster,movie_year,personal_message,is_read,is_watched,watched_at,remind_at,created_at,tmdb_id,recommendation_id'
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
    if (
      message.includes('is_watched') ||
      message.includes('watched_at') ||
      message.includes('remind_at') ||
      message.includes('schema cache')
    ) {
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
    const rows = await supabaseRestRequest<{ recipient_id: string; tmdb_id: string | number | null; recommendation_id: string | null }[]>(
      `friend_recommendations?${params.toString()}`,
      { method: 'GET', timeoutMs: 10000 },
      token ?? undefined,
    );
    const set = new Set<string>();
    const arr = Array.isArray(rows) ? rows : [];
    const movieTmdb = movie.tmdbId != null ? String(movie.tmdbId) : null;
    for (const r of arr) {
      const rowTmdb = r.tmdb_id != null ? String(r.tmdb_id) : null;
      const sameMovie =
        (movieTmdb != null && rowTmdb === movieTmdb) ||
        (movie.recommendationId != null && r.recommendation_id === movie.recommendationId) ||
        (movieTmdb == null && movie.recommendationId == null && rowTmdb == null && r.recommendation_id == null);
      if (sameMovie) set.add(r.recipient_id);
    }
    return set;
  } catch {
    return new Set();
  }
}

const SEND_REC_MAX_RETRIES = 2;
const SEND_REC_RETRY_DELAYS_MS = [1500, 3000];

export type SendFriendRecommendationsResult = {
  sent: number;
  sentRecipientIds: string[];
  skipped: {
    duplicates: string[];
    notAllowed: string[];
  };
};

/**
 * Insert friend recommendations via REST (same token-based approach as fetch).
 * Avoids createClient() hanging on cold start.
 * Retries on XX000 / "Server is busy" (Supabase/Postgres internal error).
 */
export async function sendFriendRecommendations(
  rows: FriendRecommendationRow[],
): Promise<SendFriendRecommendationsResult> {
  const token = getSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${base}/api/send-friend-recommendations`;
  const body = JSON.stringify({ recommendations: rows });
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= SEND_REC_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }

      if (response.ok) {
        const payload = (typeof data === 'object' && data !== null ? data : {}) as Partial<SendFriendRecommendationsResult>;
        // Never assume success. If the API doesn't return a numeric `sent`, treat it as an error so
        // the UI doesn't show a success toast when inserts didn't happen.
        if (typeof payload.sent !== 'number') {
          throw new Error('Unexpected response from server. Please try again.');
        }
        const sent = payload.sent;
        const sentRecipientIds = Array.isArray(payload.sentRecipientIds)
          ? payload.sentRecipientIds.filter((id): id is string => typeof id === 'string')
          : [];
        const skipped = (payload.skipped ?? {}) as Partial<SendFriendRecommendationsResult['skipped']>;
        const duplicates = Array.isArray(skipped.duplicates)
          ? skipped.duplicates.filter((id): id is string => typeof id === 'string')
          : [];
        const notAllowed = Array.isArray(skipped.notAllowed)
          ? skipped.notAllowed.filter((id): id is string => typeof id === 'string')
          : [];
        return { sent, sentRecipientIds, skipped: { duplicates, notAllowed } };
      }

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
      lastErr = new Error(message || 'Request failed');
      const isRetryable =
        code === 'XX000' || /server is busy|try again/i.test(message || '');
      if (!isRetryable || attempt >= SEND_REC_MAX_RETRIES) {
        throw lastErr;
      }
      await new Promise((r) => setTimeout(r, SEND_REC_RETRY_DELAYS_MS[attempt]));
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.message === 'DUPLICATE') throw err;
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(`Request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`);
      }
      lastErr = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        lastErr.message.includes('Server is busy') ||
        lastErr.message.includes('XX000');
      if (!isRetryable || attempt >= SEND_REC_MAX_RETRIES) {
        throw lastErr;
      }
      await new Promise((r) => setTimeout(r, SEND_REC_RETRY_DELAYS_MS[attempt]));
    }
  }

  throw lastErr ?? new Error('Request failed');
}

export interface WatchGroup {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  role: 'owner' | 'member';
  memberCount: number;
  unseenCount: number;
}

export interface WatchGroupMember {
  groupId: string;
  userId: string;
  role: 'owner' | 'member';
  name: string;
  username: string | null;
  avatar: string | null;
}

export interface WatchGroupPick {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  mediaType: 'movie' | 'show';
  tmdbId: string;
  title: string;
  poster: string | null;
  releaseYear: number | null;
  note: string | null;
  createdAt: string;
  upvotes: number;
  downvotes: number;
  score: number;
  myVote: -1 | 0 | 1;
  watchedCount: number;
  memberCount: number;
  watchedByMe: boolean;
}

export interface WatchGroupSharedMovie {
  mediaType: 'movie' | 'show';
  tmdbId: string;
  title: string;
  poster: string | null;
  releaseYear: number | null;
}

export interface WatchGroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  sharedMovie: WatchGroupSharedMovie | null;
  replyToId?: string | null;
  reactions: ChatMessageReaction[];
  createdAt: string;
  mine: boolean;
}

export interface WatchGroupIncomingInvite {
  id: string;
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterName: string;
  inviterAvatar: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  createdAt: string;
}

export interface WatchGroupPendingInvite {
  id: string;
  groupId: string;
  inviteeId: string;
  inviteeName: string;
  inviteeAvatar: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'canceled';
  createdAt: string;
}

type WatchGroupRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type WatchGroupMemberRow = {
  group_id: string;
  user_id: string;
  role: 'owner' | 'member';
};

type WatchGroupPickRow = {
  id: string;
  group_id: string;
  sender_id: string;
  media_type: 'movie' | 'show';
  tmdb_id: string;
  title: string;
  poster: string | null;
  release_year: number | null;
  note: string | null;
  created_at: string;
};

type WatchGroupPickVoteRow = {
  pick_id: string;
  user_id: string;
  vote_value: -1 | 1;
};

type WatchGroupPickWatchRow = {
  pick_id: string;
  user_id: string;
};

type WatchGroupMessageRow = {
  id: string;
  group_id: string;
  sender_id: string;
  body: string | null;
  reply_to_id?: string | null;
  shared_media_type?: 'movie' | 'show' | null;
  shared_tmdb_id?: string | null;
  shared_title?: string | null;
  shared_poster?: string | null;
  shared_release_year?: number | null;
  created_at: string;
};

type MessageReactionRow = {
  message_id: string;
  user_id: string;
  reaction: string;
};

type WatchGroupInviteStatus = 'pending' | 'accepted' | 'rejected' | 'canceled';

type WatchGroupInviteRow = {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: WatchGroupInviteStatus;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
};

export type TriviaLanguage = 'en' | 'te' | 'hi' | 'ta';

export type TriviaLeaderboardEntry = {
  userId: string;
  name: string;
  username: string | null;
  avatar: string | null;
  score: number;
  durationMs: number;
  createdAt: string;
};

function ensureAuthedToken(): string {
  const token = getSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  return token;
}

async function ensureResolvedAuthedToken(): Promise<string> {
  const token = await resolveSupabaseAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  return token;
}

async function authedAppRequest<T>(
  path: string,
  body: unknown,
  options: { method?: 'POST' | 'PATCH' | 'DELETE'; timeoutMs?: number } = {},
): Promise<T> {
  const token = await ensureResolvedAuthedToken();
  const method = options.method ?? 'POST';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body == null ? undefined : JSON.stringify(body),
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
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeReactionValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return Array.from(trimmed).slice(0, 8).join('');
}

function buildReactionSummaryMap(
  rows: MessageReactionRow[],
  currentUserId: string,
): Map<string, ChatMessageReaction[]> {
  const byMessage = new Map<
    string,
    Map<string, { count: number; reacted: boolean }>
  >();

  for (const row of rows) {
    const reaction = normalizeReactionValue(row.reaction);
    if (!reaction) continue;
    const byReaction = byMessage.get(row.message_id) ?? new Map<string, { count: number; reacted: boolean }>();
    const prev = byReaction.get(reaction) ?? { count: 0, reacted: false };
    byReaction.set(reaction, {
      count: prev.count + 1,
      reacted: prev.reacted || row.user_id === currentUserId,
    });
    byMessage.set(row.message_id, byReaction);
  }

  const summaryMap = new Map<string, ChatMessageReaction[]>();
  for (const [messageId, reactionsMap] of byMessage.entries()) {
    const summary = [...reactionsMap.entries()]
      .map(([value, stats]) => ({
        value,
        count: stats.count,
        reacted: stats.reacted,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.value.localeCompare(b.value);
      });
    summaryMap.set(messageId, summary);
  }
  return summaryMap;
}

function isMissingDirectMessageReactionsTableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('direct_message_reactions') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
}

function isMissingWatchGroupMessageReactionsTableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('watch_group_message_reactions') &&
    (message.includes('does not exist') || message.includes('schema cache'))
  );
}

function isMissingDirectMessagesTableError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return (
    message.includes('direct_messages') &&
    (message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('not found')) &&
    !message.includes('reply_to_id') &&
    !message.includes('shared_media_type') &&
    !message.includes('shared_tmdb_id') &&
    !message.includes('shared_title') &&
    !message.includes('shared_poster') &&
    !message.includes('shared_release_year')
  );
}

function isMissingDirectMessageOptionalColumnsError(err: unknown): boolean {
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  const mentionsOptionalColumn =
    message.includes('reply_to_id') ||
    message.includes('shared_media_type') ||
    message.includes('shared_tmdb_id') ||
    message.includes('shared_title') ||
    message.includes('shared_poster') ||
    message.includes('shared_release_year');

  return (
    message.includes('schema cache') ||
    (mentionsOptionalColumn && message.includes('column') && message.includes('direct_messages'))
  );
}

const LEGACY_DIRECT_REPLY_PREFIX = '[[bib_reply_to:';
const LEGACY_GROUP_REPLY_PREFIX = '[[bib_reply_to:';

function normalizeLegacyReplyBody(body: string | null | undefined): string {
  const value = body ?? '';
  return value.startsWith('\u2063') ? value.slice(1) : value;
}

function decodeLegacyDirectReplyBody(body: string | null | undefined): {
  body: string;
  replyToId: string | null;
} {
  const rawBody = body ?? '';
  if (rawBody.startsWith('\u2063')) {
    return { body: rawBody.slice(1), replyToId: null };
  }

  const raw = rawBody.trimStart();
  if (!raw.startsWith(LEGACY_DIRECT_REPLY_PREFIX)) {
    return { body: normalizeLegacyReplyBody(body), replyToId: null };
  }
  const prefixEnd = raw.indexOf(']]');
  if (prefixEnd === -1) {
    return { body: normalizeLegacyReplyBody(body), replyToId: null };
  }
  const replyToId = raw.slice(LEGACY_DIRECT_REPLY_PREFIX.length, prefixEnd).trim();
  const withoutPrefix = raw.slice(prefixEnd + 2).replace(/^\s+/, '');
  return {
    body: withoutPrefix,
    replyToId: replyToId || null,
  };
}

function decodeLegacyGroupReplyBody(body: string | null | undefined): {
  body: string;
  replyToId: string | null;
} {
  const rawBody = body ?? '';
  if (rawBody.startsWith('\u2063')) {
    return { body: rawBody.slice(1), replyToId: null };
  }

  const raw = rawBody.trimStart();
  if (!raw.startsWith(LEGACY_GROUP_REPLY_PREFIX)) {
    return { body: normalizeLegacyReplyBody(body), replyToId: null };
  }
  const prefixEnd = raw.indexOf(']]');
  if (prefixEnd === -1) {
    return { body: normalizeLegacyReplyBody(body), replyToId: null };
  }
  const replyToId = raw.slice(LEGACY_GROUP_REPLY_PREFIX.length, prefixEnd).trim();
  const withoutPrefix = raw.slice(prefixEnd + 2).replace(/^\s+/, '');
  return {
    body: withoutPrefix,
    replyToId: replyToId || null,
  };
}

export async function sendDirectMessage(input: {
  senderId: string;
  recipientId: string;
  body: string;
  replyToId?: string | null;
  sharedMovie?: WatchGroupSharedMovie | null;
}): Promise<void> {
  const body = input.body.trim();
  const sharedMovie = input.sharedMovie
    ? {
      mediaType: input.sharedMovie.mediaType,
      tmdbId: input.sharedMovie.tmdbId.trim().slice(0, 64),
      title: input.sharedMovie.title.trim().slice(0, 200),
      poster: input.sharedMovie.poster?.trim().slice(0, 500) ?? null,
      releaseYear: input.sharedMovie.releaseYear ?? null,
    }
    : null;
  if (!body && !sharedMovie) {
    throw new Error('Message cannot be empty.');
  }
  await authedAppRequest('/api/direct-messages/send', {
    recipientId: input.recipientId,
    body,
    replyToId: input.replyToId ?? null,
    sharedMovie,
  });
}

export async function getDirectMessagesWithUser(
  currentUserId: string,
  peerUserId: string,
): Promise<DirectMessage[]> {
  hydrateDirectMessagesOptionalColumnsUnsupported();
  const token = ensureAuthedToken();
  try {
    const makeParams = (includeSharedColumns: boolean) =>
      new URLSearchParams({
        select: includeSharedColumns
          ? 'id,sender_id,recipient_id,body,reply_to_id,shared_media_type,shared_tmdb_id,shared_title,shared_poster,shared_release_year,created_at'
          : 'id,sender_id,recipient_id,body,reply_to_id,created_at',
        or: `(and(sender_id.eq.${currentUserId},recipient_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},recipient_id.eq.${currentUserId}))`,
        order: 'created_at.asc',
        limit: '200',
      });
    const legacyParams = new URLSearchParams({
      select: 'id,sender_id,recipient_id,body,created_at',
      or: `(and(sender_id.eq.${currentUserId},recipient_id.eq.${peerUserId}),and(sender_id.eq.${peerUserId},recipient_id.eq.${currentUserId}))`,
      order: 'created_at.asc',
      limit: '200',
    });
    let rows: DirectMessageRow[];
    if (directMessagesOptionalColumnsUnsupported) {
      rows = await supabaseRestRequest<DirectMessageRow[]>(
        `direct_messages?${legacyParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    } else {
      try {
        rows = await supabaseRestRequest<DirectMessageRow[]>(
          `direct_messages?${makeParams(true).toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        );
      } catch (err) {
        if (!isMissingDirectMessageOptionalColumnsError(err)) throw err;
        markDirectMessagesOptionalColumnsUnsupported();
        rows = await supabaseRestRequest<DirectMessageRow[]>(
          `direct_messages?${legacyParams.toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        );
      }
    }
    const messages = Array.isArray(rows) ? rows : [];
    if (messages.length === 0) return [];

    const senderIds = [...new Set(messages.map((msg) => msg.sender_id))];
    const usersParams = new URLSearchParams({
      select: 'id,name,avatar',
      id: `in.(${senderIds.join(',')})`,
    });
    const users = await supabaseRestRequest<Array<{ id: string; name: string; avatar: string | null }>>(
      `users?${usersParams.toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
    const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u]));
    let reactionsByMessage = new Map<string, ChatMessageReaction[]>();
    try {
      const messageIds = messages.map((msg) => msg.id);
      const reactionParams = new URLSearchParams({
        select: 'message_id,user_id,reaction',
        message_id: `in.(${messageIds.join(',')})`,
        limit: '2000',
      });
      const reactionRows = await supabaseRestRequest<MessageReactionRow[]>(
        `direct_message_reactions?${reactionParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
      reactionsByMessage = buildReactionSummaryMap(Array.isArray(reactionRows) ? reactionRows : [], currentUserId);
    } catch (err) {
      if (!isMissingDirectMessageReactionsTableError(err)) {
        throw err;
      }
    }

    return messages.map((msg) => {
      const decodedLegacy = decodeLegacyDirectReplyBody(msg.body);
      const normalizedBody = normalizeLegacyReplyBody(msg.body);
      const sender = userMap.get(msg.sender_id);
      const sharedMovie =
        msg.shared_media_type && msg.shared_tmdb_id && msg.shared_title
          ? {
            mediaType: msg.shared_media_type,
            tmdbId: msg.shared_tmdb_id,
            title: msg.shared_title,
            poster: msg.shared_poster ?? null,
            releaseYear: msg.shared_release_year ?? null,
          }
          : null;
      return {
        id: msg.id,
        senderId: msg.sender_id,
        recipientId: msg.recipient_id,
        senderName: sender?.name || 'Member',
        senderAvatar: sender?.avatar ?? null,
        body: msg.reply_to_id ? normalizedBody : decodedLegacy.body,
        sharedMovie,
        replyToId: msg.reply_to_id ?? decodedLegacy.replyToId ?? null,
        reactions: reactionsByMessage.get(msg.id) ?? [],
        createdAt: msg.created_at,
        mine: msg.sender_id === currentUserId,
      } satisfies DirectMessage;
    });
  } catch (err) {
    if (isMissingDirectMessagesTableError(err)) {
      return [];
    }
    throw err;
  }
}

export async function toggleDirectMessageReaction(input: {
  messageId: string;
  userId: string;
  reaction: string;
}): Promise<void> {
  const token = ensureAuthedToken();
  const reaction = normalizeReactionValue(input.reaction);
  if (!reaction) {
    throw new Error('Reaction cannot be empty.');
  }

  const existingParams = new URLSearchParams({
    select: 'reaction',
    message_id: `eq.${input.messageId}`,
    user_id: `eq.${input.userId}`,
    limit: '1',
  });
  const existingRows = await supabaseRestRequest<Array<{ reaction: string }>>(
    `direct_message_reactions?${existingParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] : undefined;
  const existingReaction = normalizeReactionValue(existing?.reaction ?? '');

  if (existing && existingReaction === reaction) {
    const deleteParams = new URLSearchParams({
      message_id: `eq.${input.messageId}`,
      user_id: `eq.${input.userId}`,
    });
    await supabaseRestRequest(
      `direct_message_reactions?${deleteParams.toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    );
    return;
  }

  await supabaseRestRequest(
    'direct_message_reactions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        message_id: input.messageId,
        user_id: input.userId,
        reaction,
        updated_at: new Date().toISOString(),
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function deleteDirectMessage(input: {
  messageId: string;
  userId: string;
}): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({
    id: `eq.${input.messageId}`,
    sender_id: `eq.${input.userId}`,
  });
  await supabaseRestRequest(
    `direct_messages?${params.toString()}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function getDirectChatThreads(
  currentUserId: string,
): Promise<DirectMessageThread[]> {
  hydrateDirectMessagesOptionalColumnsUnsupported();
  const token = ensureAuthedToken();
  try {
    const makeParams = (includeSharedColumns: boolean) =>
      new URLSearchParams({
        select: includeSharedColumns
          ? 'id,sender_id,recipient_id,body,shared_media_type,shared_tmdb_id,shared_title,created_at'
          : 'id,sender_id,recipient_id,body,created_at',
        or: `(sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId})`,
        order: 'created_at.desc',
        limit: '400',
      });
    let rows: DirectMessageRow[];
    if (directMessagesOptionalColumnsUnsupported) {
      rows = await supabaseRestRequest<DirectMessageRow[]>(
        `direct_messages?${makeParams(false).toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    } else {
      try {
        rows = await supabaseRestRequest<DirectMessageRow[]>(
          `direct_messages?${makeParams(true).toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        );
      } catch (err) {
        if (!isMissingDirectMessageOptionalColumnsError(err)) throw err;
        markDirectMessagesOptionalColumnsUnsupported();
        rows = await supabaseRestRequest<DirectMessageRow[]>(
          `direct_messages?${makeParams(false).toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        );
      }
    }
    const messages = Array.isArray(rows) ? rows : [];
    if (messages.length === 0) return [];

    const latestByPeer = new Map<string, DirectMessageRow>();
    for (const message of messages) {
      const peerId =
        message.sender_id === currentUserId ? message.recipient_id : message.sender_id;
      if (!latestByPeer.has(peerId)) {
        latestByPeer.set(peerId, message);
      }
    }
    const peerIds = [...latestByPeer.keys()];
    if (peerIds.length === 0) return [];

    const usersParams = new URLSearchParams({
      select: 'id,name,username,avatar',
      id: `in.(${peerIds.join(',')})`,
    });
    const users = await supabaseRestRequest<
      Array<{ id: string; name: string; username: string | null; avatar: string | null }>
    >(
      `users?${usersParams.toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
    const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u]));

    return peerIds
      .map((peerId) => {
        const message = latestByPeer.get(peerId);
        if (!message) return null;
        const peer = userMap.get(peerId);
        const decodedLegacy = decodeLegacyDirectReplyBody(message.body);
        return {
          peerId,
          peerName: peer?.name || 'Member',
          peerUsername: peer?.username ?? null,
          peerAvatar: peer?.avatar ?? null,
          latestMessageId: message.id,
          latestBody:
            decodedLegacy.body || (message.shared_title ? `Shared: ${message.shared_title}` : 'Message'),
          latestCreatedAt: message.created_at,
          latestFromMe: message.sender_id === currentUserId,
        } satisfies DirectMessageThread;
      })
      .filter((row): row is DirectMessageThread => Boolean(row))
      .sort(
        (a, b) =>
          new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime(),
      );
  } catch (err) {
    if (isMissingDirectMessagesTableError(err)) {
      return [];
    }
    throw err;
  }
}

function mapWatchGroup(
  group: WatchGroupRow,
  membership: WatchGroupMemberRow,
  memberCount: number,
): WatchGroup {
  return {
    id: group.id,
    ownerId: group.owner_id,
    name: group.name,
    description: group.description,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
    role: membership.role,
    memberCount,
    unseenCount: 0,
  };
}

async function getWatchGroupUnseenCountMap(
  groupIds: string[],
): Promise<Map<string, number>> {
  const token = ensureAuthedToken();
  if (groupIds.length === 0) return new Map();
  try {
    const rows = await supabaseRestRequest<Array<{ group_id: string; unseen_count: number | string }>>(
      'rpc/get_watch_group_unseen_counts',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_group_ids: groupIds }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    );
    const map = new Map<string, number>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row.group_id || '').trim();
      if (!id) continue;
      const raw = typeof row.unseen_count === 'string' ? Number(row.unseen_count) : row.unseen_count;
      const value = Number.isFinite(raw) ? Number(raw) : 0;
      map.set(id, Math.max(0, value));
    }
    return map;
  } catch {
    // If the RPC isn't installed yet, don't break the UI.
    return new Map();
  }
}

export async function markWatchGroupSeen(groupId: string): Promise<void> {
  const token = ensureAuthedToken();
  try {
    await supabaseRestRequest(
      'rpc/mark_watch_group_seen',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_group_id: groupId }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    );
  } catch {
    // ignore (RPC may not exist yet)
  }
}

export async function submitTriviaAttempt(input: {
  weekKey: string;
  language: TriviaLanguage;
  score: number;
  durationMs: number;
}): Promise<string> {
  const token = ensureAuthedToken();
  const payload = await supabaseRestRequest<
    Array<{ submit_trivia_attempt?: string }> | { submit_trivia_attempt?: string } | string
  >(
    'rpc/submit_trivia_attempt',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_week_key: input.weekKey,
        p_language: input.language,
        p_score: input.score,
        p_duration_ms: input.durationMs,
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );

  // Supabase/PostgREST can return RPC scalar values in different shapes:
  // 1) "uuid-string"
  // 2) { submit_trivia_attempt: "uuid-string" }
  // 3) [{ submit_trivia_attempt: "uuid-string" }]
  let id = '';
  if (typeof payload === 'string') {
    id = payload.trim();
  } else if (Array.isArray(payload)) {
    const first = payload[0];
    id = first ? String(first.submit_trivia_attempt || '').trim() : '';
  } else if (payload && typeof payload === 'object') {
    id = String(payload.submit_trivia_attempt || '').trim();
  }

  if (!id) throw new Error('Failed to submit trivia attempt.');
  return id;
}

export async function getTriviaLeaderboard(input: {
  weekKey: string;
  language: TriviaLanguage;
}): Promise<TriviaLeaderboardEntry[]> {
  const token = ensureAuthedToken();
  const rows = await supabaseRestRequest<
    Array<{
      user_id: string;
      name: string;
      username: string | null;
      avatar: string | null;
      score: number | string;
      duration_ms: number | string;
      created_at: string;
    }>
  >(
    'rpc/get_trivia_leaderboard',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_week_key: input.weekKey,
        p_language: input.language,
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const scoreRaw = typeof row.score === 'string' ? Number(row.score) : row.score;
    const durationRaw = typeof row.duration_ms === 'string' ? Number(row.duration_ms) : row.duration_ms;
    return {
      userId: row.user_id,
      name: row.name || 'User',
      username: row.username ?? null,
      avatar: row.avatar ?? null,
      score: Number.isFinite(scoreRaw) ? Number(scoreRaw) : 0,
      durationMs: Number.isFinite(durationRaw) ? Number(durationRaw) : 0,
      createdAt: row.created_at,
    } satisfies TriviaLeaderboardEntry;
  }).slice(0, 3);
}

export async function createWatchGroup(
  ownerId: string,
  input: { name: string; description?: string | null },
): Promise<WatchGroup> {
  const token = ensureAuthedToken();
  const payload = {
    owner_id: ownerId,
    name: input.name.trim().slice(0, 60),
    description: input.description?.trim() ? input.description.trim().slice(0, 300) : null,
  };

  const groups = await supabaseRestRequest<WatchGroupRow[]>(
    'watch_groups?select=id,owner_id,name,description,created_at,updated_at',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );

  const row = Array.isArray(groups) && groups.length > 0 ? groups[0] : null;
  if (!row) throw new Error('Failed to create group.');

  return mapWatchGroup(row, { group_id: row.id, user_id: ownerId, role: 'owner' }, 1);
}

export async function updateWatchGroup(
  groupId: string,
  input: { name: string; description?: string | null },
): Promise<WatchGroup> {
  const token = ensureAuthedToken();
  const name = input.name.trim();
  if (name.length < 2) {
    throw new Error('Group name must be at least 2 characters.');
  }
  const params = new URLSearchParams({
    id: `eq.${groupId}`,
    select: 'id,owner_id,name,description,created_at,updated_at',
  });
  const rows = await supabaseRestRequest<WatchGroupRow[]>(
    `watch_groups?${params.toString()}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        name: name.slice(0, 60),
        description: input.description?.trim() ? input.description.trim().slice(0, 300) : null,
        updated_at: new Date().toISOString(),
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!row) {
    throw new Error('Failed to update group.');
  }
  const memberCountParams = new URLSearchParams({
    select: 'group_id,user_id,role',
    group_id: `eq.${groupId}`,
  });
  const memberRows = await supabaseRestRequest<WatchGroupMemberRow[]>(
    `watch_group_members?${memberCountParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  return mapWatchGroup(
    row,
    {
      group_id: row.id,
      user_id: row.owner_id,
      role: 'owner',
    },
    Array.isArray(memberRows) ? memberRows.length : 1,
  );
}

export async function renameWatchGroup(
  groupId: string,
  nameInput: string,
): Promise<void> {
  const token = ensureAuthedToken();
  const name = nameInput.trim();
  if (name.length < 2) {
    throw new Error('Group name must be at least 2 characters.');
  }
  await supabaseRestRequest(
    'rpc/rename_watch_group',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_group_id: groupId,
        p_name: name.slice(0, 60),
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function getMyWatchGroups(userId: string): Promise<WatchGroup[]> {
  const token = ensureAuthedToken();
  const membershipParams = new URLSearchParams({
    select: 'group_id,user_id,role',
    user_id: `eq.${userId}`,
  });
  const memberships = await supabaseRestRequest<WatchGroupMemberRow[]>(
    `watch_group_members?${membershipParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  if (!Array.isArray(memberships) || memberships.length === 0) return [];

  const groupIds = memberships.map((m) => m.group_id);
  const unseenByGroup = await getWatchGroupUnseenCountMap(groupIds);
  const groupsParams = new URLSearchParams({
    select: 'id,owner_id,name,description,created_at,updated_at',
    id: `in.(${groupIds.join(',')})`,
  });
  const groups = await supabaseRestRequest<WatchGroupRow[]>(
    `watch_groups?${groupsParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );

  const countsParams = new URLSearchParams({
    select: 'group_id,user_id,role',
    group_id: `in.(${groupIds.join(',')})`,
  });
  const allMembers = await supabaseRestRequest<WatchGroupMemberRow[]>(
    `watch_group_members?${countsParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const countByGroup = new Map<string, number>();
  for (const member of Array.isArray(allMembers) ? allMembers : []) {
    countByGroup.set(member.group_id, (countByGroup.get(member.group_id) ?? 0) + 1);
  }

  const membershipByGroup = new Map(memberships.map((m) => [m.group_id, m]));
  const rows = Array.isArray(groups) ? groups : [];
  return rows
    .map((group) => {
      const membership = membershipByGroup.get(group.id);
      if (!membership) return null;
      const base = mapWatchGroup(group, membership, countByGroup.get(group.id) ?? 1);
      return { ...base, unseenCount: unseenByGroup.get(group.id) ?? 0 };
    })
    .filter((group): group is WatchGroup => group !== null)
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}

export async function getWatchGroupMembers(groupId: string): Promise<WatchGroupMember[]> {
  const token = ensureAuthedToken();
  const membersParams = new URLSearchParams({
    select: 'group_id,user_id,role',
    group_id: `eq.${groupId}`,
  });
  const rows = await supabaseRestRequest<WatchGroupMemberRow[]>(
    `watch_group_members?${membersParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const usersParams = new URLSearchParams({
    select: 'id,name,username,avatar',
    id: `in.(${userIds.join(',')})`,
  });
  const users = await supabaseRestRequest<Array<{ id: string; name: string; username: string | null; avatar: string | null }>>(
    `users?${usersParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u]));

  return rows
    .map((row) => {
      const user = userMap.get(row.user_id);
      if (!user) return null;
      return {
        groupId: row.group_id,
        userId: row.user_id,
        role: row.role,
        name: user.name || 'User',
        username: user.username ?? null,
        avatar: user.avatar ?? null,
      } satisfies WatchGroupMember;
    })
    .filter((member): member is WatchGroupMember => member !== null)
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'owner' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export async function addWatchGroupMember(groupId: string, memberUserId: string): Promise<void> {
  const token = ensureAuthedToken();
  await supabaseRestRequest(
    'watch_group_members',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        group_id: groupId,
        user_id: memberUserId,
        role: 'member',
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function leaveWatchGroup(groupId: string, userId: string): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({
    group_id: `eq.${groupId}`,
    user_id: `eq.${userId}`,
  });
  await supabaseRestRequest(
    `watch_group_members?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function removeWatchGroupMember(groupId: string, memberUserId: string): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({
    group_id: `eq.${groupId}`,
    user_id: `eq.${memberUserId}`,
  });
  await supabaseRestRequest(
    `watch_group_members?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function sendWatchGroupInvite(input: {
  groupId: string;
  inviterId: string;
  inviteeId: string;
}): Promise<void> {
  const token = ensureAuthedToken();
  if (!input.groupId || !input.inviterId || !input.inviteeId) {
    throw new Error('Missing invite details.');
  }
  if (input.inviterId === input.inviteeId) {
    throw new Error('You cannot invite yourself.');
  }

  const memberCheckParams = new URLSearchParams({
    select: 'group_id,user_id,role',
    group_id: `eq.${input.groupId}`,
    user_id: `eq.${input.inviteeId}`,
    limit: '1',
  });
  const existingMembers = await supabaseRestRequest<WatchGroupMemberRow[]>(
    `watch_group_members?${memberCheckParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  if (Array.isArray(existingMembers) && existingMembers.length > 0) {
    throw new Error('This friend is already in the group.');
  }

  const inviteCheckParams = new URLSearchParams({
    select: 'id',
    group_id: `eq.${input.groupId}`,
    invitee_id: `eq.${input.inviteeId}`,
    status: 'eq.pending',
    limit: '1',
  });
  const existingInvites = await supabaseRestRequest<Array<{ id: string }>>(
    `watch_group_invites?${inviteCheckParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  if (Array.isArray(existingInvites) && existingInvites.length > 0) {
    throw new Error('Invite already pending for this friend.');
  }

  await supabaseRestRequest(
    'watch_group_invites',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        group_id: input.groupId,
        inviter_id: input.inviterId,
        invitee_id: input.inviteeId,
        status: 'pending',
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function getIncomingWatchGroupInvites(
  userId: string,
): Promise<WatchGroupIncomingInvite[]> {
  const token = ensureAuthedToken();
  const inviteParams = new URLSearchParams({
    select: 'id,group_id,inviter_id,invitee_id,status,created_at,updated_at,responded_at',
    invitee_id: `eq.${userId}`,
    status: 'eq.pending',
    order: 'created_at.desc',
  });
  const inviteRows = await supabaseRestRequest<WatchGroupInviteRow[]>(
    `watch_group_invites?${inviteParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const invites = Array.isArray(inviteRows) ? inviteRows : [];
  if (invites.length === 0) return [];

  const inviterIds = [...new Set(invites.map((invite) => invite.inviter_id))];
  const groupIds = [...new Set(invites.map((invite) => invite.group_id))];
  const memberRows = await (async () => {
    if (groupIds.length === 0) return [] as WatchGroupMemberRow[];
    try {
      const memberParams = new URLSearchParams({
        select: 'group_id,user_id,role',
        group_id: `in.(${groupIds.join(',')})`,
        user_id: `eq.${userId}`,
      });
      const rows = await supabaseRestRequest<WatchGroupMemberRow[]>(
        `watch_group_members?${memberParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [] as WatchGroupMemberRow[];
    }
  })();
  const joinedGroupIds = new Set(memberRows.map((row) => row.group_id));
  const staleInviteIds = invites
    .filter((invite) => joinedGroupIds.has(invite.group_id))
    .map((invite) => invite.id);
  if (staleInviteIds.length > 0) {
    const staleParams = new URLSearchParams({
      id: `in.(${staleInviteIds.join(',')})`,
      status: 'eq.pending',
    });
    await supabaseRestRequest(
      `watch_group_invites?${staleParams.toString()}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: 'accepted',
          updated_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
        }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    ).catch(() => undefined);
  }
  const pendingInvites = invites.filter((invite) => !joinedGroupIds.has(invite.group_id));
  if (pendingInvites.length === 0) return [];

  const [inviters, groups] = await Promise.all([
    (async () => {
      if (inviterIds.length === 0) return [] as Array<{ id: string; name: string; avatar: string | null }>;
      try {
        const inviterParams = new URLSearchParams({
          select: 'id,name,avatar',
          id: `in.(${inviterIds.join(',')})`,
        });
        const rows = await supabaseRestRequest<Array<{ id: string; name: string; avatar: string | null }>>(
          `users?${inviterParams.toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        );
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [] as Array<{ id: string; name: string; avatar: string | null }>;
      }
    })(),
    (async () => {
      if (groupIds.length === 0) return [] as Array<{ id: string; name: string }>;
      try {
        const groupParams = new URLSearchParams({
          select: 'id,name',
          id: `in.(${groupIds.join(',')})`,
        });
        const rows = await supabaseRestRequest<Array<{ id: string; name: string }>>(
          `watch_groups?${groupParams.toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        );
        return Array.isArray(rows) ? rows : [];
      } catch {
        return [] as Array<{ id: string; name: string }>;
      }
    })(),
  ]);

  const inviterMap = new Map(inviters.map((row) => [row.id, row]));
  const groupMap = new Map(groups.map((row) => [row.id, row]));

  return pendingInvites.map((invite) => {
    const inviter = inviterMap.get(invite.inviter_id);
    const group = groupMap.get(invite.group_id);
    return {
      id: invite.id,
      groupId: invite.group_id,
      groupName: group?.name || 'Group',
      inviterId: invite.inviter_id,
      inviterName: inviter?.name || 'Friend',
      inviterAvatar: inviter?.avatar ?? null,
      status: invite.status,
      createdAt: invite.created_at,
    } satisfies WatchGroupIncomingInvite;
  });
}

export async function getPendingWatchGroupInvites(
  groupId: string,
): Promise<WatchGroupPendingInvite[]> {
  const token = ensureAuthedToken();
  const inviteParams = new URLSearchParams({
    select: 'id,group_id,inviter_id,invitee_id,status,created_at,updated_at,responded_at',
    group_id: `eq.${groupId}`,
    status: 'eq.pending',
    order: 'created_at.desc',
  });
  const inviteRows = await supabaseRestRequest<WatchGroupInviteRow[]>(
    `watch_group_invites?${inviteParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const invites = Array.isArray(inviteRows) ? inviteRows : [];
  if (invites.length === 0) return [];
  const memberRows = await (async () => {
    try {
      const memberParams = new URLSearchParams({
        select: 'group_id,user_id,role',
        group_id: `eq.${groupId}`,
      });
      const rows = await supabaseRestRequest<WatchGroupMemberRow[]>(
        `watch_group_members?${memberParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [] as WatchGroupMemberRow[];
    }
  })();
  const memberIds = new Set(memberRows.map((row) => row.user_id));
  const staleInviteIds = invites
    .filter((invite) => memberIds.has(invite.invitee_id))
    .map((invite) => invite.id);
  if (staleInviteIds.length > 0) {
    const staleParams = new URLSearchParams({
      id: `in.(${staleInviteIds.join(',')})`,
      status: 'eq.pending',
    });
    await supabaseRestRequest(
      `watch_group_invites?${staleParams.toString()}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          status: 'canceled',
          updated_at: new Date().toISOString(),
        }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    ).catch(() => undefined);
  }
  const pendingInvites = invites.filter((invite) => !memberIds.has(invite.invitee_id));
  if (pendingInvites.length === 0) return [];

  const inviteeIds = [...new Set(pendingInvites.map((invite) => invite.invitee_id))];
  const invitees = await (async () => {
    if (inviteeIds.length === 0) return [] as Array<{ id: string; name: string; avatar: string | null }>;
    try {
      const inviteeParams = new URLSearchParams({
        select: 'id,name,avatar',
        id: `in.(${inviteeIds.join(',')})`,
      });
      const rows = await supabaseRestRequest<Array<{ id: string; name: string; avatar: string | null }>>(
        `users?${inviteeParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [] as Array<{ id: string; name: string; avatar: string | null }>;
    }
  })();
  const inviteeMap = new Map(invitees.map((row) => [row.id, row]));

  return pendingInvites.map((invite) => {
    const invitee = inviteeMap.get(invite.invitee_id);
    return {
      id: invite.id,
      groupId: invite.group_id,
      inviteeId: invite.invitee_id,
      inviteeName: invitee?.name || 'Friend',
      inviteeAvatar: invitee?.avatar ?? null,
      status: invite.status,
      createdAt: invite.created_at,
    } satisfies WatchGroupPendingInvite;
  });
}

export async function cancelWatchGroupInvite(inviteId: string, groupId?: string): Promise<void> {
  const token = ensureAuthedToken();
  const patchParams = new URLSearchParams({
    id: `eq.${inviteId}`,
    status: 'eq.pending',
  });
  if (groupId) {
    patchParams.set('group_id', `eq.${groupId}`);
  }
  await supabaseRestRequest(
    `watch_group_invites?${patchParams.toString()}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function respondToWatchGroupInvite(
  inviteId: string,
  decision: 'accepted' | 'rejected',
  currentUserId: string,
): Promise<{ inviteId: string; groupId: string; status: 'accepted' | 'rejected' }> {
  const token = ensureAuthedToken();
  try {
    const rows = await supabaseRestRequest<Array<{ invite_id: string; group_id: string; status: string }>>(
      'rpc/respond_watch_group_invite',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          p_invite_id: inviteId,
          p_decision: decision,
        }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    );

    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    if (!row || (row.status !== 'accepted' && row.status !== 'rejected')) {
      throw new Error('Failed to respond to invite.');
    }
    return {
      inviteId: row.invite_id,
      groupId: row.group_id,
      status: row.status,
    };
  } catch (rpcErr) {
    const message = rpcErr instanceof Error ? rpcErr.message.toLowerCase() : '';
    const shouldNotFallback =
      message.includes('jwt') ||
      message.includes('token') ||
      message.includes('not authenticated');
    if (shouldNotFallback) {
      throw rpcErr;
    }

    const inviteParams = new URLSearchParams({
      select: 'id,group_id,inviter_id,invitee_id,status',
      id: `eq.${inviteId}`,
      limit: '1',
    });
    const inviteRows = await supabaseRestRequest<Array<{
      id: string;
      group_id: string;
      inviter_id: string;
      invitee_id: string;
      status: string;
    }>>(
      `watch_group_invites?${inviteParams.toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
    const invite = Array.isArray(inviteRows) && inviteRows.length > 0 ? inviteRows[0] : null;
    if (!invite) {
      throw new Error('Invite not found.');
    }
    if (invite.invitee_id !== currentUserId) {
      throw new Error('Not allowed to respond to this invite.');
    }

    if (invite.status === 'accepted' || invite.status === 'rejected') {
      if (decision === 'accepted' && invite.status === 'accepted') {
        const membershipCheckParams = new URLSearchParams({
          select: 'group_id,user_id,role',
          group_id: `eq.${invite.group_id}`,
          user_id: `eq.${invite.invitee_id}`,
          limit: '1',
        });
        const existingMembership = await supabaseRestRequest<WatchGroupMemberRow[]>(
          `watch_group_members?${membershipCheckParams.toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        ).catch(() => [] as WatchGroupMemberRow[]);
        const hasMembership = Array.isArray(existingMembership) && existingMembership.length > 0;
        if (!hasMembership) {
          const memberConflictParams = new URLSearchParams({ on_conflict: 'group_id,user_id' });
          await supabaseRestRequest(
            `watch_group_members?${memberConflictParams.toString()}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal',
              },
              body: JSON.stringify({
                group_id: invite.group_id,
                user_id: invite.invitee_id,
                role: 'member',
              }),
              timeoutMs: DEFAULT_TIMEOUT_MS,
            },
            token,
          );
        }
      }
      return {
        inviteId: invite.id,
        groupId: invite.group_id,
        status: invite.status,
      };
    }
    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer pending.');
    }

    if (decision === 'accepted') {
      const memberConflictParams = new URLSearchParams({ on_conflict: 'group_id,user_id' });
      try {
        await supabaseRestRequest(
          `watch_group_members?${memberConflictParams.toString()}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify({
              group_id: invite.group_id,
              user_id: invite.invitee_id,
              role: 'member',
            }),
            timeoutMs: DEFAULT_TIMEOUT_MS,
          },
          token,
        );
      } catch (memberErr) {
        const memberMessage = memberErr instanceof Error ? memberErr.message : 'Membership insert failed.';
        throw new Error(`Unable to accept invite right now. ${memberMessage}`);
      }
    }

    const patchParams = new URLSearchParams({
      id: `eq.${invite.id}`,
      status: 'eq.pending',
    });
    const patchedRows = await supabaseRestRequest<Array<{ id: string; group_id: string; status: string }>>(
      `watch_group_invites?${patchParams.toString()}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          status: decision,
          updated_at: new Date().toISOString(),
          responded_at: new Date().toISOString(),
        }),
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    );
    const patched = Array.isArray(patchedRows) && patchedRows.length > 0 ? patchedRows[0] : null;
    if (patched && (patched.status === 'accepted' || patched.status === 'rejected')) {
      return {
        inviteId: patched.id,
        groupId: patched.group_id,
        status: patched.status,
      };
    }

    const finalRows = await supabaseRestRequest<Array<{ id: string; group_id: string; status: string }>>(
      `watch_group_invites?${inviteParams.toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
    const finalInvite = Array.isArray(finalRows) && finalRows.length > 0 ? finalRows[0] : null;
    if (!finalInvite || (finalInvite.status !== 'accepted' && finalInvite.status !== 'rejected')) {
      throw new Error('Invite response could not be confirmed.');
    }

    return {
      inviteId: finalInvite.id,
      groupId: finalInvite.group_id,
      status: finalInvite.status,
    };
  }
}

export async function addWatchGroupPick(input: {
  groupId: string;
  senderId: string;
  mediaType: 'movie' | 'show';
  tmdbId: string;
  title: string;
  poster?: string | null;
  releaseYear?: number | null;
  note?: string | null;
}): Promise<void> {
  const token = ensureAuthedToken();
  await supabaseRestRequest(
    'watch_group_picks',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        group_id: input.groupId,
        sender_id: input.senderId,
        media_type: input.mediaType,
        tmdb_id: input.tmdbId,
        title: input.title.trim().slice(0, 200),
        poster: input.poster?.trim() ? input.poster.trim().slice(0, 500) : null,
        release_year: input.releaseYear ?? null,
        note: input.note?.trim() ? input.note.trim().slice(0, 400) : null,
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function deleteWatchGroupPick(pickId: string): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({
    id: `eq.${pickId}`,
  });
  await supabaseRestRequest(
    `watch_group_picks?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function getWatchGroupPicks(groupId: string, currentUserId: string): Promise<WatchGroupPick[]> {
  const token = ensureAuthedToken();
  const pickParams = new URLSearchParams({
    select: 'id,group_id,sender_id,media_type,tmdb_id,title,poster,release_year,note,created_at',
    group_id: `eq.${groupId}`,
    order: 'created_at.desc',
  });
  const rows = await supabaseRestRequest<WatchGroupPickRow[]>(
    `watch_group_picks?${pickParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const picks = Array.isArray(rows) ? rows : [];
  if (picks.length === 0) return [];

  const pickIds = picks.map((p) => p.id);
  const senderIds = [...new Set(picks.map((p) => p.sender_id))];
  const [users, votes, members] = await Promise.all([
    (() => {
      const usersParams = new URLSearchParams({
        select: 'id,name,avatar',
        id: `in.(${senderIds.join(',')})`,
      });
      return supabaseRestRequest<Array<{ id: string; name: string; avatar: string | null }>>(
        `users?${usersParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    })(),
    (() => {
      const votesParams = new URLSearchParams({
        select: 'pick_id,user_id,vote_value',
        pick_id: `in.(${pickIds.join(',')})`,
      });
      return supabaseRestRequest<WatchGroupPickVoteRow[]>(
        `watch_group_pick_votes?${votesParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    })(),
    (() => {
      const membersParams = new URLSearchParams({
        select: 'group_id,user_id,role',
        group_id: `eq.${groupId}`,
      });
      return supabaseRestRequest<WatchGroupMemberRow[]>(
        `watch_group_members?${membersParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    })(),
  ]);
  const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u]));
  const memberCount = Math.max(
    1,
    new Set((Array.isArray(members) ? members : []).map((m) => m.user_id)).size,
  );

  let watches: WatchGroupPickWatchRow[] | null = null;
  try {
    const watchesParams = new URLSearchParams({
      select: 'pick_id,user_id',
      pick_id: `in.(${pickIds.join(',')})`,
    });
    const rows = await supabaseRestRequest<WatchGroupPickWatchRow[]>(
      `watch_group_pick_watches?${watchesParams.toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
    watches = Array.isArray(rows) ? rows : [];
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    const missingTable =
      message.includes('watch_group_pick_watches') &&
      (message.includes('does not exist') || message.includes('schema cache'));
    if (!missingTable) {
      throw err;
    }
  }

  const voteByPick = new Map<string, { up: number; down: number; mine: -1 | 0 | 1 }>();
  for (const vote of Array.isArray(votes) ? votes : []) {
    const entry = voteByPick.get(vote.pick_id) ?? { up: 0, down: 0, mine: 0 };
    if (vote.vote_value === 1) entry.up += 1;
    if (vote.vote_value === -1) entry.down += 1;
    if (vote.user_id === currentUserId) entry.mine = vote.vote_value;
    voteByPick.set(vote.pick_id, entry);
  }

  const watchedByPick = new Map<string, Set<string>>();
  for (const watch of Array.isArray(watches) ? watches : []) {
    const set = watchedByPick.get(watch.pick_id) ?? new Set<string>();
    set.add(watch.user_id);
    watchedByPick.set(watch.pick_id, set);
  }

  return picks
    .map((pick) => {
      const sender = userMap.get(pick.sender_id);
      const vote = voteByPick.get(pick.id) ?? { up: 0, down: 0, mine: 0 };
      const watchedSet = watchedByPick.get(pick.id) ?? new Set<string>();
      return {
        id: pick.id,
        groupId: pick.group_id,
        senderId: pick.sender_id,
        senderName: sender?.name || 'Member',
        senderAvatar: sender?.avatar ?? null,
        mediaType: pick.media_type,
        tmdbId: pick.tmdb_id,
        title: pick.title,
        poster: pick.poster,
        releaseYear: pick.release_year,
        note: pick.note,
        createdAt: pick.created_at,
        upvotes: vote.up,
        downvotes: vote.down,
        score: vote.up - vote.down,
        myVote: vote.mine,
        watchedCount: watchedSet.size,
        memberCount,
        watchedByMe: watchedSet.has(currentUserId),
      } satisfies WatchGroupPick;
    })
    .sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}

export async function voteOnWatchGroupPick(
  pickId: string,
  userId: string,
  voteValue: -1 | 1,
): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({ on_conflict: 'pick_id,user_id' });
  await supabaseRestRequest(
    `watch_group_pick_votes?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        pick_id: pickId,
        user_id: userId,
        vote_value: voteValue,
        updated_at: new Date().toISOString(),
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function clearWatchGroupPickVote(
  pickId: string,
  userId: string,
): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({
    pick_id: `eq.${pickId}`,
    user_id: `eq.${userId}`,
  });
  await supabaseRestRequest(
    `watch_group_pick_votes?${params.toString()}`,
    {
      method: 'DELETE',
      headers: {
        Prefer: 'return=minimal',
      },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function markWatchGroupPickWatched(
  pickId: string,
  userId: string,
): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({ on_conflict: 'pick_id,user_id' });
  await supabaseRestRequest(
    `watch_group_pick_watches?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        pick_id: pickId,
        user_id: userId,
        watched_at: new Date().toISOString(),
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function sendWatchGroupMessage(input: {
  groupId: string;
  senderId: string;
  body: string;
  replyToId?: string | null;
  sharedMovie?: WatchGroupSharedMovie | null;
}): Promise<void> {
  const body = input.body.trim();
  const sharedMovie = input.sharedMovie
    ? {
      mediaType: input.sharedMovie.mediaType,
      tmdbId: input.sharedMovie.tmdbId.trim().slice(0, 64),
      title: input.sharedMovie.title.trim().slice(0, 200),
      poster: input.sharedMovie.poster?.trim().slice(0, 500) ?? null,
      releaseYear: input.sharedMovie.releaseYear ?? null,
    }
    : null;
  if (!body && !sharedMovie) {
    throw new Error('Message cannot be empty.');
  }
  await authedAppRequest('/api/watch-groups/messages/send', {
    groupId: input.groupId,
    body,
    replyToId: input.replyToId ?? null,
    sharedMovie,
  });
}

export async function getWatchGroupMessages(
  groupId: string,
  currentUserId: string,
): Promise<WatchGroupMessage[]> {
  hydrateWatchGroupMessagesOptionalColumnsUnsupported();
  const token = ensureAuthedToken();
  try {
    const makeParams = (mode: 'full' | 'reply-only' | 'legacy') =>
      new URLSearchParams({
        select:
          mode === 'full'
            ? 'id,group_id,sender_id,body,reply_to_id,shared_media_type,shared_tmdb_id,shared_title,shared_poster,shared_release_year,created_at'
            : mode === 'reply-only'
              ? 'id,group_id,sender_id,body,reply_to_id,created_at'
              : 'id,group_id,sender_id,body,created_at',
        group_id: `eq.${groupId}`,
        order: 'created_at.desc',
        limit: '200',
      });

    let rows: WatchGroupMessageRow[] = [];
    if (watchGroupMessagesOptionalColumnsUnsupported) {
      rows = await supabaseRestRequest<WatchGroupMessageRow[]>(
        `watch_group_messages?${makeParams('legacy').toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
    } else {
      try {
        rows = await supabaseRestRequest<WatchGroupMessageRow[]>(
          `watch_group_messages?${makeParams('full').toString()}`,
          { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
          token,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        const missingReplyToColumn =
          message.includes('schema cache') ||
          (message.includes('reply_to_id') && message.includes('column') && message.includes('watch_group_messages'));
        const missingSharedColumns =
          message.includes('schema cache') ||
          ((
            message.includes('shared_media_type') ||
            message.includes('shared_tmdb_id') ||
            message.includes('shared_title') ||
            message.includes('shared_poster') ||
            message.includes('shared_release_year')
          ) && message.includes('column') && message.includes('watch_group_messages'));

        if (!missingReplyToColumn && !missingSharedColumns) {
          throw err;
        }

        if (missingReplyToColumn) {
          markWatchGroupMessagesOptionalColumnsUnsupported();
          rows = await supabaseRestRequest<WatchGroupMessageRow[]>(
            `watch_group_messages?${makeParams('legacy').toString()}`,
            { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
            token,
          );
        } else {
          rows = await supabaseRestRequest<WatchGroupMessageRow[]>(
            `watch_group_messages?${makeParams('reply-only').toString()}`,
            { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
            token,
          );
        }
      }
    }

    const messages = Array.isArray(rows) ? rows : [];
    if (messages.length === 0) return [];

    const senderIds = [...new Set(messages.map((msg) => msg.sender_id))];
    const usersParams = new URLSearchParams({
      select: 'id,name,avatar',
      id: `in.(${senderIds.join(',')})`,
    });
    const users = await supabaseRestRequest<Array<{ id: string; name: string; avatar: string | null }>>(
      `users?${usersParams.toString()}`,
      { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
      token,
    );
    const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [u.id, u]));
    let reactionsByMessage = new Map<string, ChatMessageReaction[]>();
    try {
      const messageIds = messages.map((msg) => msg.id);
      const reactionParams = new URLSearchParams({
        select: 'message_id,user_id,reaction',
        message_id: `in.(${messageIds.join(',')})`,
        limit: '3000',
      });
      const reactionRows = await supabaseRestRequest<MessageReactionRow[]>(
        `watch_group_message_reactions?${reactionParams.toString()}`,
        { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
        token,
      );
      reactionsByMessage = buildReactionSummaryMap(Array.isArray(reactionRows) ? reactionRows : [], currentUserId);
    } catch (err) {
      if (!isMissingWatchGroupMessageReactionsTableError(err)) {
        throw err;
      }
    }

    return messages.reverse().map((msg) => {
      const decodedLegacy = decodeLegacyGroupReplyBody(msg.body);
      const normalizedBody = normalizeLegacyReplyBody(msg.body);
      const sender = userMap.get(msg.sender_id);
      const sharedMovie =
        msg.shared_media_type && msg.shared_tmdb_id && msg.shared_title
          ? {
            mediaType: msg.shared_media_type,
            tmdbId: msg.shared_tmdb_id,
            title: msg.shared_title,
            poster: msg.shared_poster ?? null,
            releaseYear: msg.shared_release_year ?? null,
          }
          : null;
      return {
        id: msg.id,
        groupId: msg.group_id,
        senderId: msg.sender_id,
        senderName: sender?.name || 'Member',
        senderAvatar: sender?.avatar ?? null,
        body: msg.reply_to_id ? normalizedBody : decodedLegacy.body,
        replyToId: msg.reply_to_id ?? decodedLegacy.replyToId ?? null,
        reactions: reactionsByMessage.get(msg.id) ?? [],
        sharedMovie,
        createdAt: msg.created_at,
        mine: msg.sender_id === currentUserId,
      } satisfies WatchGroupMessage;
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    const missingTable =
      message.includes('watch_group_messages') &&
      (message.includes('does not exist') || message.includes('schema cache'));
    if (missingTable) {
      // Keep group watch usable if chat migration is not yet applied.
      return [];
    }
    throw err;
  }
}

export async function toggleWatchGroupMessageReaction(input: {
  messageId: string;
  userId: string;
  reaction: string;
}): Promise<void> {
  const token = ensureAuthedToken();
  const reaction = normalizeReactionValue(input.reaction);
  if (!reaction) {
    throw new Error('Reaction cannot be empty.');
  }

  const existingParams = new URLSearchParams({
    select: 'reaction',
    message_id: `eq.${input.messageId}`,
    user_id: `eq.${input.userId}`,
    limit: '1',
  });
  const existingRows = await supabaseRestRequest<Array<{ reaction: string }>>(
    `watch_group_message_reactions?${existingParams.toString()}`,
    { method: 'GET', timeoutMs: DEFAULT_TIMEOUT_MS },
    token,
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] : undefined;
  const existingReaction = normalizeReactionValue(existing?.reaction ?? '');

  if (existing && existingReaction === reaction) {
    const deleteParams = new URLSearchParams({
      message_id: `eq.${input.messageId}`,
      user_id: `eq.${input.userId}`,
    });
    await supabaseRestRequest(
      `watch_group_message_reactions?${deleteParams.toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
        timeoutMs: DEFAULT_TIMEOUT_MS,
      },
      token,
    );
    return;
  }

  await supabaseRestRequest(
    'watch_group_message_reactions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        message_id: input.messageId,
        user_id: input.userId,
        reaction,
        updated_at: new Date().toISOString(),
      }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}

export async function deleteWatchGroupMessage(input: {
  messageId: string;
  userId: string;
}): Promise<void> {
  const token = ensureAuthedToken();
  const params = new URLSearchParams({
    id: `eq.${input.messageId}`,
    sender_id: `eq.${input.userId}`,
  });
  await supabaseRestRequest(
    `watch_group_messages?${params.toString()}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
      timeoutMs: DEFAULT_TIMEOUT_MS,
    },
    token,
  );
}
