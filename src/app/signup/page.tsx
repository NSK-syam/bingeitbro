'use client';

import { useRouter } from 'next/navigation';
import { AuthModal, BibSplash, MovieBackground, useAuth } from '@/components';

export default function SignupPage() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <div className="min-h-screen relative">
      <BibSplash enabled={!user} />
      <MovieBackground />
      <AuthModal
        isOpen
        initialMode="signup"
        onClose={() => router.push('/')}
      />
    </div>
  );
}
