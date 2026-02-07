import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const supabaseAnonKey = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
const rawServiceKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  '';
const supabaseServiceKey = rawServiceKey.trim();
const serviceKeyIsJwt = supabaseServiceKey.split('.').length === 3;
const allowedOrigins = new Set([
  'https://bingeitbro.com',
  'https://www.bingeitbro.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const MAX_BODY_BYTES = 100_000; // 100KB - avoid OOM from huge payloads (e.g. base64 posters)

const buildCorsHeaders = (origin: string | null) => {
  const resolved = origin && allowedOrigins.has(origin) ? origin : 'https://bingeitbro.com';
  return {
    'Access-Control-Allow-Origin': resolved,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};

/** Read body up to maxBytes to avoid OOM on large payloads. */
async function readBodyCapped(req: Request, maxBytes: number): Promise<string> {
  const contentLength = req.headers.get('Content-Length');
  if (contentLength !== null) {
    const len = parseInt(contentLength, 10);
    if (!Number.isNaN(len) && len > maxBytes) {
      throw new Error('Payload too large');
    }
  }
  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.length + total > maxBytes) {
        reader.cancel();
        throw new Error('Payload too large');
      }
      chunks.push(value);
      total += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(out);
}

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response('Supabase not configured', { status: 500, headers: corsHeaders });
  }

  try {
    let bodyText: string;
    try {
      bodyText = await readBodyCapped(req, MAX_BODY_BYTES);
    } catch (e) {
      if (e instanceof Error && e.message === 'Payload too large') {
        return new Response(JSON.stringify({ message: 'Payload too large' }), { status: 413, headers: corsHeaders });
      }
      throw e;
    }
    let body: { access_token?: string; recommendations?: unknown } | null = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = null;
    }

    const accessToken = (body?.access_token ?? '').trim();
    if (!accessToken) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: supabaseAnonKey,
      },
    });

    if (!authResponse.ok) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }
    const user = await authResponse.json().catch(() => null) as { id?: string } | null;
    if (!user?.id) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const raw = Array.isArray(body?.recommendations) ? body!.recommendations : [];
    type Rec = {
      sender_id: string;
      recipient_id: string;
      recommendation_id: string | null;
      tmdb_id: number | null;
      movie_title: string;
      movie_poster: string;
      movie_year: number | null;
      personal_message: string;
    };

    const toInsert: Rec[] = [];
    for (let i = 0; i < Math.min(raw.length, 50); i++) {
      const rec = raw[i];
      if (!rec || typeof rec !== 'object') continue;
      const r = rec as Record<string, unknown>;
      const sender_id = String(r.sender_id ?? '').trim();
      const recipient_id = String(r.recipient_id ?? '').trim();
      const movie_title = String(r.movie_title ?? '').trim().slice(0, 200);
      if (sender_id !== user.id || !recipient_id || !movie_title) continue;
      const poster = String(r.movie_poster ?? '').trim().slice(0, 500);
      toInsert.push({
        sender_id,
        recipient_id,
        recommendation_id: r.recommendation_id != null ? String(r.recommendation_id) : null,
        tmdb_id: typeof r.tmdb_id === 'number' ? r.tmdb_id : null,
        movie_title,
        movie_poster: poster.startsWith('https://image.tmdb.org/') ? poster : '',
        movie_year: typeof r.movie_year === 'number' ? r.movie_year : null,
        personal_message: String(r.personal_message ?? '').trim().slice(0, 200),
      });
    }

    if (toInsert.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    let allowed: Rec[] = toInsert;
    if (serviceKeyIsJwt) {
      const recipientIds = [...new Set(toInsert.map((rec) => rec.recipient_id))];
      if (recipientIds.length > 0) {
        const friendsResponse = await fetch(
          `${supabaseUrl}/rest/v1/friends?select=friend_id&user_id=eq.${user.id}&friend_id=in.(${recipientIds.join(',')})`,
          {
            method: 'GET',
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
          },
        );

        if (friendsResponse.ok) {
          const friends = await friendsResponse.json().catch(() => []) as { friend_id?: string }[];
          const allowedIds = new Set(friends.map((row) => row.friend_id).filter(Boolean) as string[]);
          allowed = toInsert.filter((rec) => allowedIds.has(rec.recipient_id));
        }
      }
    }

    if (allowed.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    const insertAuth = serviceKeyIsJwt ? `Bearer ${supabaseServiceKey}` : `Bearer ${accessToken}`;

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/friend_recommendations`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: insertAuth,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(allowed),
    });

    if (!insertResponse.ok) {
      const text = await insertResponse.text();
      console.error('Friend recommendation insert failed', insertResponse.status, text);
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      const code =
        typeof data === 'object' && data !== null && 'code' in data
          ? String((data as { code?: string }).code)
          : '';
      const message =
        typeof data === 'object' && data !== null && 'message' in data
          ? String((data as { message?: string }).message)
          : insertResponse.statusText;
      if (code === '23505') {
        return new Response(JSON.stringify({ code: '23505', message: 'DUPLICATE' }), { status: 409, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ message, code }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ sent: allowed.length }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ message: String(err) }), { status: 500, headers: corsHeaders });
  }
});
