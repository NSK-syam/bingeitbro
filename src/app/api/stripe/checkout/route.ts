import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || 'https://bingeitbro.com';

type CheckoutBody = {
  priceId?: string;
  successPath?: string;
  cancelPath?: string;
  clientReferenceId?: string;
};

/**
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout session. Use for one-time payments or subscriptions.
 * Body: { priceId, successPath?, cancelPath?, clientReferenceId? }
 */
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json(
      { error: 'Stripe is not configured' },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as CheckoutBody;
    const priceId = body.priceId?.trim();
    if (!priceId) {
      return NextResponse.json(
        { error: 'Missing priceId' },
        { status: 400 }
      );
    }

    const successUrl = body.successPath
      ? `${siteUrl}${body.successPath.startsWith('/') ? body.successPath : `/${body.successPath}`}`
      : `${siteUrl}/?checkout=success`;
    const cancelUrl = body.cancelPath
      ? `${siteUrl}${body.cancelPath.startsWith('/') ? body.cancelPath : `/${body.cancelPath}`}`
      : `${siteUrl}/?checkout=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: body.clientReferenceId ?? undefined,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[stripe checkout]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
