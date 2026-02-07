import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
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
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData?.user ?? null;
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const body = await req.json().catch(() => null) as { recommendations?: unknown } | null;
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

    const { error } = await supabase
      .from('friend_recommendations')
      .insert(sanitized);

    if (error) {
      if (error.code === '23505') {
        return new Response(JSON.stringify({ code: '23505', message: 'DUPLICATE' }), { status: 409, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ message: error.message, code: error.code }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ sent: sanitized.length }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ message: String(err) }), { status: 500, headers: corsHeaders });
  }
});
