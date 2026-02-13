import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRandomMovieAvatar } from '@/lib/avatar-options';

type SignupBody = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  username?: unknown;
  birthdate?: unknown; // YYYY-MM-DD
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function isValidBirthdate(birthdate: string) {
  // YYYY-MM-DD only
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return false;
  const [y, m, d] = birthdate.split('-').map((n) => Number(n));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (y < 1900 || y > new Date().getFullYear()) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Ensure no overflow (e.g. Feb 31)
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export async function POST(req: Request) {
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
    const missing: string[] = [];
    if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)');
    if (!serviceRole && !anonKey) {
      missing.push('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    return NextResponse.json(
      { error: `Server is missing ${missing.join(' and ')}.` },
      { status: 500 },
    );
  }

  let body: SignupBody;
  try {
    body = (await req.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const email = isNonEmptyString(body.email) ? normalizeEmail(body.email) : '';
  const password = isNonEmptyString(body.password) ? body.password : '';
  const name = isNonEmptyString(body.name) ? body.name.trim() : '';
  const username = isNonEmptyString(body.username) ? normalizeUsername(body.username) : '';
  const birthdate = isNonEmptyString(body.birthdate) ? body.birthdate.trim() : '';

  if (!email || !password || !name || !username) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }
  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  }
  if (birthdate && !isValidBirthdate(birthdate)) {
    return NextResponse.json({ error: 'Invalid birthdate.' }, { status: 400 });
  }

  const lookupClient = createClient(url, serviceRole || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Username check
  const { data: existingUsername, error: usernameErr } = await lookupClient
    .from('users')
    .select('id')
    .eq('username', username)
    .limit(1);
  if (usernameErr) {
    return NextResponse.json({ error: 'Unable to validate username.' }, { status: 500 });
  }
  if (Array.isArray(existingUsername) && existingUsername.length > 0) {
    return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
  }

  // Email check (profiles table)
  const { data: existingEmail, error: emailErr } = await lookupClient
    .from('users')
    .select('id')
    .eq('email', email)
    .limit(1);
  if (emailErr) {
    return NextResponse.json({ error: 'Unable to validate email.' }, { status: 500 });
  }
  if (Array.isArray(existingEmail) && existingEmail.length > 0) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  const profilePayload = {
    email,
    name,
    username,
    avatar: getRandomMovieAvatar(),
    birthdate: birthdate || null,
  };

  if (serviceRole) {
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create auth user with email_confirm=true (no email confirmation flow)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, username },
    });

    if (createErr || !created?.user?.id) {
      const message = createErr?.message || 'Unable to create user.';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const userId = created.user.id;
    const { error: insertErr } = await admin.from('users').insert({
      id: userId,
      ...profilePayload,
    });

    if (insertErr) {
      // Roll back auth user to avoid orphaned auth accounts.
      await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: 'Unable to create user profile.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Fallback path when service-role key is unavailable:
  // Use anon signup and insert profile with the returned access token.
  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: created, error: createErr } = await anon.auth.signUp({
    email,
    password,
    options: {
      data: { name, username, birthdate: birthdate || null },
    },
  });

  if (createErr || !created?.user?.id) {
    const message = createErr?.message || 'Unable to create user.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const userId = created.user.id;
  const accessToken = created.session?.access_token;
  if (!accessToken) {
    // Session can be null when email confirmation is required.
    return NextResponse.json(
      { ok: true, needsEmailConfirmation: true },
      { status: 200 },
    );
  }

  const authed = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: insertErr } = await authed.from('users').insert({
    id: userId,
    ...profilePayload,
  });

  if (insertErr) {
    return NextResponse.json({ error: 'Unable to create user profile.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
