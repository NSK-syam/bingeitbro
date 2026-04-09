import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import * as webpush from 'jsr:@negrel/webpush';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey =
  Deno.env.get('SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  '';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const pushSecret = Deno.env.get('PUSH_FUNCTION_SECRET') ?? '';
const expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

type PushRequest = {
  user_ids?: unknown;
  broadcast?: unknown;
  category?: unknown;
  recipient_id?: unknown;
  sender_id?: unknown;
  movie_title?: unknown;
  title?: unknown;
  body?: unknown;
  url?: unknown;
  tag?: unknown;
  icon?: unknown;
  badge?: unknown;
};

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NativePushSubscriptionRow = {
  id: string;
  user_id: string;
  token: string;
};

type NotificationCategory = 'chat' | 'recommendation' | 'schedule' | 'announcement';

type NotificationPreferenceRow = {
  user_id: string;
  chats_enabled: boolean | null;
  recommendations_enabled: boolean | null;
  schedule_enabled: boolean | null;
  announcements_enabled: boolean | null;
};

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function asNotificationCategory(value: unknown): NotificationCategory | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  switch (normalized) {
    case 'chat':
    case 'recommendation':
    case 'schedule':
    case 'announcement':
      return normalized as NotificationCategory;
    default:
      return null;
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function chunkArray<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function buildVapidKeys(): Promise<CryptoKeyPair> {
  const publicBytes = decodeBase64Url(vapidPublicKey);
  const privateBytes = decodeBase64Url(vapidPrivateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error('Invalid VAPID public key format');
  }
  if (privateBytes.length !== 32) {
    throw new Error('Invalid VAPID private key format');
  }
  const x = publicBytes.slice(1, 33);
  const y = publicBytes.slice(33, 65);

  const publicJwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: btoa(String.fromCharCode(...x)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
    y: btoa(String.fromCharCode(...y)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
    ext: true,
  };
  const privateJwk: JsonWebKey = {
    ...publicJwk,
    d: btoa(String.fromCharCode(...privateBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
  };

  return await webpush.importVapidKeys({ publicKey: publicJwk, privateKey: privateJwk });
}

async function resolveLegacySenderName(senderId: string): Promise<string> {
  if (!senderId) return 'Someone';
  const { data: sender } = await supabase
    .from('users')
    .select('name')
    .eq('id', senderId)
    .maybeSingle();
  return sender?.name?.trim() || 'Someone';
}

async function buildPayload(input: PushRequest): Promise<PushPayload> {
  const explicitTitle = asTrimmedString(input.title);
  const explicitBody = asTrimmedString(input.body);
  const explicitUrl = asTrimmedString(input.url) || '/';
  const explicitTag = asTrimmedString(input.tag);
  const explicitIcon = asTrimmedString(input.icon);
  const explicitBadge = asTrimmedString(input.badge);

  if (explicitTitle && explicitBody) {
    return {
      title: explicitTitle,
      body: explicitBody,
      url: explicitUrl,
      ...(explicitTag ? { tag: explicitTag } : {}),
      ...(explicitIcon ? { icon: explicitIcon } : {}),
      ...(explicitBadge ? { badge: explicitBadge } : {}),
    };
  }

  const senderName = await resolveLegacySenderName(asTrimmedString(input.sender_id));
  const movieTitle = asTrimmedString(input.movie_title);
  return {
    title: 'New recommendation',
    body: `${senderName} sent a recommendation${movieTitle ? `: ${movieTitle}` : ''}`,
    url: '/?view=friends',
    tag: 'recommendation',
  };
}

function isCategoryEnabled(row: NotificationPreferenceRow, category: NotificationCategory): boolean {
  switch (category) {
    case 'chat':
      return row.chats_enabled !== false;
    case 'recommendation':
      return row.recommendations_enabled !== false;
    case 'schedule':
      return row.schedule_enabled !== false;
    case 'announcement':
      return row.announcements_enabled !== false;
  }
}

async function filterSubscriptionsByCategory(
  category: NotificationCategory | null,
  targetUserIds: string[],
  subscriptions: SubscriptionRow[],
  nativeSubscriptions: NativePushSubscriptionRow[],
): Promise<{
  subscriptions: SubscriptionRow[];
  nativeSubscriptions: NativePushSubscriptionRow[];
}> {
  if (!category) {
    return { subscriptions, nativeSubscriptions };
  }

  const candidateUserIds = uniqueStrings(
    targetUserIds.length > 0
      ? targetUserIds
      : [
          ...subscriptions.map((subscription) => subscription.user_id),
          ...nativeSubscriptions.map((subscription) => subscription.user_id),
        ],
  );

  if (candidateUserIds.length === 0) {
    return { subscriptions, nativeSubscriptions };
  }

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('user_id,chats_enabled,recommendations_enabled,schedule_enabled,announcements_enabled')
    .in('user_id', candidateUserIds);

  if (error) {
    console.error('[send-recommendation-push] notification preference lookup failed', error.message);
    return { subscriptions, nativeSubscriptions };
  }

  const disabledUserIds = new Set(
    ((data ?? []) as NotificationPreferenceRow[])
      .filter((row) => !isCategoryEnabled(row, category))
      .map((row) => row.user_id),
  );

  if (disabledUserIds.size === 0) {
    return { subscriptions, nativeSubscriptions };
  }

  return {
    subscriptions: subscriptions.filter((subscription) => !disabledUserIds.has(subscription.user_id)),
    nativeSubscriptions: nativeSubscriptions.filter((subscription) => !disabledUserIds.has(subscription.user_id)),
  };
}

async function sendExpoPushNotifications(
  subscriptions: NativePushSubscriptionRow[],
  payload: PushPayload,
): Promise<number> {
  let sent = 0;

  for (const batch of chunkArray(subscriptions, 100)) {
    const messages = batch.map((subscription) => ({
      to: subscription.token,
      title: payload.title,
      body: payload.body,
      data: {
        url: payload.url,
      },
      sound: 'default',
      channelId: 'default',
    }));

    const response = await fetch(expoPushEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      continue;
    }

    const json = (await response.json().catch(() => null)) as {
      data?: Array<{ status?: string; details?: { error?: string } | null }>;
    } | null;
    const results = Array.isArray(json?.data) ? json.data : [];

    for (const [index, result] of results.entries()) {
      if (result?.status === 'ok') {
        sent += 1;
        continue;
      }

      if (result?.details?.error === 'DeviceNotRegistered') {
        const subscription = batch[index];
        if (subscription) {
          await supabase.from('native_push_subscriptions').delete().eq('id', subscription.id);
        }
      }
    }
  }

  return sent;
}

serve(async (req) => {
  try {
    const secret = req.headers.get('x-push-secret') || '';
    if (!pushSecret || secret !== pushSecret) {
      return new Response('Unauthorized', { status: 401 });
    }

    const input = (await req.json().catch(() => null)) as PushRequest | null;
    if (!input) {
      return new Response('Invalid JSON body', { status: 400 });
    }

    const broadcast = input.broadcast === true;
    const targetUserIds = uniqueStrings([
      ...((Array.isArray(input.user_ids) ? input.user_ids : [])
        .filter((value): value is string => typeof value === 'string')),
      asTrimmedString(input.recipient_id),
    ]);

    if (!broadcast && targetUserIds.length === 0) {
      return new Response('Missing user_ids or recipient_id', { status: 400 });
    }

    const payload = await buildPayload(input);
    const category = asNotificationCategory(input.category);

    let subscriptionsQuery = supabase
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth');
    let nativeSubscriptionsQuery = supabase
      .from('native_push_subscriptions')
      .select('id, user_id, token');
    if (!broadcast) {
      subscriptionsQuery = subscriptionsQuery.in('user_id', targetUserIds);
      nativeSubscriptionsQuery = nativeSubscriptionsQuery.in('user_id', targetUserIds);
    }

    const [
      { data: subscriptions },
      { data: nativeSubscriptions, error: nativeSubscriptionsError },
    ] = await Promise.all([
      subscriptionsQuery,
      nativeSubscriptionsQuery,
    ]);
    if (nativeSubscriptionsError) {
      console.error('[send-recommendation-push] native push lookup failed', nativeSubscriptionsError.message);
    }

    const filteredSubscriptions = Array.isArray(subscriptions) ? (subscriptions as SubscriptionRow[]) : [];
    const filteredNativeSubscriptions = nativeSubscriptionsError
      ? []
      : Array.isArray(nativeSubscriptions)
        ? (nativeSubscriptions as NativePushSubscriptionRow[])
        : [];
    const filteredByCategory = await filterSubscriptionsByCategory(
      category,
      targetUserIds,
      filteredSubscriptions,
      filteredNativeSubscriptions,
    );
    const hasWebSubscriptions = filteredByCategory.subscriptions.length > 0;
    const hasNativeSubscriptions = filteredByCategory.nativeSubscriptions.length > 0;

    if (!hasWebSubscriptions && !hasNativeSubscriptions) {
      return new Response('No subscriptions', { status: 200 });
    }

    let sent = 0;
    if (hasWebSubscriptions) {
      const encodedPayload = JSON.stringify(payload);
      const vapidKeys = await buildVapidKeys();
      const appServer = await webpush.ApplicationServer.new({
        contactInformation: 'mailto:hello@bingeitbro.com',
        vapidKeys,
      });

      for (const sub of filteredByCategory.subscriptions) {
        try {
          const subscriber = appServer.subscribe({
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          });
          await subscriber.pushTextMessage(encodedPayload, {});
          sent += 1;
        } catch (err) {
          if (err instanceof webpush.PushMessageError && err.isGone()) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }

    if (hasNativeSubscriptions) {
      sent += await sendExpoPushNotifications(filteredByCategory.nativeSubscriptions, payload);
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});
