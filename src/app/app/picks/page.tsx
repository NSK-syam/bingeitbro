import { EmptyState, ScreenHeader } from '@/components/app/ScreenHeader';
import { AppButton } from '@/components/app/AppButton';

// Picks: replaced by the real screen in a later redesign PR.
export default function AppPicksPage() {
  return (
    <>
      <ScreenHeader title="Picks" />
      <EmptyState
        title="Coming soon"
        body="Your friends' recommendations arrive here in a later update."
        action={<AppButton href="/?view=friends" variant="secondary">Use the current version</AppButton>}
      />
    </>
  );
}
