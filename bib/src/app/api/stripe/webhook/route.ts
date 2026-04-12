import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';

const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();

/**
 * POST /api/stripe/webhook
 * Stripe webhook endpoint. Configure this URL in Stripe Dashboard → Developers → Webhooks.
 * Requires STRIPE_WEBHOOK_SECRET (whsec_...) in env.
 */
export async function POST(request: Request) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured' },
      { status: 503 }
    );
  }

  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe webhook] signature verification failed:', message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // e.g. fulfill order, grant access, update DB
        if (session.client_reference_id) {
          // await updateOrderOrSubscription(session.client_reference_id, session);
        }
        break;
      }
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        // Handle payment intents if you use them
        break;
      default:
        // Unhandled event type
        break;
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] handler error:', err);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}
