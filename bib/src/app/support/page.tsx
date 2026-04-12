'use client';

import Link from 'next/link';

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Link href="/" className="mb-8 inline-block text-sm text-[var(--accent)] hover:underline">
          &larr; Back to BiB
        </Link>

        <h1 className="text-3xl font-bold">Support</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Last updated: March 25, 2026</p>

        <div className="mt-8 space-y-8 text-[var(--text-secondary)] leading-relaxed">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">Contact</h2>
            <p>
              Email:{' '}
              <a className="text-[var(--accent)] hover:underline" href="mailto:bingeitbroo@gmail.com">
                bingeitbroo@gmail.com
              </a>
            </p>
            <p className="mt-2">
              We monitor this inbox for app support, App Review requests, legal notices, and account issues.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">What BiB Does</h2>
            <p>
              BiB is a movie and TV discovery and social recommendation app. It helps you browse titles, save picks to your watchlist,
              send and receive recommendations, chat with friends, join group watch flows, play weekly trivia, and schedule reminders for what to watch next.
              BiB does not stream movies or shows.
            </p>
            <p className="mt-2">
              Your birthday is optional profile information. Your watchlist is account-backed, so it stays with your account across signed-in sessions until you remove items or delete the account.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">Account Deletion</h2>
            <p>
              If you want to delete your account, open the native app, go to the <strong>Profile</strong> tab, and use the
              <strong> Delete Account &amp; Data</strong> action. If you use the website, sign in and use the account deletion controls from your account settings there. Deletion revokes active BiB sessions and removes account-backed data, including your server-stored watchlist. If you cannot access the app or site, email support and include the account email address you want removed.
            </p>
            <p className="mt-2">
              If you used Sign in with Apple, account deletion still removes your BiB account. The current shipped Sign in with Apple flow usually does not retain the short-lived Apple token material required for automatic Apple authorization revocation, so you may also need to remove BiB manually from the Sign in with Apple section of your Apple account settings.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">Safety and Abuse Reporting</h2>
            <p>
              You can block another user from their profile page. You can also report abusive profiles and messages
              from the app. We review those reports through our support inbox and take action when content violates
              our rules.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">Legal</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href="/privacy" className="text-[var(--accent)] hover:underline">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-[var(--accent)] hover:underline">
                Terms of Service
              </Link>
              <Link href="/cookies" className="text-[var(--accent)] hover:underline">
                Cookie Policy
              </Link>
              <Link href="/copyright" className="text-[var(--accent)] hover:underline">
                Copyright
              </Link>
              <Link href="/disclaimer" className="text-[var(--accent)] hover:underline">
                Disclaimer
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
