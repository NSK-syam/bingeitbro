import { Suspense } from 'react';
import ShowPageClient from './ShowPageClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  // Fallback page for dynamic TMDB/DB ids; Vercel rewrites unknown /show/:id to this
  return [{ id: 'fallback' }];
}

export default async function ShowPage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
          <div className="text-[var(--accent)] text-xl animate-pulse">Loading...</div>
        </div>
      }
    >
      <ShowPageClient id={id} />
    </Suspense>
  );
}
