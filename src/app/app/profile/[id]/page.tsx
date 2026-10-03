import { EmptyState } from '@/components/app/ScreenHeader';
import { AppButton } from '@/components/app/AppButton';

// Profile: replaced by the real screen in PR 5.
export default async function AppProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <EmptyState
      title="Coming soon"
      body="The new profile page arrives in a later update."
      action={<AppButton href={`/profile/${encodeURIComponent(id)}`} variant="secondary">Open the current profile</AppButton>}
    />
  );
}
