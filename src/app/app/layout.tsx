import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Suspense } from 'react';
import { AppShell } from '@/components/app/AppShell';
import './app.css';

// Bundled locally (see ./fonts/LICENSE.md) so builds never fetch fonts from the network.
const display = localFont({
  src: './fonts/Archivo-Variable.woff2',
  variable: '--font-app-display',
  weight: '400 900',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

const ui = localFont({
  src: './fonts/Geist-Variable.woff2',
  variable: '--font-app-ui',
  weight: '400 700',
  display: 'swap',
});

// The native app shell is never linked from the website and must not be indexed.
export const metadata: Metadata = {
  title: 'BingeItBro',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#0b0b0e',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`bib-app ${display.variable} ${ui.variable}`}>
      <Suspense fallback={null}>
        <AppShell>{children}</AppShell>
      </Suspense>
    </div>
  );
}
