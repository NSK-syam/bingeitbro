import type { Metadata } from 'next';
import HomeGate from '@/features/home/HomeGate';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  title: 'Movie Recommendations From Friends | Find What to Watch Next',
  description:
    'Explore movie recommendations from friends, trending picks, and watchlist tools to find what to watch next faster. Preview BiB and start free.',
  keywords: [
    'movie recommendations',
    'movie recommendations from friends',
    'what to watch next',
    'friend movie recommendations',
    'movie watchlist app',
  ],
  openGraph: {
    title: 'Movie Recommendations From Friends | Find What to Watch Next',
    description:
      'Explore movie recommendations from friends, trending picks, and watchlist tools to find what to watch next faster. Preview BiB and start free.',
    url: '/',
    type: 'website',
  },
  twitter: {
    title: 'Movie Recommendations From Friends | Find What to Watch Next',
    description:
      'Explore movie recommendations from friends, trending picks, and watchlist tools to find what to watch next faster. Preview BiB and start free.',
  },
};

export default function Page() {
  return <HomeGate />;
}
