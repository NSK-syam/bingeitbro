import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  normalizeNotificationPreferencesPatch,
  notificationPreferenceFields,
  notificationPreferencesToRowPatch,
  rowToNotificationPreferences,
  type NotificationPreferenceRow,
} from '@/lib/notification-preferences';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAuthedRequestUser, getBearerToken } from '@/lib/server/request-auth';

export const runtime = 'nodejs';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

function createAuthedSupabase(token: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveNotificationPreferencesClient(request: Request) {
  const authedUser = await getAuthedRequestUser(request);
  const token = getBearerToken(request);

  if (authedUser?.id && token) {
    return {
      userId: authedUser.id,
      supabase: createAuthedSupabase(token),
    };
  }

  const cookieSupabase = await createServerSupabaseClient();
  const { data, error } = await cookieSupabase.auth.getUser();
  if (error || !data.user?.id) {
    return null;
  }

  return {
    userId: data.user.id,
    supabase: cookieSupabase,
  };
}

export async function GET(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
    }

    const clientContext = await resolveNotificationPreferencesClient(request);
    if (!clientContext?.userId) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const { data, error } = await clientContext.supabase
      .from('notification_preferences')
      .select(notificationPreferenceFields.join(','))
      .eq('user_id', clientContext.userId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      preferences: rowToNotificationPreferences((data ?? null) as Partial<NotificationPreferenceRow> | null),
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load notification preferences.';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
    }

    const clientContext = await resolveNotificationPreferencesClient(request);
    if (!clientContext?.userId) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { preferences?: unknown } | null;
    const patch = normalizeNotificationPreferencesPatch(body?.preferences);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ message: 'No notification preference changes were provided.' }, { status: 400 });
    }

    const { data, error } = await clientContext.supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: clientContext.userId,
          ...notificationPreferencesToRowPatch(patch),
        },
        { onConflict: 'user_id' },
      )
      .select(notificationPreferenceFields.join(','))
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({
      preferences: rowToNotificationPreferences(data as Partial<NotificationPreferenceRow> | null),
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save notification preferences.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
