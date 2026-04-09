import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').trim();
const serviceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE ??
  process.env.SERVICE_ROLE_KEY ??
  ''
).trim();

const BLOCKED_USER_IDS_KEY = 'blocked_user_ids';

export type UserBlockCache = Map<string, Set<string>>;

function sanitizeUserId(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

export function createSupabaseAdminClient(): SupabaseClient {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('User blocking is unavailable right now.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function parseBlockedUserIds(metadata: Record<string, unknown> | null | undefined): string[] {
  const raw = metadata?.[BLOCKED_USER_IDS_KEY];
  if (!Array.isArray(raw)) return [];

  const unique = new Set<string>();
  for (const value of raw) {
    const sanitized = sanitizeUserId(value);
    if (sanitized) {
      unique.add(sanitized);
    }
  }

  return [...unique];
}

async function getAuthUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ user_metadata?: Record<string, unknown> | null } | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(error.message || 'Failed to load user block settings.');
  }
  return data.user ?? null;
}

export async function getBlockedUserIdSet(
  admin: SupabaseClient,
  userId: string,
  cache?: UserBlockCache,
): Promise<Set<string>> {
  const cached = cache?.get(userId);
  if (cached) return cached;

  const authUser = await getAuthUser(admin, userId);
  const blocked = new Set(parseBlockedUserIds(authUser?.user_metadata ?? null));
  cache?.set(userId, blocked);
  return blocked;
}

export async function getBlockRelationship(
  admin: SupabaseClient,
  currentUserId: string,
  targetUserId: string,
  cache?: UserBlockCache,
): Promise<{ blockedByCurrentUser: boolean; blockedByTargetUser: boolean }> {
  const [currentBlockedIds, targetBlockedIds] = await Promise.all([
    getBlockedUserIdSet(admin, currentUserId, cache),
    getBlockedUserIdSet(admin, targetUserId, cache),
  ]);

  return {
    blockedByCurrentUser: currentBlockedIds.has(targetUserId),
    blockedByTargetUser: targetBlockedIds.has(currentUserId),
  };
}

async function setBlockedUserIds(
  admin: SupabaseClient,
  userId: string,
  nextBlockedUserIds: Iterable<string>,
  cache?: UserBlockCache,
): Promise<string[]> {
  const authUser = await getAuthUser(admin, userId);
  if (!authUser) {
    throw new Error('User not found.');
  }

  const existingMetadata =
    authUser.user_metadata && typeof authUser.user_metadata === 'object'
      ? authUser.user_metadata
      : {};

  const sanitizedIds = [...new Set([...nextBlockedUserIds].map((value) => sanitizeUserId(value)).filter(Boolean))];

  const { error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...existingMetadata,
      [BLOCKED_USER_IDS_KEY]: sanitizedIds,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to update blocked users.');
  }

  cache?.set(userId, new Set(sanitizedIds));
  return sanitizedIds;
}

async function deleteFriendship(admin: SupabaseClient, userId: string, friendId: string): Promise<void> {
  const { error } = await admin
    .from('friends')
    .delete()
    .eq('user_id', userId)
    .eq('friend_id', friendId);

  if (error) {
    throw new Error(error.message || 'Failed to update friendship after blocking.');
  }
}

export async function blockUser(
  admin: SupabaseClient,
  currentUserId: string,
  targetUserId: string,
  cache?: UserBlockCache,
): Promise<string[]> {
  if (currentUserId === targetUserId) {
    throw new Error('You cannot block yourself.');
  }

  const blocked = await getBlockedUserIdSet(admin, currentUserId, cache);
  blocked.add(targetUserId);

  const nextBlockedUserIds = await setBlockedUserIds(admin, currentUserId, blocked, cache);
  await Promise.all([
    deleteFriendship(admin, currentUserId, targetUserId),
    deleteFriendship(admin, targetUserId, currentUserId),
  ]);

  return nextBlockedUserIds;
}

export async function unblockUser(
  admin: SupabaseClient,
  currentUserId: string,
  targetUserId: string,
  cache?: UserBlockCache,
): Promise<string[]> {
  const blocked = await getBlockedUserIdSet(admin, currentUserId, cache);
  blocked.delete(targetUserId);
  return setBlockedUserIds(admin, currentUserId, blocked, cache);
}
