'use client';

import Link from 'next/link';

export default function Copyright() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-[var(--accent)] hover:underline text-sm mb-8 inline-block">&larr; Back to BiB</Link>
        <h1 className="text-3xl font-bold mb-2">Copyright Policy &amp; DMCA</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: February 6, 2025</p>

        <div className="space-y-8 text-[var(--text-secondary)] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">1. Copyright Notice</h2>
            <p>
              &copy; {new Date().getFullYear()} BiB (Binge it bro). All rights reserved.
            </p>
            <p className="mt-2">
              The BiB name, logo, design, and original code are the intellectual property of BiB.
              Unauthorized reproduction, distribution, or modification of the Service or its content
              is prohibited without prior written consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">2. Third-Party Content</h2>
            <p>
              BiB displays movie and series information sourced from third-party providers. We acknowledge
              and respect the intellectual property rights of all content owners:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong>Movie Posters, Images &amp; Metadata:</strong> Provided by
                TMDB (The Movie Database). This product uses the TMDB API but is not endorsed or
                certified by TMDB. All movie posters and images are the property of their
                respective studios and distributors.
              </li>
              <li>
                <strong>Streaming Platform Logos &amp; Names:</strong> Netflix, Amazon Prime Video,
                Disney+ Hotstar, SonyLiv, Zee5, Jio Cinema, Apple TV+, and YouTube are trademarks
                of their respective owners. BiB is not affiliated with, endorsed by, or sponsored
                by any of these platforms.
              </li>
              <li>
                <strong>User Content:</strong> Recommendations, personal notes, and reviews submitted
                by users remain the intellectual property of the respective users.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">3. TMDB Attribution</h2>
            <div className="bg-white/5 rounded-lg p-4 mt-2">
              <p>
                This product uses the TMDB API but is not endorsed or certified by TMDB.
                Movie and series data, including titles, descriptions, posters, and streaming
                availability, is provided by The Movie Database (TMDB).
              </p>
              <p className="mt-2">
                For more information about TMDB, visit{' '}
                <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline">
                  www.themoviedb.org
                </a>
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">4. DMCA Notice &amp; Takedown</h2>
            <p>
              We respect the intellectual property rights of others. If you believe that any content
              on BiB infringes your copyright, you may submit a DMCA takedown notice containing the
              following information:
            </p>
            <ol className="list-decimal pl-6 space-y-2 mt-2">
              <li>
                A physical or electronic signature of the copyright owner or a person authorized
                to act on their behalf.
              </li>
              <li>
                Identification of the copyrighted work claimed to have been infringed.
              </li>
              <li>
                Identification of the material that is claimed to be infringing, including the URL
                or other specific location on the Service where it appears.
              </li>
              <li>
                Your contact information, including name, address, telephone number, and email address.
              </li>
              <li>
                A statement that you have a good-faith belief that the use of the material is not
                authorized by the copyright owner, its agent, or the law.
              </li>
              <li>
                A statement, under penalty of perjury, that the information in the notification is
                accurate and that you are the copyright owner or authorized to act on behalf of the owner.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">5. Counter-Notification</h2>
            <p>
              If you believe your content was removed by mistake or misidentification, you may file
              a counter-notification with us including:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Your physical or electronic signature</li>
              <li>Identification of the material that was removed and the location where it appeared</li>
              <li>A statement under penalty of perjury that you have a good-faith belief the material was removed by mistake</li>
              <li>Your name, address, and telephone number</li>
              <li>A statement that you consent to the jurisdiction of the federal court in your district</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">6. Repeat Infringers</h2>
            <p>
              In accordance with the DMCA, we will terminate the accounts of users who are determined
              to be repeat infringers. We reserve the right to remove any content and terminate any
              account at our sole discretion.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">7. Fair Use</h2>
            <p>
              BiB displays movie metadata and poster images for the purpose of enabling user
              recommendations and reviews. We believe this constitutes fair use under applicable
              copyright law, as it is transformative, non-commercial in nature, and does not serve
              as a substitute for the original works.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">8. Contact for Copyright Matters</h2>
            <p>
              To submit a DMCA notice or for any copyright-related inquiries, please contact our
              designated copyright agent at:
            </p>
            <div className="mt-2">
              <p className="font-medium">BiB Copyright Agent</p>
              <p>Email: bingeitbro@gmail.com</p>
              <p>Subject Line: DMCA Notice - [Brief Description]</p>
            </div>
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
          <Link href="/disclaimer" className="hover:underline">Disclaimer</Link>
        </div>
      </div>
    </div>
  );
}
