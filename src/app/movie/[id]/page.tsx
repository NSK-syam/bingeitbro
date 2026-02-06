import { Suspense } from 'react';
import data from '@/data/recommendations.json';
import MoviePageClient from './MoviePageClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export function generateStaticParams() {
  const recommendations = data.recommendations as { id: string }[];
  return recommendations.map((r) => ({ id: r.id }));
}

export default async function MoviePage({ params }: PageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-[var(--accent)] text-xl animate-pulse">Loading...</div>
      </div>
    }>
      <MoviePageClient id={id} />
    </Suspense>
  );
}
