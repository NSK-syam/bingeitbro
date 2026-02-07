'use client';

import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/" className="text-[var(--accent)] hover:underline text-sm mb-8 inline-block">&larr; Back to BiB</Link>
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">Last updated: February 6, 2025</p>

        <div className="space-y-8 text-[var(--text-secondary)] leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">1. Introduction</h2>
            <p>
              Welcome to BiB (&quot;Binge it bro&quot;). This Privacy Policy explains how we collect, use, disclose,
              and safeguard your information when you visit our website at bingeitbro.com (the &quot;Service&quot;).
              Please read this policy carefully. By using the Service, you agree to the collection and use of
              information in accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">2. Information We Collect</h2>

            <h3 className="text-lg font-medium text-[var(--text-primary)] mt-4 mb-2">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account Information:</strong> When you create an account, we collect your name, email address, and username.</li>
              <li><strong>Profile Information:</strong> Your chosen avatar (emoji) and display name.</li>
              <li><strong>Recommendations:</strong> Movies and series you recommend, including personal notes, mood tags, ratings, and watch context.</li>
              <li><strong>Social Data:</strong> Your friends list, nudges sent and received, and friend-to-friend recommendations.</li>
              <li><strong>Watchlist:</strong> Movies and series you save to your watchlist.</li>
            </ul>

            <h3 className="text-lg font-medium text-[var(--text-primary)] mt-4 mb-2">2.2 Information Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Authentication Data:</strong> Session tokens and authentication cookies necessary to keep you signed in.</li>
              <li><strong>Local Storage Data:</strong> We store certain preferences locally in your browser, including your watched movies list and UI preferences. This data stays on your device and is not transmitted to our servers.</li>
            </ul>

            <h3 className="text-lg font-medium text-[var(--text-primary)] mt-4 mb-2">2.3 Information from Third Parties</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Google OAuth:</strong> If you sign in with Google, we receive your name and email address from Google. We do not access any other Google account data.</li>
              <li><strong>TMDB (The Movie Database):</strong> We use TMDB&apos;s API to fetch movie metadata, posters, and streaming availability. TMDB does not receive any of your personal information from us.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Create and manage your account</li>
              <li>Display your movie recommendations to your friends and the community</li>
              <li>Enable the friends and social features of the platform</li>
              <li>Send nudge notifications between friends</li>
              <li>Show relevant streaming availability for recommended titles</li>
              <li>Improve and maintain the Service</li>
              <li>Communicate with you about your account or the Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">4. Data Storage and Security</h2>
            <p>
              Your data is stored securely using Supabase, a managed database platform with enterprise-grade security.
              We implement row-level security policies to ensure users can only access data they are authorized to view.
              Authentication is handled via secure PKCE flow, and all data is transmitted over HTTPS.
            </p>
            <p className="mt-2">
              While we take reasonable measures to protect your information, no method of transmission over the
              Internet or method of electronic storage is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">5. Data Sharing and Disclosure</h2>
            <p>We do not sell, trade, or rent your personal information. We may share your information in the following cases:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Public Recommendations:</strong> Your movie recommendations, username, and avatar are visible to other users of the Service.</li>
              <li><strong>Friends:</strong> Your friends can see your recommendations and send you nudges.</li>
              <li><strong>Service Providers:</strong> We use Supabase for database hosting, Vercel for website hosting, and TMDB for movie data. These providers process data as necessary to provide their services.</li>
              <li><strong>Legal Requirements:</strong> We may disclose your information if required by law, regulation, or legal process.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">6. Cookies and Local Storage</h2>
            <p>
              We use essential cookies and browser local storage for authentication and basic functionality.
              We do not use tracking cookies, advertising cookies, or any third-party analytics services.
              For more details, see our <Link href="/cookies" className="text-[var(--accent)] hover:underline">Cookie Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong>Correction:</strong> Update or correct your personal information through your profile settings.</li>
              <li><strong>Deletion:</strong> Request deletion of your account and associated data by contacting us.</li>
              <li><strong>Portability:</strong> Request your data in a portable format.</li>
              <li><strong>Withdraw Consent:</strong> You can stop using the Service at any time and request account deletion.</li>
            </ul>
            <p className="mt-2">
              If you are a resident of the European Economic Area (EEA), you have additional rights under the
              General Data Protection Regulation (GDPR). If you are a California resident, you have rights under
              the California Consumer Privacy Act (CCPA).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">8. Children&apos;s Privacy</h2>
            <p>
              The Service is not intended for children under the age of 13. We do not knowingly collect personal
              information from children under 13. If we become aware that we have collected personal data from a
              child under 13, we will take steps to delete that information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">9. Data Retention</h2>
            <p>
              We retain your personal information for as long as your account is active or as needed to provide
              you the Service. If you delete your account, we will delete your personal data within 30 days,
              except where we are required to retain it for legal or regulatory purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">10. International Data Transfers</h2>
            <p>
              Your information may be transferred to and maintained on servers located outside of your state,
              province, country, or other governmental jurisdiction where data protection laws may differ.
              By using the Service, you consent to such transfers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">11. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting
              the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-3">12. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or wish to exercise your data rights,
              please contact us at:
            </p>
            <p className="mt-2 font-medium">bingeitbro@gmail.com</p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/5 text-center text-sm text-[var(--text-muted)]">
          <Link href="/" className="hover:underline">BiB - Binge it bro</Link>
          {' | '}
          <Link href="/terms" className="hover:underline">Terms of Service</Link>
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
