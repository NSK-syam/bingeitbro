import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import * as webpush from 'jsr:@negrel/webpush';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey =
  Deno.env.get('SERVICE_ROLE_KEY') ??
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  '';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const pushSecret = Deno.env.get('PUSH_FUNCTION_SECRET') ?? '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function buildVapidKeys(): Promise<CryptoKeyPair> {
  const publicBytes = decodeBase64Url(vapidPublicKey);
  const privateBytes = decodeBase64Url(vapidPrivateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error('Invalid VAPID public key format');
  }
  if (privateBytes.length !== 32) {
    throw new Error('Invalid VAPID private key format');
  }
  const x = publicBytes.slice(1, 33);
  const y = publicBytes.slice(33, 65);

  const publicJwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: btoa(String.fromCharCode(...x)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
    y: btoa(String.fromCharCode(...y)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
    ext: true,
  };
  const privateJwk: JsonWebKey = {
    ...publicJwk,
    d: btoa(String.fromCharCode(...privateBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''),
  };

  return await webpush.importVapidKeys({ publicKey: publicJwk, privateKey: privateJwk });
}

serve(async (req) => {
  try {
    const secret = req.headers.get('x-push-secret') || '';
    if (!pushSecret || secret !== pushSecret) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { recipient_id, sender_id, movie_title } = await req.json();
    if (!recipient_id || !sender_id) {
      return new Response('Missing recipient_id or sender_id', { status: 400 });
    }

    const { data: sender } = await supabase
      .from('users')
      .select('name')
      .eq('id', sender_id)
      .single();

    const senderName = sender?.name || 'Someone';

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', recipient_id);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response('No subscriptions', { status: 200 });
    }

    const payload = JSON.stringify({
      title: 'New recommendation',
      body: `${senderName} sent a recommendation${movie_title ? `: ${movie_title}` : ''}`,
      url: '/?view=friends',
    });

    const vapidKeys = await buildVapidKeys();
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: 'mailto:hello@bingeitbro.com',
      vapidKeys,
    });

    for (const sub of subscriptions) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        });
        await subscriber.pushTextMessage(payload, {});
      } catch (err) {
        if (err instanceof webpush.PushMessageError && err.isGone()) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});
