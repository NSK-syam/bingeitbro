import { notFound } from 'next/navigation';
import { EmptyState } from '@/components/app/ScreenHeader';
import { AppButton } from '@/components/app/AppButton';
import { ChevronLeftIcon } from '@/components/app/icons';

// Title detail (movie or show): replaced by the real screen in PR 4.
export default async function AppTitlePage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== 'movie' && kind !== 'show') notFound();
  const webPath = `/${kind}/${encodeURIComponent(id)}`;
  return (
    <>
      <div className="px-4 pt-3">
        <AppButton href="/app" variant="secondary" aria-label="Back">
          <ChevronLeftIcon size={20} />
        </AppButton>
      </div>
      <EmptyState
        title="Coming soon"
        body="The new title page arrives in a later update."
        action={<AppButton href={webPath} variant="secondary">Open the current page</AppButton>}
      />
    </>
  );
}
