import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

export async function GET(req: Request) {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    ''
  ).trim();
  const anonKey =
    (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
    ).trim();
  const serviceRole =
    (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SERVICE_ROLE ||
      ''
    ).trim();

  if (!url || (!serviceRole && !anonKey)) {
    return NextResponse.json({ available: false }, { status: 200 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('username') || '';
  const username = normalizeUsername(raw);

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({ available: false }, { status: 200 });
  }

  const client = createClient(url, serviceRole || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Prefer RPC if available (bypasses RLS safely).
  try {
    const { data, error } = await client.rpc('check_username_available', {
      username,
    });
    if (!error && typeof data === 'boolean') {
      return NextResponse.json({ available: data }, { status: 200 });
    }
  } catch {
    // ignore and fallback
  }

  // Fallback: direct lookup.
  const { data, error } = await client
    .from('users')
    .select('id')
    .eq('username', username)
    .limit(1);

  if (error) {
    // Don't block signup because of a transient username check failure.
    return NextResponse.json({ available: true }, { status: 200 });
  }

  const taken = Array.isArray(data) && data.length > 0;
  return NextResponse.json({ available: !taken }, { status: 200 });
}

