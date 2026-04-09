import { fetchWithTimeoutRetry } from '@/lib/fetch-with-retry';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const pushSecret = (process.env.PUSH_FUNCTION_SECRET ?? '').trim();
const PUSH_FUNCTION_PATH = '/functions/v1/send-recommendation-push';
const PUSH_FETCH_OPTIONS = { timeoutMs: 9000, retries: 1, retryDelayMs: 300 } as const;

export type PushDispatchPayload = {
  userIds?: string[];
  broadcast?: boolean;
  category?: 'chat' | 'recommendation' | 'schedule' | 'announcement';
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type PushDispatchResult = {
  ok: boolean;
  skipped?: boolean;
  message?: string;
};

export async function dispatchPushNotification(
  payload: PushDispatchPayload,
): Promise<PushDispatchResult> {
  const userIds = [...new Set((payload.userIds ?? []).map((value) => value.trim()).filter(Boolean))];

  if (!payload.broadcast && userIds.length === 0) {
    return { ok: false, skipped: true, message: 'No recipients to notify.' };
  }
  if (!supabaseUrl || !pushSecret) {
    return { ok: false, skipped: true, message: 'Push notifications are not configured.' };
  }

  const response = await fetchWithTimeoutRetry(`${supabaseUrl}${PUSH_FUNCTION_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-push-secret': pushSecret,
    },
    body: JSON.stringify({
      user_ids: userIds,
      broadcast: Boolean(payload.broadcast),
      category: payload.category?.trim() || undefined,
      title: payload.title.trim().slice(0, 120),
      body: payload.body.trim().slice(0, 240),
      url: (payload.url ?? '/').trim() || '/',
      tag: payload.tag?.trim().slice(0, 120) || undefined,
    }),
  }, PUSH_FETCH_OPTIONS);

  if (!response.ok) {
    const message = (await response.text().catch(() => '')).trim() || response.statusText;
    return { ok: false, message };
  }

  return { ok: true };
}
