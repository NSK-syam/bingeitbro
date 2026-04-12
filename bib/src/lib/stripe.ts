import Stripe from 'stripe';

const secretKey = (process.env.STRIPE_SECRET_KEY ?? '').trim();

/** Server-side Stripe instance. Only use in API routes or server components. */
export const stripe: Stripe | null = secretKey
  ? new Stripe(secretKey)
  : null;

/** Whether Stripe is configured (e.g. for feature flags). */
export const isStripeConfigured = Boolean(secretKey);
