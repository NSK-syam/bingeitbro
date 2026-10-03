'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { EmptyState, ScreenHeader } from '@/components/app/ScreenHeader';
import { AppButton } from '@/components/app/AppButton';

// Me: replaced by the real screen in PR 5. Sign out stays reachable meanwhile.
export default function AppMePage() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <>
      <ScreenHeader title="Me" />
      <EmptyState
        title="Coming soon"
        body="Your profile, top 10 and settings arrive here in a later update."
        action={
          <div className="flex flex-wrap gap-2.5">
            {user ? <AppButton href={`/profile/${user.id}`} variant="secondary">Open my profile</AppButton> : null}
            <AppButton
              variant="danger"
              onClick={async () => {
                await signOut();
                router.replace('/app/welcome');
              }}
            >
              Sign out
            </AppButton>
          </div>
        }
      />
    </>
  );
}
