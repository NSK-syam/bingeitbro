'use client';

import Link from 'next/link';

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-[var(--accent)] hover:underline text-sm mb-8 inline-block">&larr; Back to BiB</Link>
        <h1 className="text-3xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: February 20, 2026</p>

        <div className="space-y-8 text-[var(--text-secondary)] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">1. What Are Cookies</h2>
            <p>
              Cookies are small text files stored on your device when you visit a website. They help
              websites remember your preferences and provide essential functionality. Local storage is
              a similar technology that allows websites to store data in your browser.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">2. How We Use Cookies</h2>
            <p>
              BiB uses <strong>essential cookies</strong> and <strong>local storage</strong> that are
              strictly necessary for the Service to function. When sponsored placements are shown, Google AdSense can set
              advertising-related cookies or identifiers for ad delivery and measurement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">3. Cookies We Use</h2>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-2 text-[var(--text-primary)]">Name</th>
                    <th className="text-left py-3 px-2 text-[var(--text-primary)]">Purpose</th>
                    <th className="text-left py-3 px-2 text-[var(--text-primary)]">Duration</th>
                    <th className="text-left py-3 px-2 text-[var(--text-primary)]">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">sb-*-auth-token</td>
                    <td className="py-3 px-2">Supabase authentication session. Keeps you signed in.</td>
                    <td className="py-3 px-2">Session</td>
                    <td className="py-3 px-2">Essential</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">Google AdSense cookies</td>
                    <td className="py-3 px-2">Advertising delivery and measurement by Google AdSense on sponsored placements.</td>
                    <td className="py-3 px-2">Google-defined</td>
                    <td className="py-3 px-2">Advertising (optional)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">4. Local Storage We Use</h2>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-2 text-[var(--text-primary)]">Key</th>
                    <th className="text-left py-3 px-2 text-[var(--text-primary)]">Purpose</th>
                    <th className="text-left py-3 px-2 text-[var(--text-primary)]">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">cinema-chudu-watched</td>
                    <td className="py-3 px-2">Stores which movies you&apos;ve marked as watched. Stays on your device only.</td>
                    <td className="py-3 px-2">Functional</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">cinema-chudu-hero-day</td>
                    <td className="py-3 px-2">Tracks which day it is to rotate the welcome message.</td>
                    <td className="py-3 px-2">Functional</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">cinema-chudu-hero-visit</td>
                    <td className="py-3 px-2">Visit count for rotating welcome messages.</td>
                    <td className="py-3 px-2">Functional</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">today-releases-last-shown</td>
                    <td className="py-3 px-2">Remembers when you last saw the new releases popup.</td>
                    <td className="py-3 px-2">Functional</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">bib-trivia-*</td>
                    <td className="py-3 px-2">Stores your Weekly Trivia progress, scores, and streak data.</td>
                    <td className="py-3 px-2">Functional</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-2 font-mono text-xs">bib-group-watch-*</td>
                    <td className="py-3 px-2">Tracks Group Watch session state and voting preferences.</td>
                    <td className="py-3 px-2">Functional</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">5. What We Don&apos;t Use</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>No third-party advertising network scripts other than Google AdSense</li>
              <li>No analytics cookies (e.g., Google Analytics)</li>
              <li>No social media tracking pixels</li>
              <li>No fingerprinting technologies operated by BiB itself</li>
              <li>No cross-site tracking technologies operated by BiB itself</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">6. Managing Cookies</h2>
            <p>
              You can manage or delete cookies through your browser settings. Since we only use essential
              cookies for authentication, disabling cookies may prevent you from signing in to the Service.
            </p>
            <p className="mt-2">
              Local storage data can be cleared through your browser&apos;s developer tools or by clearing
              site data in your browser settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">7. Changes to This Policy</h2>
            <p>
              We may update this Cookie Policy from time to time. Any changes will be posted on this page
              with an updated date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">8. Contact Us</h2>
            <p>
              If you have questions about our use of cookies, please contact us at:
            </p>
            <p className="mt-2 font-medium">bingeitbro@gmail.com</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 text-center text-sm text-[var(--text-muted)]">
          <Link href="/" className="hover:underline">BiB - Binge it bro</Link>
          {' | '}
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          {' | '}
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
          {' | '}
          <Link href="/copyright" className="hover:underline">Copyright</Link>
          {' | '}
          <Link href="/disclaimer" className="hover:underline">Disclaimer</Link>
        </div>
      </div>
    </div>
  );
}
