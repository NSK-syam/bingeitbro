import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRandomMovieAvatar } from '@/lib/avatar-options';

export const runtime = 'nodejs';

type SignupBody = {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  username?: unknown;
  birthdate?: unknown; // YYYY-MM-DD
  captchaToken?: unknown;
};

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/i;
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'guerrillamail.com',
  'maildrop.cc',
  'mailinator.com',
  'mintemail.com',
  'sharklasers.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
]);
const SIGNUP_IP_LIMIT = 5;
const SIGNUP_IP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_EMAIL_LIMIT = 4;
const SIGNUP_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_EMAIL_COOLDOWN_MS = 90 * 1000;

type FixedWindowBucket = {
  count: number;
  resetAt: number;
};

const signupStoresGlobal = globalThis as typeof globalThis & {
  __bibSignupIpRateStore?: Map<string, FixedWindowBucket>;
  __bibSignupEmailRateStore?: Map<string, FixedWindowBucket>;
  __bibSignupEmailCooldownStore?: Map<string, number>;
};

const signupIpRateStore = signupStoresGlobal.__bibSignupIpRateStore ?? new Map<string, FixedWindowBucket>();
const signupEmailRateStore = signupStoresGlobal.__bibSignupEmailRateStore ?? new Map<string, FixedWindowBucket>();
const signupEmailCooldownStore = signupStoresGlobal.__bibSignupEmailCooldownStore ?? new Map<string, number>();
signupStoresGlobal.__bibSignupIpRateStore = signupIpRateStore;
signupStoresGlobal.__bibSignupEmailRateStore = signupEmailRateStore;
signupStoresGlobal.__bibSignupEmailCooldownStore = signupEmailCooldownStore;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function getClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const ip = xff.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return 'unknown';
}

function consumeFixedWindow(
  store: Map<string, FixedWindowBucket>,
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const current = store.get(key);
  const bucket =
    !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
  store.set(key, bucket);

  if (store.size > 5000) {
    for (const [k, v] of store) {
      if (v.resetAt <= now) store.delete(k);
      if (store.size <= 3000) break;
    }
  }

  if (bucket.count <= limit) return { allowed: true, retryAfterSec: 0 };
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

function getEmailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase();
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
  const turnstileSecret = (process.env.TURNSTILE_SECRET_KEY || '').trim();

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
  const captchaToken = isNonEmptyString(body.captchaToken) ? body.captchaToken.trim() : '';
  const clientIp = getClientIp(req);

  const ipLimit = consumeFixedWindow(signupIpRateStore, clientIp, SIGNUP_IP_LIMIT, SIGNUP_IP_WINDOW_MS);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: `Too many signup attempts from this network. Try again in ${ipLimit.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec) } },
    );
  }

  if (!email || !password || !name || !username) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 });
  }
  const emailDomain = getEmailDomain(email);
  if (emailDomain && DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
    return NextResponse.json({ error: 'Temporary/disposable emails are not allowed.' }, { status: 400 });
  }
  const emailLimit = consumeFixedWindow(signupEmailRateStore, email, SIGNUP_EMAIL_LIMIT, SIGNUP_EMAIL_WINDOW_MS);
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: `Too many signup attempts for this email. Try again in ${emailLimit.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfterSec) } },
    );
  }
  const now = Date.now();
  const nextAllowed = signupEmailCooldownStore.get(email) || 0;
  if (nextAllowed > now) {
    const retryAfterSec = Math.max(1, Math.ceil((nextAllowed - now) / 1000));
    return NextResponse.json(
      { error: `Please wait ${retryAfterSec}s before trying again.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
  }
  if (username.length < 3) {
    return NextResponse.json({ error: 'Username must be at least 3 characters.' }, { status: 400 });
  }
  if (username.length > 24) {
    return NextResponse.json({ error: 'Username must be 24 characters or fewer.' }, { status: 400 });
  }
  if (birthdate && !isValidBirthdate(birthdate)) {
    return NextResponse.json({ error: 'Invalid birthdate.' }, { status: 400 });
  }

  if (turnstileSecret) {
    if (!captchaToken) {
      return NextResponse.json({ error: 'Please complete verification challenge.' }, { status: 400 });
    }
    try {
      const payload = new URLSearchParams();
      payload.set('secret', turnstileSecret);
      payload.set('response', captchaToken);
      if (clientIp !== 'unknown') payload.set('remoteip', clientIp);

      const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString(),
      });

      type TurnstileVerifyResponse = {
        success?: boolean;
      };
      const verifyJson = (await verifyRes.json().catch(() => ({}))) as TurnstileVerifyResponse;
      if (!verifyRes.ok || !verifyJson?.success) {
        return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Verification service unavailable. Please retry.' }, { status: 503 });
    }
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
  signupEmailCooldownStore.set(email, Date.now() + SIGNUP_EMAIL_COOLDOWN_MS);

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
