'use client';

import Link from 'next/link';

export default function Disclaimer() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-[var(--accent)] hover:underline text-sm mb-8 inline-block">&larr; Back to BiB</Link>
        <h1 className="text-3xl font-bold mb-2">Disclaimer</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: February 16, 2026</p>

        <div className="space-y-8 text-[var(--text-secondary)] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">1. General Disclaimer</h2>
            <p>
              The information provided on BiB (&quot;Binge it bro&quot;) at bingeitbro.com is for general
              informational and entertainment purposes only. All content on the Service, including movie
              recommendations, ratings, reviews, Group Watch picks, and Weekly Trivia questions, represents
              the personal opinions of individual users or auto-generated content and should not be construed
              as professional advice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">2. No Affiliation</h2>
            <p>
              BiB is an independent platform and is not affiliated with, endorsed by, or sponsored by
              any movie studio, production company, streaming platform, or content provider, including
              but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Netflix, Inc.</li>
              <li>Amazon Prime Video (Amazon.com, Inc.)</li>
              <li>Disney+ Hotstar (The Walt Disney Company)</li>
              <li>SonyLiv (Sony Pictures Networks India)</li>
              <li>Zee5 (Zee Entertainment Enterprises)</li>
              <li>Jio Cinema (Reliance Industries)</li>
              <li>Apple TV+ (Apple Inc.)</li>
              <li>YouTube (Google LLC / Alphabet Inc.)</li>
              <li>Aha (Arha Media &amp; Broadcasting Pvt Ltd)</li>
              <li>And other OTT platforms (20+ total)</li>
            </ul>
            <p className="mt-2">
              All product names, logos, and brands are property of their respective owners. Use of these
              names, logos, and brands does not imply endorsement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">3. Streaming Availability</h2>
            <p>
              Streaming availability information displayed on BiB is sourced from TMDB and may not
              always be accurate or up to date. Content availability varies by region and is subject
              to change at any time by the streaming platforms. We do not guarantee that any title
              will be available on any particular platform at any given time.
            </p>
            <p className="mt-2">
              We recommend verifying content availability directly on the streaming platform before
              subscribing or making purchasing decisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">4. User-Generated Content</h2>
            <p>
              Recommendations, reviews, ratings, notes, Group Watch picks, and trivia scores on BiB are
              submitted by users and represent their personal opinions. BiB does not endorse, verify, or
              guarantee the accuracy of any user-generated content. Users should exercise their own judgment
              when following recommendations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">5. External Links</h2>
            <p>
              The Service may contain links to external websites, including streaming platforms and
              movie databases. These links are provided for convenience only. We do not control the
              content of external sites and are not responsible for their content, privacy practices,
              or availability.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">6. TMDB Data</h2>
            <p>
              This product uses the TMDB API but is not endorsed or certified by TMDB. Movie and series
              information, including titles, descriptions, release dates, ratings, and poster images, is
              sourced from The Movie Database. While we strive to display accurate information, we cannot
              guarantee its completeness or accuracy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">7. Weekly Trivia</h2>
            <p>
              The Weekly Trivia feature generates questions based on movie and series data. Questions are
              auto-generated and may occasionally contain inaccuracies. Trivia scores and leaderboard
              rankings are for entertainment purposes only and do not represent any form of competition
              with prizes or rewards.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">8. Email Notifications</h2>
            <p>
              BiB sends email notifications for scheduled watch reminders, friend recommendations, group
              invites, and birthday celebrations. These emails are transactional in nature and are sent
              based on your activity and preferences. You can manage your notification settings through
              your profile.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">9. No Warranty</h2>
            <p>
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS.
              WE MAKE NO REPRESENTATIONS OR WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, REGARDING
              THE OPERATION OF THE SERVICE OR THE INFORMATION, CONTENT, OR MATERIALS INCLUDED ON
              THE SERVICE. TO THE FULL EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS
              OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">10. Limitation of Liability</h2>
            <p>
              BiB and its operators will not be liable for any damages of any kind arising from the
              use of the Service, including but not limited to direct, indirect, incidental, punitive,
              and consequential damages. This includes, without limitation, damages resulting from
              inaccurate streaming availability information, user-generated content, or reliance on
              any information obtained through the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">11. Contact Us</h2>
            <p>
              If you have any questions about this Disclaimer, please contact us at:
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
          <Link href="/cookies" className="hover:underline">Cookie Policy</Link>
          {' | '}
          <Link href="/copyright" className="hover:underline">Copyright</Link>
        </div>
      </div>
    </div>
  );
}
