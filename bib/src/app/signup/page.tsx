'use client';

import { Suspense } from 'react';
import { CinematicAuth } from '@/components/CinematicAuth';
import { useAuth, MovieBackground } from '@/components';
import { BibSplash } from '@/components/BibSplash';

function SignupContent() {
  const { user } = useAuth();

  if (user) {
    // If the user is already logged in, the CinematicAuth will redirect them.
  }

  return (
    <div className="min-h-screen relative bg-black">
      <BibSplash enabled={!user} />
      <MovieBackground />
      <CinematicAuth />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupContent />
    </Suspense>
  );
}
