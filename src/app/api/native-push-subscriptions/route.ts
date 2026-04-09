import { NextResponse } from 'next/server';
import { getAuthedRequestUser } from '@/lib/server/request-auth';
import { createSupabaseAdminClient } from '@/lib/server/user-blocks';

export const runtime = 'nodejs';

type RequestBody = {
  token?: unknown;
  platform?: unknown;
  provider?: unknown;
};

function trimString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function sanitizePlatform(value: unknown): 'ios' | 'android' | null {
  const normalized = trimString(value, 16).toLowerCase();
  if (normalized === 'ios' || normalized === 'android') {
    return normalized;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const authedUser = await getAuthedRequestUser(request);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const token = trimString(body?.token, 255);
    const platform = sanitizePlatform(body?.platform);
    const provider = trimString(body?.provider, 32) || 'expo';

    if (!token || !platform) {
      return NextResponse.json({ message: 'token and platform are required.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from('native_push_subscriptions')
      .upsert(
        {
          user_id: authedUser.id,
          token,
          provider,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      );

    if (error) {
      return NextResponse.json({ message: error.message || 'Failed to save native push token.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save native push token.';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authedUser = await getAuthedRequestUser(request);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const token = trimString(body?.token, 255);
    if (!token) {
      return NextResponse.json({ message: 'token is required.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from('native_push_subscriptions')
      .delete()
      .eq('user_id', authedUser.id)
      .eq('token', token);

    if (error) {
      return NextResponse.json({ message: error.message || 'Failed to remove native push token.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove native push token.';
    return NextResponse.json({ message }, { status: 500 });
  }
}