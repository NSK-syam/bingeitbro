import { NextResponse } from 'next/server';
import { dispatchPushNotification } from '@/lib/server/push-dispatch';
import { getAuthedRequestUser } from '@/lib/server/request-auth';

export const runtime = 'nodejs';

const adminUserIds = (process.env.ADMIN_USER_IDS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

type RequestBody = {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  userIds?: unknown;
};

function trimString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isAdminUser(user: { id: string; email: string | null }): boolean {
  if (adminUserIds.includes(user.id)) return true;
  return Boolean(user.email && adminEmails.includes(user.email.toLowerCase()));
}

export async function POST(request: Request) {
  try {
    const authedUser = await getAuthedRequestUser(request);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }
    if (!isAdminUser(authedUser)) {
      return NextResponse.json({ message: 'Admin access required.' }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const title = trimString(body?.title, 120);
    const messageBody = trimString(body?.body, 240);
    const url = trimString(body?.url, 240) || '/movies';
    const userIds = Array.isArray(body?.userIds)
      ? [...new Set(body!.userIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
      : [];

    if (!title || !messageBody) {
      return NextResponse.json({ message: 'title and body are required.' }, { status: 400 });
    }

    const result = await dispatchPushNotification({
      userIds,
      broadcast: userIds.length === 0,
      category: 'announcement',
      title,
      body: messageBody,
      url,
      tag: `admin-broadcast-${Date.now()}`,
    });

    if (!result.ok && !result.skipped) {
      return NextResponse.json({ message: result.message || 'Push dispatch failed.' }, { status: 500 });
    }
    if (!result.ok && result.skipped) {
      return NextResponse.json({ message: result.message || 'Push notifications are not configured.' }, { status: 503 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send admin push notification.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
