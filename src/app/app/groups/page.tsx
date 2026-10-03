import { EmptyState, ScreenHeader } from '@/components/app/ScreenHeader';
import { AppButton } from '@/components/app/AppButton';

// Groups: replaced by the real screen in a later redesign PR.
export default function AppGroupsPage() {
  return (
    <>
      <ScreenHeader title="Groups" />
      <EmptyState
        title="Coming soon"
        body="Watch groups, voting and movie nights arrive here in a later update."
        action={<AppButton href="/movies" variant="secondary">Use the current version</AppButton>}
      />
    </>
  );
}
