import { NextResponse } from 'next/server';
import { getAuthedRequestUser } from '@/lib/server/request-auth';
import {
  blockUser,
  createSupabaseAdminClient,
  getBlockRelationship,
  getBlockedUserIdSet,
  unblockUser,
} from '@/lib/server/user-blocks';

export const runtime = 'nodejs';

type RequestBody = {
  targetUserId?: unknown;
};

function sanitizeUserId(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

export async function GET(request: Request) {
  try {
    const authedUser = await getAuthedRequestUser(request);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();
    const targetUserId = sanitizeUserId(new URL(request.url).searchParams.get('targetUserId'));
    const blockedUserIds = [...(await getBlockedUserIdSet(admin, authedUser.id))];

    if (!targetUserId || targetUserId === authedUser.id) {
      return NextResponse.json(
        {
          blockedUserIds,
          blockedByCurrentUser: false,
          blockedByTargetUser: false,
        },
        { status: 200 },
      );
    }

    const relationship = await getBlockRelationship(admin, authedUser.id, targetUserId);
    return NextResponse.json(
      {
        blockedUserIds,
        ...relationship,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load blocked users.';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authedUser = await getAuthedRequestUser(request);
    if (!authedUser?.id) {
      return NextResponse.json({ message: 'Not authenticated.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const targetUserId = sanitizeUserId(body?.targetUserId);
    if (!targetUserId) {
      return NextResponse.json({ message: 'targetUserId is required.' }, { status: 400 });
    }
    if (targetUserId === authedUser.id) {
      return NextResponse.json({ message: 'You cannot block yourself.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const blockedUserIds = await blockUser(admin, authedUser.id, targetUserId);
    return NextResponse.json({ ok: true, blockedUserIds }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to block user.';
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
    const targetUserId = sanitizeUserId(body?.targetUserId);
    if (!targetUserId) {
      return NextResponse.json({ message: 'targetUserId is required.' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const blockedUserIds = await unblockUser(admin, authedUser.id, targetUserId);
    return NextResponse.json({ ok: true, blockedUserIds }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to unblock user.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
