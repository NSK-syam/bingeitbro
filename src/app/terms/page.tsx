'use client';

import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-[var(--accent)] hover:underline text-sm mb-8 inline-block">&larr; Back to BiB</Link>
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: February 20, 2026</p>

        <div className="space-y-8 text-[var(--text-secondary)] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using BiB (&quot;Binge it bro&quot;) at bingeitbro.com (the &quot;Service&quot;),
              you agree to be bound by these Terms of Service (&quot;Terms&quot;). If you do not agree to these
              Terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">2. Description of Service</h2>
            <p>
              BiB is a social movie and series recommendation platform where users can share, discover,
              and track OTT (Over-The-Top) streaming content recommendations from friends. The Service
              includes features such as movie recommendations, friend connections, watchlists, nudges,
              streaming availability information, Group Watch with voting, scheduled watch reminders,
              email notifications, Weekly Trivia with leaderboards, and multi-language support.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">3. User Accounts</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must be at least 13 years old to create an account.</li>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>You must provide accurate and complete information when creating an account.</li>
              <li>You are responsible for all activities that occur under your account.</li>
              <li>You must notify us immediately of any unauthorized use of your account.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">4. User Content</h2>
            <h3 className="text-lg font-medium text-[var(--text-primary)] mt-4 mb-2">4.1 Your Content</h3>
            <p>
              You retain ownership of the content you submit, including recommendations, personal notes,
              ratings, mood tags, Group Watch picks, and trivia participation. By posting content on the
              Service, you grant us a non-exclusive, worldwide, royalty-free license to use, display, and
              distribute your content in connection with the Service.
            </p>

            <h3 className="text-lg font-medium text-[var(--text-primary)] mt-4 mb-2">4.2 Content Standards</h3>
            <p>You agree not to post content that:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Is unlawful, harmful, threatening, abusive, harassing, defamatory, or obscene</li>
              <li>Infringes on the intellectual property rights of others</li>
              <li>Contains spam, advertisements, or unauthorized promotional material</li>
              <li>Impersonates another person or entity</li>
              <li>Contains malware, viruses, or harmful code</li>
              <li>Violates the privacy of others</li>
            </ul>

            <h3 className="text-lg font-medium text-[var(--text-primary)] mt-4 mb-2">4.3 Content Removal</h3>
            <p>
              We reserve the right to remove any content that violates these Terms or that we find
              objectionable, without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Use the Service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Use automated tools or bots to access the Service</li>
              <li>Scrape, crawl, or collect data from the Service without permission</li>
              <li>Circumvent any security features of the Service</li>
              <li>Use the Service to send unsolicited messages or spam</li>
              <li>Create multiple accounts for deceptive or abusive purposes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">6. Third-Party Services</h2>
            <p>
              The Service integrates with third-party services including:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>TMDB (The Movie Database):</strong> For movie and series metadata. BiB is not endorsed or certified by TMDB.</li>
              <li><strong>Streaming Platforms:</strong> We display links to streaming services (Netflix, Prime Video, Disney+ Hotstar, Aha, and 20+ others). We are not affiliated with these platforms and do not guarantee content availability.</li>
              <li><strong>Google:</strong> For OAuth authentication.</li>
              <li><strong>Google AdSense:</strong> For sponsored ad delivery and measurement.</li>
              <li><strong>Cloudflare:</strong> For CDN, edge caching, and TMDB proxy services to improve global performance.</li>
              <li><strong>Supabase:</strong> For database hosting, authentication, and real-time features.</li>
            </ul>
            <p className="mt-2">
              We are not responsible for the content, privacy policies, or practices of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">7. Intellectual Property</h2>
            <p>
              The Service, including its design, code, logos, and branding (excluding user content and
              third-party materials), is owned by BiB and protected by intellectual property laws.
              You may not copy, modify, distribute, or reverse-engineer any part of the Service without
              our written permission.
            </p>
            <p className="mt-2">
              Movie posters, images, and metadata displayed on the Service are provided by TMDB and are
              the property of their respective owners. All trademarks of streaming platforms mentioned
              belong to their respective owners.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">8. Disclaimer of Warranties</h2>
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND,
              EITHER EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
              ERROR-FREE, OR SECURE. WE DO NOT GUARANTEE THE ACCURACY OR COMPLETENESS OF ANY
              CONTENT, INCLUDING STREAMING AVAILABILITY INFORMATION.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">9. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, BIB AND ITS OPERATORS SHALL NOT BE LIABLE FOR ANY
              INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS
              OR REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL,
              OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE SERVICE.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">10. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless BiB and its operators from any claims, damages,
              losses, or expenses (including reasonable attorney&apos;s fees) arising from your use of the
              Service or violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">11. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service at any time, with or without cause,
              with or without notice. Upon termination, your right to use the Service will immediately
              cease. You may also delete your account at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">12. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. Changes will be effective when
              posted on this page. Your continued use of the Service after changes are posted
              constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">13. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with applicable laws,
              without regard to conflict of law provisions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">14. Contact Us</h2>
            <p>
              If you have any questions about these Terms, please contact us at:
            </p>
            <p className="mt-2 font-medium">bingeitbro@gmail.com</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 text-center text-sm text-[var(--text-muted)]">
          <Link href="/" className="hover:underline">BiB - Binge it bro</Link>
          {' | '}
          <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
          {' | '}
          <Link href="/cookies" className="hover:underline">Cookie Policy</Link>
          {' | '}
          <Link href="/copyright" className="hover:underline">Copyright</Link>
          {' | '}
          <Link href="/disclaimer" className="hover:underline">Disclaimer</Link>
        </div>
      </div>
    </div>
  );
}
