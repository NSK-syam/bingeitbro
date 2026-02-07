import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabaseServiceKey =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  Deno.env.get('SERVICE_ROLE_KEY') ??
  '';
const allowedOrigins = new Set([
  'https://bingeitbro.com',
  'https://www.bingeitbro.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

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
    const bodyText = await req.text();
    let body: { access_token?: string; recommendations?: unknown } | null = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = null;
    }

    const accessToken = body?.access_token ?? '';
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

    const recommendations = raw
      .filter((rec) => rec && typeof rec === 'object')
      .map((rec) => rec as {
        sender_id?: string;
        recipient_id?: string;
        recommendation_id?: string | null;
        tmdb_id?: number | null;
        movie_title?: string;
        movie_poster?: string;
        movie_year?: number | null;
        personal_message?: string;
      })
      .map((rec) => ({
        sender_id: rec.sender_id ?? '',
        recipient_id: rec.recipient_id ?? '',
        recommendation_id: rec.recommendation_id ?? null,
        tmdb_id: typeof rec.tmdb_id === 'number' ? rec.tmdb_id : null,
        movie_title: (rec.movie_title ?? '').trim().slice(0, 200),
        movie_poster: (rec.movie_poster ?? '').trim().slice(0, 500),
        movie_year: typeof rec.movie_year === 'number' ? rec.movie_year : null,
        personal_message: (rec.personal_message ?? '').trim().slice(0, 200),
      }))
      .filter((rec) => rec.sender_id && rec.recipient_id && rec.movie_title)
      .slice(0, 50);

    if (recommendations.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    // Only allow sending as the logged-in user
    const filtered = recommendations.filter((rec) => rec.sender_id === user.id);
    if (filtered.length === 0) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    // Remove large poster values just in case
    const sanitized = filtered.map((rec) => ({
      ...rec,
      movie_poster: rec.movie_poster.startsWith('https://image.tmdb.org/') ? rec.movie_poster : '',
    }));

    let toInsert = sanitized;

    if (supabaseServiceKey) {
      const recipientIds = [...new Set(sanitized.map((rec) => rec.recipient_id))];
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
          const allowed = new Set(friends.map((row) => row.friend_id).filter(Boolean) as string[]);
          toInsert = sanitized.filter((rec) => allowed.has(rec.recipient_id));
        }
      }
    }

    if (toInsert.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200, headers: corsHeaders });
    }

    const insertAuth = supabaseServiceKey ? `Bearer ${supabaseServiceKey}` : `Bearer ${accessToken}`;

    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/friend_recommendations`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: insertAuth,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(toInsert),
    });

    if (!insertResponse.ok) {
      const text = await insertResponse.text();
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

    return new Response(JSON.stringify({ sent: toInsert.length }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ message: String(err) }), { status: 500, headers: corsHeaders });
  }
});
